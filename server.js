const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
require('dotenv').config();
const querystring = require('querystring');
const { Server } = require('socket.io');
const cors = require('cors');
const ModemService = require('./modem-service');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeIp(val) {
    if (!val) return '';
    // If it's a URL, extract just the hostname/IP
    if (val.startsWith('http')) {
        try {
            const url = new URL(val);
            return url.hostname;
        } catch (e) {
            return val.replace(/^https?:\/\//, '').split('/')[0];
        }
    }
    return val.trim().replace(/[^\d.COMcom:]/g, "");
}

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error('💥 [CRITICAL] Uncaught Exception:', err.message);
    if (err.stack) console.error(err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- TELEGRAM SETTINGS ---
function sendTelegram(msg, targetId = null, buttons = null, replyKeyboard = null) {
    const token = settings.tgToken;
    const chatId = targetId || settings.tgChatId;
    if (!token || !chatId || chatId === 'WEB_PORTAL') {
        if (chatId !== 'WEB_PORTAL') console.log('🚫 TG Send Skip: Token or ChatID missing.');
        else console.log('🌐 Web Portal Action: ' + msg.replace(/<[^>]*>/g, ''));
        return;
    }
    
    const payload = {
        chat_id: chatId,
        text: msg,
        parse_mode: 'HTML'
    };

    if (buttons && buttons.length > 0) {
        payload.reply_markup = {
            inline_keyboard: buttons.map(row => row.map(btn => ({
                text: btn.text,
                callback_data: btn.data
            })))
        };
    } else if (replyKeyboard) {
        payload.reply_markup = replyKeyboard;
    }

    const data = JSON.stringify(payload);
    const options = {
        hostname: 'api.telegram.org', port: 443, method: 'POST',
        path: `/bot${token}/sendMessage`,
        timeout: 15000,
        headers: { 
            'Content-Type': 'application/json', 
            'Content-Length': Buffer.byteLength(data),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
    };
    const req = https.request(options, (res) => {
        if (res.statusCode !== 200) console.log(`❌ TG Send Error: Status ${res.statusCode}`);
        res.on('data', () => {}); 
    });
    req.on('error', (e) => console.error('‼️ TG Network Error:', e.message));
    req.write(data);
    req.end();
}

function sendTelegramFile(filePath, chatId = null, type = 'document') {
    const token = settings.tgToken;
    const targetId = chatId || settings.tgChatId;
    if (!token || !targetId || targetId === 'WEB_PORTAL') return;

    const method = type === 'photo' ? 'sendPhoto' : 'sendDocument';
    const boundary = '----WebKitFormBoundary' + crypto.randomBytes(10).toString('hex');
    const fileName = path.basename(filePath);
    
    try {
        const fileData = fs.readFileSync(filePath);
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="${type}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;
        const payload = Buffer.concat([
            Buffer.from(header),
            fileData,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${targetId}`),
            Buffer.from(footer)
        ]);

        const options = {
            hostname: 'api.telegram.org', port: 443, method: 'POST',
            path: `/bot${token}/${method}`,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        };

        const req = https.request(options, (res) => {
            res.on('data', () => {});
        });
        req.on('error', (e) => console.error('‼️ TG File Error:', e.message));
        req.write(payload);
        req.end();
    } catch (e) { console.error('File Read Error:', e.message); }
}

let lastUpdateId = 0;
let tgPollingTimeout = null;

function pollTelegram() {
    if (tgPollingTimeout) clearTimeout(tgPollingTimeout);
    
    const token = settings.tgToken;
    if (!token || token.length < 10) {
        tgPollingTimeout = setTimeout(pollTelegram, 5000);
        return;
    }
    
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
    const options = {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 25000
    };

    const req = https.get(url, options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.ok && data.result) {
                    for (let update of data.result) {
                        lastUpdateId = update.update_id;
                        try {
                            if (update.message) handleTgMessage(update.message);
                            if (update.callback_query) handleTgCallback(update.callback_query);
                        } catch (err) { console.error('❌ [TG] Handler Error:', err.message); }
                    }
                }
            } catch (e) { /* Parse error */ }
            tgPollingTimeout = setTimeout(pollTelegram, 1000);
        });
    });
    
    if (lastUpdateId % 20 === 0 && lastUpdateId !== 0) console.log('💓 [TG] Connection stable...');
    
    req.on('timeout', () => { req.destroy(); tgPollingTimeout = setTimeout(pollTelegram, 1000); });
    req.on('error', (e) => {
        // Only log errors that are not timeouts to avoid spam
        if (!e.message.includes('timeout') && !e.message.includes('ECONNREFUSED') && !e.message.includes('ECONNRESET')) {
            console.error('‼️ [TG] Connection Error:', e.message);
        }
        tgPollingTimeout = setTimeout(pollTelegram, 5000);
    });
}

function handleTgCallback(query) {
    const chatId = query.message.chat.id.toString();
    const data = query.data; 
    const adminId = (settings.tgChatId || "").toString().trim();
    if (chatId !== adminId) return;

    // Answer callback to remove loading state in TG
    const token = settings.tgToken;
    https.get(`https://api.telegram.org/bot${token}/answerCallbackQuery?callback_query_id=${query.id}`, () => {});

    if (tgSessions[chatId]) {
        handleTgMessage({ chat: { id: chatId }, text: data });
    } else if (data.startsWith('buy_')) {
        handleBuyCard(chatId, data.replace('buy_', ''));
    }
}

const tgSessions = {}; // Track active USSD sessions

async function handleTgMessage(msg) {
    try {
        if (!msg || !msg.text) return;
        const text = msg.text.trim();
        const chatIdStr = msg.chat.id.toString().trim();
        const adminId = (settings.tgChatId || "").toString().trim();
        
        console.log(`📩 [TG] Message from ${chatIdStr}: ${text}`);

        // 1. Authorization Check
        if (!adminId || chatIdStr !== adminId) {
            const replyData = JSON.parse(fs.readFileSync(AUTO_REPLY_FILE, 'utf8') || '{}');
            sendTelegram(replyData.message || "👋 Bienvenue!", chatIdStr);
            if (adminId) sendTelegram(`👤 Visiteur: <code>${chatIdStr}</code>`, adminId);
            return;
        }

        // 2. USSD Menu Reply (Numeric)
        if (/^\d+$/.test(text) && tgSessions[chatIdStr]) {
            const sess = tgSessions[chatIdStr];
            const mKey = typeof sess === 'string' ? sess : sess.modemKey;
            const modem = activeModems[mKey];
            if (modem && modem.serial?.isOpen) {
                modem.serial.write(`AT+CUSD=1,"${text}"\r\n`);
                return;
            }
        }

        // 3. USSD Direct Start (*...#)
        if (text.startsWith('*') && text.endsWith('#')) {
            let op = text.includes('610') ? 'Mobilis' : (text.includes('710') ? 'Djezzy' : 'Ooredoo');
            const modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
            if (modem) {
                tgSessions[chatIdStr] = { modemKey: modem.key };
                modem.notifyChatId = chatIdStr;
                modem.ussdInProgress = true;
                modem.checkBalance(text);
                return;
            }
        }

        // 4. Offer Inquiry (10 digits)
        const inqMatch = text.match(/^(\d{10})$/);
        if (inqMatch) {
            const phone = inqMatch[1];
            let op = phone.startsWith('05') ? 'Ooredoo' : (phone.startsWith('06') ? 'Mobilis' : 'Djezzy');
            let modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
            if (!modem) modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === 'sama' && m.data.online);
            if (modem) {
                const pin = modem.config.pin || '00000';
                let ussd = (op === 'Mobilis') ? `*610*${phone}#` : (op === 'Ooredoo' ? `*585*${phone}*${pin}#` : `*710*${phone}#`);
                tgSessions[chatIdStr] = { modemKey: modem.key, targetPhone: phone, targetOp: op };
                modem.notifyChatId = chatIdStr;
                modem.ussdInProgress = true;
                modem.checkBalance(ussd);
                return;
            }
        }

        // 5. Flexy Transfer (10 digits * amount)
        const flxMatch = text.match(/^(\d{10})[* ](\d+)$/);
        if (flxMatch) {
            const phone = flxMatch[1], amount = flxMatch[2];
            let op = phone.startsWith('05') ? 'Ooredoo' : (phone.startsWith('06') ? 'Mobilis' : 'Djezzy');
            const modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
            if (modem) {
                const pin = modem.config.pin || '00000';
                let ussd = (op === 'Mobilis') ? `*630*${phone}*04*${amount}*${pin}#` : (op === 'Ooredoo' ? `*580*${phone}*${amount}*${pin}#` : `*710*${phone}*${amount}*${pin}#`);
                sendTelegram(`⏳ Transfert de ${amount} DA vers ${phone}...`);
                modem.ussdInProgress = true; modem.pendingAction = 'Transfer';
                modem.pendingAmount = parseFloat(amount); modem.lastTargetPhone = phone;
                modem.checkBalance(ussd);
                return;
            }
        }

        // 6. System Commands
        const low = text.toLowerCase();
        const menu = {
            keyboard: [
                [{"text": "💰 معرفة الرصيد"}, {"text": "📊 حالة السيرفر"}],
                [{"text": "💳 البطاقات المتوفرة"}, {"text": "🆔 معرفي (ID)"}]
            ],
            resize_keyboard: true,
            is_persistent: true
        };

        if (low.includes('balance') || text.includes('رصيد') || text === '💰 معرفة الرصيد') {
            const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8') || '[]');
            const c = clients.find(cl => cl.id.toString() === chatIdStr);
            if (c) sendTelegram(`💰 Solde: <code>${c.balance.toFixed(2)} DA</code>`, chatIdStr);
            else sendTelegram(`❌ Compte non activé. ID: <code>${chatIdStr}</code>`, chatIdStr);
        } else if (text.includes('/status') || text === '📊 حالة السيرفر') {
            let s = "📊 Status:\n";
            for (let k in activeModems) s += `• ${k}: ${activeModems[k].data.online ? '✅' : '❌'} - ${activeModems[k].data.balance} DA\n`;
            sendTelegram(s, chatIdStr);
        } else if (text.includes('/start')) {
            sendTelegram("👋 Flexy Server Bot prêt.", chatIdStr, null, menu);
        } else if (text.includes('/cards') || text === '💳 البطاقات المتوفرة') {
            sendCardsMenu(chatIdStr);
        } else if (text === '🆔 معرفي (ID)') {
            sendTelegram(`🆔 معرفك (ID) هو:\n<code>${chatIdStr}</code>`, chatIdStr);
        } else {
            sendTelegram("👋 أنت في القائمة الرئيسية. الرجاء اختيار إجراء من القائمة بالأسفل:", chatIdStr, null, menu);
        }
    } catch (err) {
        console.error('❌ handleTgMessage Error:', err);
    }
}

function sendCardsMenu(chatId) {
    // Basic menu implementation
}

function handleBuyCard(chatId, productId) {
    try {
        const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
        const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
        const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));

        const product = products.find(p => p.id === productId);
        const client = clients.find(c => c.id.toString() === chatId.toString());

        if (!product) return sendTelegram("❌ Produit invalide.", chatId);
        if (!client) return sendTelegram("❌ Client non trouvé. Veuillez contacter l'administrateur.", chatId);
        
        if (client.balance < product.price) {
            return sendTelegram(`❌ Solde insuffisant.\nPrix : ${product.price} DA\nVotre solde : ${client.balance} DA`, chatId);
        }

        const cardIndex = cards.findIndex(c => c.productId === productId && !c.used);
        if (cardIndex === -1) {
            return sendTelegram("❌ Désolé, ce produit est en rupture de stock.", chatId);
        }

        const card = cards[cardIndex];
        
        // Idoom PIN Validation (must be 16 digits)
        if (productId.startsWith('idm') && (!/^\d{16}$/.test(card.pin))) {
            console.log(`⚠️ [IDOOM] Invalid PIN found: ${card.pin}. Skipping...`);
            return sendTelegram(`⚠️ <b>Erreur :</b> Le code de recharge en stock (${card.pin}) est invalide (doit être 16 chiffres).`, chatId);
        }

        // Transaction
        card.used = true;
        card.usedBy = chatId;
        card.usedAt = new Date().toISOString();
        
        client.balance -= product.price;

        fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));

        const cardText = card.pin + (card.serial ? `\nS/N: <code>${card.serial}</code>` : '');
        sendTelegram(`✅ <b>Achat réussi !</b>\n\nProduit : ${product.name}\nPrix : ${product.price} DA\nCode : <code>${card.pin}</code>${card.serial ? `\nS/N: <code>${card.serial}</code>` : ''}\n\nNouveau solde : ${client.balance} DA`, chatId);
        
        addLog('Achat', chatId, 'Success', `${product.name} (${product.price} DA)`);
    } catch (e) { 
        console.error('Buy Error:', e);
        sendTelegram("❌ Une erreur est survenue lors de l'achat.", chatId);
    }
}

const FILES = {
    mobilis: 'data/mobilis.json',
    ooredoo: 'data/ooredoo.json',
    djezzy: 'data/djezzy.json',
    sama: 'data/sama.json'
};
const MODEMS_FILE_OLD = 'data/modems.json';
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

const PRODUCTS_FILE = 'data/products.json';
const CARDS_FILE = 'data/cards.json';
const CLIENTS_FILE = 'data/clients.json';
const SALES_FILE = 'data/sales.json';
const AUTO_REPLY_FILE = 'data/auto_reply.json';

if (!fs.existsSync('data')) fs.mkdirSync('data');

// Initialize Files
Object.values(FILES).forEach(f => { if (!fs.existsSync(f)) fs.writeFileSync(f, '[]'); });

function loadAllModems() {
    let all = [];
    // Migration from old unified file
    if (fs.existsSync(MODEMS_FILE_OLD)) {
        try {
            const oldData = JSON.parse(fs.readFileSync(MODEMS_FILE_OLD, 'utf8') || '[]');
            oldData.forEach(m => {
                const op = (m.operator || 'mobilis').toLowerCase();
                const f = FILES[op];
                if (f) {
                    const data = JSON.parse(fs.readFileSync(f, 'utf8') || '[]');
                    if (!data.find(x => (x.port || x.ip) === (m.port || m.ip))) {
                        data.push(m);
                        fs.writeFileSync(f, JSON.stringify(data, null, 2));
                    }
                }
            });
            // Keep the old file renamed for safety
            fs.renameSync(MODEMS_FILE_OLD, MODEMS_FILE_OLD + '.bak');
            console.log('✅ [SYSTEM] Migration to multi-file storage complete.');
        } catch (e) { console.error('Migration Error:', e); }
    }

    Object.values(FILES).forEach(f => {
        try {
            const data = JSON.parse(fs.readFileSync(f, 'utf8') || '[]');
            all = all.concat(data);
        } catch (e) {}
    });
    return all;
}

if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]');
if (!fs.existsSync(CARDS_FILE)) fs.writeFileSync(CARDS_FILE, '[]');
if (!fs.existsSync(CLIENTS_FILE)) fs.writeFileSync(CLIENTS_FILE, '[]');
if (!fs.existsSync(SALES_FILE)) fs.writeFileSync(SALES_FILE, '[]');
if (!fs.existsSync(AUTO_REPLY_FILE)) {
    const defaultReply = {
        message: "👋 <b>Bienvenue chez Flexy Server!</b>\n\nNos services :\n- Flexy Mobilis / Ooredoo / Djezzy\n- Vente de cartes de recharge\n- Activation d'offres\n\nContactez-nous ici : @votre_username"
    };
    fs.writeFileSync(AUTO_REPLY_FILE, JSON.stringify(defaultReply, null, 2));
}

