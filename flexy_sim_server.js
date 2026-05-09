const { SerialPort } = require('serialport');
const admin = require('firebase-admin');

const fs = require('fs');

// --- Firebase Initialization (Optional) ---
let db = null;
const KEY_PATH = "./serviceAccountKey.json";

if (fs.existsSync(KEY_PATH)) {
    try {
        const serviceAccount = require(KEY_PATH);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://YOUR-PROJECT-ID.firebaseio.com"
        });
        db = admin.firestore();
        console.log('[SIM Server] Connected to Cloud (Firebase) ✅');
    } catch (e) {
        console.error('[SIM Server] Firebase key exists but error loading: ', e.message);
    }
} else {
    console.warn('[SIM Server] Cloud key not found. Running in LOCAL MODE ONLY. ⚠️');
}

// --- Modem Management ---
const modems = new Map();

async function scanModems() {
    const ports = await SerialPort.list();
    for (const portInfo of ports) {
        if (portInfo.manufacturer && !modems.has(portInfo.path)) {
            console.log(`[SIM Server] Found potential modem: ${portInfo.path}`);
            initModem(portInfo.path);
        }
    }
}

function initModem(path) {
    const port = new SerialPort({ path, baudRate: 9600 });
    
    port.on('open', () => {
        console.log(`[SIM Server] Connected to ${path}`);
        modems.set(path, port);
        updateModemStatus(path); // Initial check
    });

    port.on('data', (data) => {
        const resp = data.toString();
        // Handle CUSD (Balance) or CSQ (Signal) responses
        if (resp.includes('+CUSD:')) {
            const balance = parseBalance(resp);
            if (db) db.collection('sim_status').doc(path.replace(/[^a-zA-Z0-9]/g, '_')).update({ balance });
        }
        if (resp.includes('+CSQ:')) {
            const signal = parseSignal(resp);
            if (db) db.collection('sim_status').doc(path.replace(/[^a-zA-Z0-9]/g, '_')).update({ 
                signal: signal.bars, 
                signal_dbm: signal.dbm 
            });
        }
    });
}

async function updateModemStatus(path) {
    const port = modems.get(path);
    if (!port) return;

    // Save basic info to Firebase
    if (db) {
        await db.collection('sim_status').doc(path.replace(/[^a-zA-Z0-9]/g, '_')).set({
            port: path,
            operator: 'Scanning...',
            status: 'online',
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // Request Signal Strength (AT+CSQ)
    port.write('AT+CSQ\r\n');
    
    // Request Balance (Example for Mobilis: *222#)
    setTimeout(() => {
        port.write('AT+CUSD=1,"*222#",15\r\n');
    }, 2000);
}

// Helpers
function parseBalance(resp) {
    const match = resp.match(/(\d+\.\d+)/); // Very basic parser
    return match ? match[1] : 'Unknown';
}

function parseSignal(resp) {
    const match = resp.match(/\+CSQ:\s(\d+),/);
    if (!match) return { bars: 0, dbm: '-' };
    const raw = parseInt(match[1]);
    const bars = Math.min(4, Math.floor(raw / 7)); // Map 0-31 to 0-4 bars
    const dbm = (raw === 99) ? '-' : (-113 + (raw * 2));
    return { bars, dbm };
}

// Interval to scan and update
setInterval(scanModems, 10000);
setInterval(() => modems.forEach((p, path) => updateModemStatus(path)), 60000);

console.log('[SIM Server] Active and scanning for modems...');
