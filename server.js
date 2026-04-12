// MISR STEEL Backend v2 — Stability AI + OpenAI fallback
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_KEY = process.env.STABILITY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PAYMOB_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_INT = process.env.PAYMOB_INTEGRATION_ID;
const PAYMOB_FRAME = process.env.PAYMOB_IFRAME_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'misrsteel_admin_2025';

const users = {};
const PLANS = {
  starter:  { price_usd: 50,   credits: 25,    name_en: 'Starter'  },
  business: { price_usd: 200,  credits: 120,   name_en: 'Business' },
  pro:      { price_usd: 500,  credits: 350,   name_en: 'Pro'      },
  annual:   { price_usd: 4500, credits: 99999, name_en: 'Annual'   },
};

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

function getUser(id) {
  if (!users[id]) users[id] = { credits: 2, paid: 0, used: 0, plan: 'free' };
  return users[id];
}

function requireToken(req, res) {
  const token = req.headers['x-user-token'];
  if (!token) { res.status(401).json({ error: 'No token' }); return null; }
  return token;
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'MISR STEEL API', version: '2.0.0', ai: STABILITY_KEY ? 'stability' : OPENAI_KEY ? 'openai' : 'none' });
});

app.get('/api/credits', (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;
  const user = getUser(token);
  res.json({ success: true, credits: user.credits, used: user.used, plan: user.plan, canGenerate: user.credits > 0 });
});

app.post('/api/generate', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;
  const user = getUser(token);

  if (user.credits <= 0) {
    return res.status(402).json({ error: 'no_credits', message: 'انتهى رصيدك', credits: 0 });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  try {
    let imageUrl = null;

    if (STABILITY_KEY) {
      console.log('Using Stability AI...');
      const fd = new FormData();
      fd.append('prompt', prompt);
      fd.append('output_format', 'jpeg');
      fd.append('width', '1024');
      fd.append('height', '1024');

      const stabRes = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${STABILITY_KEY}`, 'Accept': 'application/json', ...fd.getHeaders() },
        body: fd
      });

      if (stabRes.ok) {
        const data = await stabRes.json();
        imageUrl = `data:image/jpeg;base64,${data.image}`;
      } else {
        const err = await stabRes.json().catch(() => ({}));
        console.error('Stability error:', JSON.stringify(err));
        if (OPENAI_KEY) {
          console.log('Fallback to OpenAI...');
          imageUrl = await genOpenAI(prompt);
        } else {
          return res.status(500).json({ error: err.message || 'Stability AI error' });
        }
      }
    } else if (OPENAI_KEY) {
      imageUrl = await genOpenAI(prompt);
    } else {
      return res.status(500).json({ error: 'No AI API configured' });
    }

    user.credits--;
    user.used++;

    return res.json({ success: true, imageUrl, creditsLeft: user.credits });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

async function genOpenAI(prompt) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'OpenAI error');
  return d.data[0].url;
}

app.post('/api/payment/callback', (req, res) => {
  const data = req.body;
  if (data.obj?.success === true) {
    const mid = data.obj?.order?.merchant_order_id || '';
    const [userToken, planId] = mid.split('_');
    if (users[userToken] && PLANS[planId]) {
      users[userToken].credits += PLANS[planId].credits;
      users[userToken].plan = planId;
    }
  }
  res.json({ received: true });
});

app.get('/api/admin/users', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ total: Object.keys(users).length, users: Object.entries(users).map(([id, u]) => ({ id, credits: u.credits, used: u.used, plan: u.plan })) });
});

app.post('/api/admin/add-credits', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  const { userId, credits } = req.body;
  if (!userId || !credits) return res.status(400).json({ error: 'Missing fields' });
  getUser(userId).credits += parseInt(credits);
  res.json({ success: true, newCredits: users[userId].credits });
});

app.listen(PORT, () => {
  console.log(`MISR STEEL v2 on port ${PORT}`);
  console.log(`Stability: ${STABILITY_KEY ? 'YES' : 'NO'}`);
  console.log(`OpenAI: ${OPENAI_KEY ? 'YES' : 'NO'}`);
});

module.exports = app;