function addSale(modemKey, phone, amount, operator) {
    try {
        const sales = JSON.parse(fs.readFileSync(SALES_FILE, 'utf8') || '[]');
        sales.push({
            date: new Date().toISOString(),
            modem: modemKey,
            phone,
            amount: parseFloat(amount),
            operator
        });
        fs.writeFileSync(SALES_FILE, JSON.stringify(sales, null, 2));
    } catch (e) { console.error('Sale Log Error:', e); }
}

function generateReport(chatId, range = 'day') {
    try {
        const sales = JSON.parse(fs.readFileSync(SALES_FILE, 'utf8') || '[]');
        const now = new Date();
        let startTime = new Date();

        if (range === 'day') startTime.setHours(0, 0, 0, 0);
        else if (range === 'week') startTime.setDate(now.getDate() - 7);
        else if (range === 'month') startTime.setMonth(now.getMonth() - 1);
        else if (range === '6months') startTime.setMonth(now.getMonth() - 6);
        else if (range === 'year') startTime.setFullYear(now.getFullYear() - 1);

        const filtered = sales.filter(s => new Date(s.date) >= startTime);
        const total = filtered.reduce((acc, s) => acc + s.amount, 0);
        
        const labels = { day: 'Aujourd\'hui', week: '7 jours', month: '30 jours', '6months': '6 mois', year: 'Année' };
        const arLabels = { day: 'اليوم', week: 'الأسبوع', month: 'الشهر', '6months': '6 أشهر', year: 'السنة' };
        
        let report = `🧾 <b>Rapport : ${arLabels[range]} (${labels[range]})</b>\n━━━━━━━━━━━━━━\n`;
        report += `✅ Opérations : <b>${filtered.length}</b>\n`;
        report += `💰 Total : <b>${total.toFixed(2)} DA</b>\n━━━━━━━━━━━━━━`;
        sendTelegram(report, chatId);
    } catch (e) { sendTelegram("❌ Erreur Rapport.", chatId); }
}

