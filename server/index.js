const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── PESAPAL CONFIG ──────────────────────────────────────────
const PESAPAL_CONSUMER_KEY = 'GZLl95Wvb+Q9tpij6uw36i4UipT9ezqB';
const PESAPAL_CONSUMER_SECRET = 'dY0NpHNc+0HxJi2I9X0u+ABFEyo=';
const PESAPAL_BASE_URL = 'https://www.pesapal.com/api/PostPesapalDirectOrderV4';

// ─── HEALTH CHECK ────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Harvest Trust Pesapal Server' });
});

// ─── GET TOKEN ───────────────────────────────────────────────
app.post('/api/get-token', async (req, res) => {
    try {
        const response = await fetch(PESAPAL_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consumer_key: PESAPAL_CONSUMER_KEY,
                consumer_secret: PESAPAL_CONSUMER_SECRET
            })
        });
        const data = await response.json();
        if (!data.token) throw new Error('No token received');
        res.json({ token: data.token });
    } catch (error) {
        console.error('❌ get-token error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── INITIATE PAYMENT ────────────────────────────────────────
app.post('/api/initiate-payment', async (req, res) => {
    const { phone, amount, memberId, memberName, provider } = req.body;

    if (!phone || !amount || !memberId || !memberName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Get token
        const tokenResponse = await fetch(PESAPAL_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consumer_key: PESAPAL_CONSUMER_KEY,
                consumer_secret: PESAPAL_CONSUMER_SECRET
            })
        });
        const tokenData = await tokenResponse.json();
        if (!tokenData.token) throw new Error('No token received');

        // 2. Initiate payment
        const paymentResponse = await fetch(PESAPAL_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tokenData.token
            },
            body: JSON.stringify({
                amount: Number(amount),
                currency: 'UGX',
                description: 'Harvest Trust Savings - ' + memberName,
                customer_phone: phone,
                customer_email: memberId + '@harvesttrust.com',
                payment_methods: 'MOBILE_MONEY',
                provider: provider || 'MTN_UGANDA',
                callback_url: 'https://yourdomain.com/callback',
                ipn_url: 'https://your-render-app.onrender.com/api/webhook',
                merchant_reference: 'HTF-' + Date.now()
            })
        });

        const result = await paymentResponse.json();
        console.log('✅ Payment initiated for', memberName);
        res.json(result);

    } catch (error) {
        console.error('❌ initiate-payment error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── WEBHOOK ──────────────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
    console.log('📨 Webhook received:', req.body);
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
