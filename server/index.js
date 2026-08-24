const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const OAuth = require('oauth').OAuth;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ════════════════════════════════════════════════════════════
// PESAPAL CONFIG – REPLACE WITH YOUR CREDENTIALS
// ════════════════════════════════════════════════════════════
const PESAPAL_CONSUMER_KEY = 'GZLl95Wvb+Q9tpij6uw36i4UipT9ezqB';
const PESAPAL_CONSUMER_SECRET = 'dY0NpHNc+0HxJi2I9X0u+ABFEyo=';
const PESAPAL_BASE_URL = 'https://www.pesapal.com/api/PostPesapalDirectOrderV4'; // ✅ This endpoint is for orders, not for token

// ════════════════════════════════════════════════════════════
// OAuth 1.0a Helper
// ════════════════════════════════════════════════════════════
function createOAuthClient() {
    return new OAuth(
        PESAPAL_BASE_URL,                      // request URL (same as access URL for Pesapal)
        PESAPAL_BASE_URL,                      // access URL (same)
        PESAPAL_CONSUMER_KEY,
        PESAPAL_CONSUMER_SECRET,
        '1.0',                                 // OAuth version
        null,                                  // callback URL (not used for 2-legged OAuth)
        'HMAC-SHA1'
    );
}

// ════════════════════════════════════════════════════════════
// 1. GET TOKEN – Using OAuth 1.0a
// ════════════════════════════════════════════════════════════
app.post('/api/get-token', (req, res) => {
    const oauth = createOAuthClient();
    // Pesapal expects an empty POST to get a token
    oauth.post(
        PESAPAL_BASE_URL,                     // URL
        null,                                 // OAuth token (none for 2-legged)
        null,                                 // OAuth token secret (none)
        {},                                   // request body (empty)
        'application/json',
        (err, data, response) => {
            if (err) {
                console.error('❌ OAuth error:', err);
                return res.status(500).json({ error: err.message });
            }
            try {
                // Pesapal returns JSON with the token
                const parsed = JSON.parse(data);
                if (!parsed.token) {
                    console.error('❌ No token in response:', parsed);
                    return res.status(500).json({ error: 'No token received' });
                }
                res.json({ token: parsed.token });
            } catch (parseErr) {
                console.error('❌ JSON parse error:', parseErr);
                console.error('🔹 Raw response:', data);
                res.status(500).json({ error: 'Invalid response from Pesapal' });
            }
        }
    );
});

// ════════════════════════════════════════════════════════════
// 2. INITIATE PAYMENT – Using OAuth 1.0a
// ════════════════════════════════════════════════════════════
app.post('/api/initiate-payment', async (req, res) => {
    const { phone, amount, memberId, memberName, provider } = req.body;

    if (!phone || !amount || !memberId || !memberName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Get token first
        const tokenResponse = await new Promise((resolve, reject) => {
            const oauth = createOAuthClient();
            oauth.post(
                PESAPAL_BASE_URL,
                null, null, {},
                'application/json',
                (err, data, response) => {
                    if (err) return reject(err);
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid token response: ' + data));
                    }
                }
            );
        });

        if (!tokenResponse.token) throw new Error('No token received');

        // Use token to initiate payment
        const paymentPayload = {
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
        };

        // Now make a POST to Pesapal with OAuth using the token
        const oauth = createOAuthClient();
        oauth.post(
            PESAPAL_BASE_URL,
            tokenResponse.token,                // OAuth token from previous step
            tokenResponse.tokenSecret,          // OAuth token secret (if provided)
            paymentPayload,
            'application/json',
            (err, data, response) => {
                if (err) {
                    console.error('❌ Payment OAuth error:', err);
                    return res.status(500).json({ error: err.message });
                }
                try {
                    const result = JSON.parse(data);
                    console.log('✅ Payment initiated:', result);
                    res.json(result);
                } catch (parseErr) {
                    console.error('❌ Payment parse error:', parseErr);
                    console.error('🔹 Raw response:', data);
                    res.status(500).json({ error: 'Invalid payment response' });
                }
            }
        );
    } catch (error) {
        console.error('❌ initiate-payment error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ════════════════════════════════════════════════════════════
// 3. WEBHOOK – (unchanged)
// ════════════════════════════════════════════════════════════
app.post('/api/webhook', async (req, res) => {
    console.log('📨 Webhook received:', req.body);
    res.sendStatus(200);
});

// ════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Harvest Trust Pesapal Server (OAuth)' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});