let settings = { tgToken: '', tgChatId: '' };
if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) {}
}


// --- MIDDLEWARE CONFIGURATION ---
// (Already initialized at the top of the file)

let hardwareLogs = [];
let activeModems = {};
let hilinkState = {};

function addHardwareLog(type, port, status, response) {
    const log = { type, port, time: new Date().toLocaleTimeString(), status, response };
    hardwareLogs.unshift(log);
    if (hardwareLogs.length > 100) hardwareLogs.pop();
    console.log(`[${log.time}] [${port}] ${type}: ${status} - ${response}`);
}

function saveModems() {
    try {
        const ops = ['mobilis', 'ooredoo', 'djezzy'];
        ops.forEach(op => {
            const list = Object.values(activeModems)
                .filter(m => !m.data.remote && m.config.operator.toLowerCase() === op)
                .map(m => ({
                    ...m.config,
                    balance: m.data.balance,
                    lastSms: m.data.lastSms,
                    preferredBalance: m.config.preferredBalance || 'Default'
                }));
            fs.writeFileSync(FILES[op], JSON.stringify(list, null, 2));
        });
    } catch (e) { }
}




class ModemManager {
    constructor(config) {
        this.config = config;
        this.service = new ModemService(config);
        this.key = this.service.key;
        this.data = this.service.data;
        this.init();
    }

