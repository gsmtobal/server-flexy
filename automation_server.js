const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const Tesseract = require('tesseract.js');

const app = express();
app.use(express.json());
app.use(cors());

let browser;

app.post('/recharge-idoom', async (req, res) => {
    const { account, pin } = req.body;

    try {
        if (!browser) {
            browser = await puppeteer.launch({ 
                headless: "new", // Run in background
                args: ['--no-sandbox']
            });
        }

        const page = await browser.newPage();
        await page.goto('https://paiement.at.dz/index.php?p=voucher_internet&produit=in');

        // Step 1: Fill Account
        await page.waitForSelector('#nd');
        await page.type('#nd', account);

        // Step 2: Solve Captcha (OCR)
        console.log('[Automation] Attempting to solve captcha...');
        const captchaElement = await page.$('img[alt="Captcha"]'); // Selector for captcha image
        if (captchaElement) {
            const captchaBuffer = await captchaElement.screenshot();
            const { data: { text } } = await Tesseract.recognize(captchaBuffer, 'eng');
            const captchaCode = text.trim().replace(/[^a-zA-Z0-9]/g, '');
            console.log(`[Automation] Detected captcha: ${captchaCode}`);
            await page.type('input[name="captcha"]', captchaCode);
        }

        // Submit Step 1
        await page.click('input[name="validerND"]');

        // Step 3: Wait for Voucher PIN field
        try {
            await page.waitForSelector('input[name="v_code"]', { timeout: 10000 });
            await page.type('input[name="v_code"]', pin);
            await page.click('input[name="validerVoucher"]');

            // Wait for success message
            await page.waitForTimeout(2000);
            await page.close();
            res.json({ success: true, message: 'Done!' });
        } catch (err) {
            await page.close();
            res.json({ success: false, message: 'Failed to pass first step (Captcha incorrect?)' });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`[Tobal Scan] Automation Server running at http://localhost:${PORT}`);
});
