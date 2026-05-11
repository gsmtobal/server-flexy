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
    console.log(`[SIM Server] Fetching real data from ${modemIp}...`);

    try {
        // Fetch Monitoring Status
        const statusResp = await axios.get(`http://${modemIp}/api/monitoring/status`, { timeout: 3000 });
        const xml = statusResp.data;

        // Simple XML Parser using Regex for HiLink
        const getValue = (tag) => {
            const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
            return match ? match[1] : null;
        };

        // Try different signal tags (Huawei firmwares vary)
        let signal = getValue('SignalIcon');
        if (signal === null || signal === '0') {
            const strength = getValue('SignalStrength');
            if (strength) signal = Math.floor(parseInt(strength) / 20); // Map 0-100 to 0-5
        }

        const networkType = getValue('CurrentNetworkType') || 'Unknown';
        const serviceStatus = getValue('ServiceStatus'); 

        const data = {
            status: (serviceStatus == '2' || signal == '0') ? 'offline' : 'online',
            signal: Math.max(0, Math.min(5, parseInt(signal || 0))),
            carrier: networkType == '3' ? 'Ooredoo 3G' : 'Ooredoo 4G',
            last_update: new Date().toLocaleString()
        };

        console.log(`[SIM Server] Successfully parsed modem data: Signal=${data.signal}, Status=${data.status}`);
        res.json({ success: true, data });

    } catch (error) {
        console.error(`[SIM Server] Error: ${error.message}`);
        res.status(500).json({ success: false, message: "Modem unreachable or timed out" });
    }
});

// 2. Execute USSD via Serial (Optional, if you have USB modems)
app.post('/api/ussd', (req, res) => {
    const { port, code } = req.body;
    console.log(`[SIM Server] Executing USSD ${code} on ${port}...`);
    // Serial port logic here if needed
    res.json({ success: true, response: "Pending execution..." });
});

// 3. Get all modem statuses
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