    init() {
        // High-frequency polling for status (Heartbeat)
        setInterval(() => this.service.updateStatus(), 15000);
        this.service.updateStatus();
        
        // Auto-poll balance every 10 mins
        setInterval(() => this.checkBalance(), 600000);

        // Immediate silent poll on boot to fill the cache
        this.service.pollSms(true);

        // Poll SMS every 10 seconds
        setInterval(() => this.service.pollSms(), 10000);
    }

    async checkBalance(customCode = null) {
        await this.service.checkBalance(customCode);
        saveModems();
    }

    async diagnose() {
        return await this.service.diagnose();
    }
}
app.post('/api/modems/check', async (req, res) => {
    const { key } = req.body;
    console.log(`📡 [API] Balance Check Requested for ${key}`);
    const modem = activeModems[key];
    if (!modem) return res.status(404).json({ error: 'Modem not found' });
    await modem.checkBalance();
    res.json({ success: true });
});

app.post('/api/modems/diagnose', async (req, res) => {
    const { key } = req.body;
    console.log(`🔍 [API] Diagnosis Requested for ${key}`);
    const modem = activeModems[key];
    if (!modem) return res.status(404).json({ error: 'Modem not found' });
    const info = await modem.diagnose();
    res.json(info);
});

// --- API ROUTES ---
app.get('/', (req, res) => {
    console.log('🏠 [HTTP] Serving Professional Customer Interface...');
    res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/customer', (req, res) => res.redirect('/'));
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/index.html', (req, res) => res.redirect('/admin'));

let transactions = [];
function addLog(type, target, amount, success) {
    transactions.push({ time: new Date().toISOString(), type, target, amount, success });
    if (transactions.length > 50) transactions.shift();
}

app.get('/api/stats', (req, res) => {
    const modems = Object.values(activeModems).map(m => m.data);
    const onlineCount = modems.filter(m => m.online).length;
    const totalBalance = modems.reduce((acc, m) => acc + parseFloat(m.balance || 0), 0).toFixed(2);
    res.json({ modems, onlineCount, totalBalance, transactions });
});

app.post('/api/modems/add', (req, res) => {
    const config = req.body;
    const key = config.port || config.ip;
    if (activeModems[key]) return res.status(400).json({ error: 'Already exists' });
    activeModems[key] = new ModemManager(config);
    
    const op = config.operator.toLowerCase();
    const f = FILES[op];
    if (f) {
        const data = JSON.parse(fs.readFileSync(f, 'utf8') || '[]');
        data.push(config);
        fs.writeFileSync(f, JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
});

app.post('/api/modems/delete', (req, res) => {
    const { key } = req.body;
    const modem = activeModems[key];
    if (modem) {
        const op = modem.config.operator.toLowerCase();
        delete activeModems[key];
        const data = JSON.parse(fs.readFileSync(FILES[op], 'utf8') || '[]');
        const filtered = data.filter(m => (m.port || m.ip) !== key);
        fs.writeFileSync(FILES[op], JSON.stringify(filtered, null, 2));
    }
    res.json({ success: true });
});

// Duplicate routes removed (moved logic into main API section if needed)

app.post('/api/modems/set-network-mode', async (req, res) => {
    const { key, mode } = req.body;
    const modem = activeModems[key];
    if (modem && modem.service) {
        try {
            const headers = await modem.service.getHilinkHeaders();
            if (headers) {
                const xml = `<?xml version="1.0" encoding="UTF-8"?><request><NetworkMode>${mode}</NetworkMode><NetworkBand>3FFFFFFF</NetworkBand><LTEBand>7FFFFFFFFFFFFFFF</LTEBand></request>`;
                await fetch(`http://${modem.config.ip}/api/net/net-mode`, { method: 'POST', headers, body: xml });
                res.json({ success: true });
            } else res.status(401).json({ error: 'Auth failed' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    } else res.status(404).json({ error: 'Modem not found' });
});

// --- Idoom & Flexy Portal ---
app.post('/api/portal/flexy', async (req, res) => {
    const { phone, amount } = req.body;
    let op = phone.startsWith('05') ? 'Ooredoo' : (phone.startsWith('06') ? 'Mobilis' : 'Djezzy');
    const modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
    if (!modem) {
        addLog('شحن فليكسي', phone, amount, false);
        return res.status(404).json({ error: `No active modem found for ${op}` });
    }
    const pin = modem.config.pin || '00000';
    let ussd = (op === 'Mobilis') ? `*630*${phone}*04*${amount}*${pin}#` : (op === 'Ooredoo' ? `*580*${phone}*${amount}*${pin}#` : `*710*${phone}*${amount}*${pin}#`);
    addLog('شحن فليكسي', phone, amount, true);
    modem.checkBalance(ussd).then(() => {
        // Delayed check to allow SMS to arrive and be processed
        setTimeout(() => modem.checkBalance(), 10000);
    });
    res.json({ success: true });
});
app.post('/api/sama/offers', async (req, res) => {
    const { phone } = req.body;
    let op = phone.startsWith('05') ? 'Ooredoo' : (phone.startsWith('06') ? 'Mobilis' : 'Djezzy');

    // NEW LOGIC: 
    // - For Ooredoo (05): Prefer Ooredoo modem with *585*...
    // - For others: Prefer SAMA modem with *665*...
    
    let modem = null;
    let ussd = '';
    const pin = '0000'; // Default, but will use modem config if available

    if (op === 'Ooredoo') {
        modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === 'ooredoo' && m.data.online) ||
                Object.values(activeModems).find(m => m.config.operator.toLowerCase() === 'sama' && m.data.online);
        
        if (modem) {
            const mPin = modem.config.pin || '0000';
            if (modem.config.operator.toLowerCase() === 'ooredoo') {
                ussd = `*585*${phone}*${mPin}#`;
            } else {
                // SAMA modem querying Ooredoo
                ussd = (mPin && mPin !== '0000') ? `*665*1*${phone}*${mPin}#` : `*665*1*${phone}#`;
            }
        }
    } else {
        modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === 'sama' && m.data.online) ||
                Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
        
        if (modem) {
            const mPin = modem.config.pin || '0000';
            if (modem.config.operator.toLowerCase() === 'sama') {
                ussd = (mPin && mPin !== '0000') ? `*665*1*${phone}*${mPin}#` : `*665*1*${phone}#`;
            } else {
                if (op === 'Mobilis') ussd = `*610*${phone}#`;
                else ussd = `*710*${phone}#`;
            }
        }
    }
    
    if (!modem) return res.status(404).json({ error: 'Modem not found or offline' });
    
    console.log(`📡 [OFFERS] Querying ${op} offers for ${phone} using ${modem.config.operator} modem (${ussd})...`);
    const content = await modem.service.queryUssd(ussd);
    
    if (content) {
        res.json({ success: true, content });
    } else {
        res.status(500).json({ error: 'Failed to get response from modem' });
    }
});

app.post('/api/flexy/invoice', async (req, res) => {
    const { phone, amount } = req.body;
    let op = phone.startsWith('05') ? 'Ooredoo' : (phone.startsWith('06') ? 'Mobilis' : 'Djezzy');
    const modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
    
    if (!modem) return res.status(404).json({ error: `No active modem for ${op}` });
    
    const pin = modem.config.pin || '00000';
    let ussd = '';
    if (op === 'Mobilis') ussd = `*668*${phone}*${amount}*${pin}#`; // Common Mobilis Invoice code
    else if (op === 'Ooredoo') ussd = `*113*${amount}*${phone}*${pin}#`;
    else ussd = `*710*${phone}*${amount}*${pin}#`;
    
    console.log(`🧾 [INVOICE] Paying ${amount} DA for ${phone}...`);
    modem.checkBalance(ussd);
    res.json({ success: true });
});

app.post('/api/flexy/international', async (req, res) => {
    const { phone, amount } = req.body;
    let op = phone.startsWith('05') ? 'Ooredoo' : (phone.startsWith('06') ? 'Mobilis' : 'Djezzy');
    const modem = Object.values(activeModems).find(m => m.config.operator.toLowerCase() === op.toLowerCase() && m.data.online);
    
    if (!modem) return res.status(404).json({ error: `No active modem for ${op}` });
    
    const pin = modem.config.pin || '00000';
    let ussd = (op === 'Mobilis') ? `*644*${phone}*${amount}*${pin}#` : `*140*${phone}*${amount}#`; // Placeholder codes
    
    console.log(`🌍 [INTL] Alo International for ${phone} (${amount} DA)...`);
    modem.checkBalance(ussd);
    res.json({ success: true });
});

app.get('/api/modems/scan', async (req, res) => { 
    const results = [];
    try {
        const ports = await SerialPort.list();
        for (let p of ports) {
            if (p.vendorId || p.productId || p.path.toLowerCase().includes('com')) {
                results.push({ path: p.path, info: `USB: ${p.path} (${p.friendlyName || 'Modem'})`, type: 'serial' });
            }
        }
    } catch (e) { console.error('Serial Scan Error:', e.message); }

    // 2. Scan Common IPs
    const ips = ['192.168.8.1', '192.168.1.1', '192.168.0.1', '192.168.100.1', '192.168.50.1'];
    for (let ip of ips) {
        try {
            const hRes = await fetch(`http://${ip}/api/monitoring/status`, { timeout: 800 }).catch(() => null);
            if (hRes) results.push({ path: ip, info: `HiLink Modem (${ip})`, type: 'hilink' });
            else {
                const zRes = await fetch(`http://${ip}/goform/goform_get_cmd_process?cmd=network_type`, { timeout: 500 }).catch(() => null);
                if (zRes) results.push({ path: ip, info: `ZTE Modem (${ip})`, type: 'zte' });
            }
        } catch (e) {}
    }
    
    res.json({ ports: results }); 
});

// --- CUSTOMER API ---
app.get('/api/customer/products', (req, res) => {
    try {
        const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8') || '[]');
        const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8') || '[]');
        const result = products.map(p => {
            const stock = cards.filter(c => c.productId === p.id && !c.used).length;
            return { id: p.id, name: p.name, price: p.price, stock };
        });
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/add', (req, res) => {
    const { name, type, purchasePrice, sellingPrice } = req.body;
    try {
        const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8') || '[]');
        const newProd = { id: 'prod' + Date.now(), name, type, purchasePrice, price: sellingPrice, stock: 0 };
        products.push(newProd);
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/update', (req, res) => {
    const { id, price, purchasePrice } = req.body;
    try {
        let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8') || '[]');
        products = products.map(p => p.id === id ? { ...p, price: parseFloat(price), purchasePrice: parseFloat(purchasePrice) } : p);
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/delete', (req, res) => {
    const { id } = req.body;
    try {
        let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8') || '[]');
        products = products.filter(p => p.id !== id);
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards/upload', (req, res) => {
    const { productId, rawData } = req.body;
    try {
        const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8') || '[]');
        const lines = rawData.split('\n');
        let count = 0;
        lines.forEach(line => {
            const pin = line.trim();
            if (pin) {
                cards.push({
                    id: Date.now() + Math.random(),
                    productId,
                    pin,
                    used: false,
                    createdAt: new Date().toISOString()
                });
                count++;
            }
        });
        fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
        res.json({ success: true, count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- SETTINGS ---
app.get('/api/settings', (req, res) => res.json(settings));
app.post('/api/settings', (req, res) => {
    settings = { ...settings, ...req.body };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    if (typeof pollTelegram === 'function') pollTelegram(); // Restart bot polling with new token
    res.json({ success: true });
});

// --- BOOT ---
console.log('\n🚀 FLEXY SERVER V2 BOOTING...');
const savedModems = loadAllModems();
savedModems.forEach(m => {
    try {
        activeModems[m.port || m.ip] = new ModemManager(m);
    } catch (e) { console.error(`Error loading modem ${m.ip}:`, e.message); }
});

const PORT = process.env.PORT || 8090;
app.listen(PORT, () => {
    console.log(`\n🚀 FLEXY SERVER V2 BOOTING...`);
    console.log(`✅ Server running on http://localhost:${PORT}`);
    pollTelegram();
});
