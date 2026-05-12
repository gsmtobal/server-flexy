const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { SerialPort } = require('serialport');
const admin = require('firebase-admin');
const fs = require('fs');

const app = express();
app.use(cors()); // Allow dashboard to connect
app.use(express.json());

const PORT = 3000;

// --- Firebase Initialization ---
let db = null;
const KEY_PATH = "./serviceAccountKey.json";
if (fs.existsSync(KEY_PATH)) {
    try {
        const serviceAccount = require(KEY_PATH);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log('[SIM Server] Connected to Firebase ✅');
    } catch (e) {
        console.error('[SIM Server] Firebase error: ', e.message);
    }
}

// --- API Endpoints ---

// Friendly Root Page
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #696cff;">Tobal Gsm Server is Running! ✅</h1>
            <p>The server is active and ready to sync with your modems.</p>
            <p>Go back to your <a href="https://gsmtobal.github.io/server-flexy/sim_dashboard.html">Dashboard</a> to see real data.</p>
        </div>
    `);
});

// 1. Sync data from a HiLink Modem (like 192.168.50.1)
app.get('/api/sync-hilink/:ip', async (req, res) => {
    const modemIp = req.params.ip;
    console.log(`[SIM Server] Authenticating and fetching from ${modemIp}...`);

    try {
        // Step 1: Get Session and Token (SesTokInfo)
        const sesTokResp = await axios.get(`http://${modemIp}/api/webserver/SesTokInfo`, { timeout: 3000 });
        const sesTokXml = sesTokResp.data;
        
        const getXmlVal = (xml, tag) => {
            const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i'));
            return match ? match[1] : null;
        };

        const sessionId = getXmlVal(sesTokXml, 'SesInfo');
        const token = getXmlVal(sesTokXml, 'TokInfo');

        if (!sessionId || !token) throw new Error("Could not get Session/Token");

        // Step 2: Fetch Monitoring Status with Headers
        const statusResp = await axios.get(`http://${modemIp}/api/monitoring/status`, {
            headers: {
                'Cookie': sessionId,
                '__RequestVerificationToken': token,
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 3000
        });

        const xml = statusResp.data;
        console.log(`[SIM Server] Modem Response Received.`);

        const signal = getXmlVal(xml, 'SignalIcon');
        const networkType = getXmlVal(xml, 'CurrentNetworkType');

        const data = {
            status: 'online',
            signal: Math.max(0, Math.min(5, parseInt(signal || 0))),
            carrier: networkType == '3' ? 'Ooredoo 3G' : 'Ooredoo 4G',
            last_update: new Date().toLocaleString()
        };

        res.json({ success: true, data });

    } catch (error) {
        console.error(`[SIM Server] Error: ${error.message}`);
        res.status(500).json({ success: false, message: "Modem Auth Failed" });
    }
});

// Helper for delay
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// 2. Execute USSD via HiLink (New)
app.post('/api/send-ussd', async (req, res) => {
    const { ip, code } = req.body;
    console.log(`
-----------------------------------------
[FIRM ORDER] Received USSD Request!
IP: ${ip}
Code: ${code}
-----------------------------------------
    `);

    try {
        // Step 1: Get Session/Token
        const sesTokResp = await axios.get(`http://${ip}/api/webserver/SesTokInfo`, { timeout: 3000 });
        const sessionId = getXmlVal(sesTokResp.data, 'SesInfo');
        const token = getXmlVal(sesTokResp.data, 'TokInfo');

        // Step 2: Send USSD Command
        const ussdXml = `<?xml version="1.0" encoding="UTF-8"?><request><content>${code}</content><codeType>CodeType</codeType><timeout></timeout></request>`;
        
        await axios.post(`http://${ip}/api/ussd/send`, ussdXml, {
            headers: {
                'Cookie': sessionId,
                '__RequestVerificationToken': token,
                'Content-Type': 'application/xml',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        console.log(`[SIM Server] USSD Command Sent Successfully! ✅`);
        
        // Step 3: Poll for Response
        let ussdResponse = null;
        console.log(`[SIM Server] Waiting for USSD response from modem...`);
        
        for (let i = 0; i < 5; i++) {
            await sleep(1500); // Wait 1.5s between polls
            const getResp = await axios.get(`http://${ip}/api/ussd/get`, {
                headers: {
                    'Cookie': sessionId,
                    '__RequestVerificationToken': token,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            const content = getXmlVal(getResp.data, 'content');
            if (content && content.length > 0) {
                ussdResponse = content;
                break;
            }
            console.log(`[SIM Server] Polling... (Attempt ${i+1}/5)`);
        }

        if (ussdResponse) {
            console.log(`[SIM Server] USSD Response Received: ${ussdResponse}`);
            res.json({ success: true, message: "USSD Response Received", content: ussdResponse });
        } else {
            console.log(`[SIM Server] USSD Timeout (No response from network).`);
            res.json({ success: true, message: "USSD Sent (Timeout waiting for response)", content: null });
        }

    } catch (error) {
        console.error(`[SIM Server] USSD Error: ${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper Function for all routes
function getXmlVal(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'i'));
    return match ? match[1] : null;
}

// 3. Execute USSD via Serial (Legacy)
app.get('/api/status', async (req, res) => {
    if (!db) return res.status(500).send("Database not connected");
    const snapshot = await db.collection('sim_status').get();
    const data = snapshot.docs.map(doc => doc.data());
    res.json(data);
});

// Start the server
app.listen(PORT, () => {
    console.log(`
=========================================
   Tobal Gsm - Local SIM Server Proxy
=========================================
Server running on: http://localhost:${PORT}
Dashboard can now fetch real balance!
=========================================
    `);
});

// --- Serial Modem Auto-Scan (Optional) ---
const modems = new Map();
async function scanSerialModems() {
    try {
        const ports = await SerialPort.list();
        for (const portInfo of ports) {
            if (portInfo.manufacturer && !modems.has(portInfo.path)) {
                console.log(`[SIM Server] Found USB modem: ${portInfo.path}`);
                // Init logic here
            }
        }
    } catch (e) {}
}
setInterval(scanSerialModems, 10000);

