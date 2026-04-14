// MISR STEEL Backend v2.1 — hardened auth + validated credits + safer parsing
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_KEY = process.env.STABILITY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const users = {};
const PLANS = {
  starter: { price_usd: 50, credits: 25, name_en: 'Starter' },
  business: { price_usd: 200, credits: 120, name_en: 'Business' },
  pro: { price_usd: 500, credits: 350, name_en: 'Pro' },
  annual: { price_usd: 4500, credits: 99999, name_en: 'Annual' }
};

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

function getUser(id) {
  if (!users[id]) users[id] = { credits: 2, paid: 0, used: 0, plan: 'free' };
  return users[id];
}

function requireUserToken(req, res) {
  const token = req.headers['x-user-token'];
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return null;
  }
  return token;
}

function requireAdminToken(req, res) {
  if (!ADMIN_TOKEN) {
    res.status(503).json({ error: 'Admin API disabled: ADMIN_TOKEN is not configured' });
    return false;
  }

  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseMerchantOrderId(mid = '') {
  const index = mid.lastIndexOf('_');
  if (index <= 0 || index === mid.length - 1) return { userToken: null, planId: null };
  return {
    userToken: mid.slice(0, index),
    planId: mid.slice(index + 1)
  };
}

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MISR STEEL API',
    version: '2.1.0',
    ai: STABILITY_KEY ? 'stability' : OPENAI_KEY ? 'openai' : 'none'
  });
});

app.get('/api/credits', (req, res) => {
  const token = requireUserToken(req, res);
  if (!token) return;

  const user = getUser(token);
  res.json({
    success: true,
    credits: user.credits,
    used: user.used,
    plan: user.plan,
    canGenerate: user.credits > 0
  });
});

app.post('/api/generate', async (req, res) => {
  const token = requireUserToken(req, res);
  if (!token) return;

  const user = getUser(token);
  if (user.credits <= 0) {
    return res.status(402).json({ error: 'no_credits', message: 'انتهى رصيدك', credits: 0 });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt required' });
  }

  try {
    let imageUrl = null;

    if (STABILITY_KEY) {
      const fd = new FormData();
      fd.append('prompt', prompt);
      fd.append('output_format', 'jpeg');
      fd.append('width', '1024');
      fd.append('height', '1024');

      const stabRes = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABILITY_KEY}`,
          Accept: 'application/json',
          ...fd.getHeaders()
        },
        body: fd
      });

      if (stabRes.ok) {
        const data = await stabRes.json();
        imageUrl = `data:image/jpeg;base64,${data.image}`;
      } else if (OPENAI_KEY) {
        imageUrl = await genOpenAI(prompt);
      } else {
        const err = await stabRes.json().catch(() => ({}));
        return res.status(500).json({ error: err.message || 'Stability AI error' });
      }
    } else if (OPENAI_KEY) {
      imageUrl = await genOpenAI(prompt);
    } else {
      return res.status(500).json({ error: 'No AI API configured' });
    }

    user.credits -= 1;
    user.used += 1;

    return res.json({ success: true, imageUrl, creditsLeft: user.credits });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

async function genOpenAI(prompt) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard'
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI error');
  return data.data[0].url;
}

app.post('/api/payment/callback', (req, res) => {
  const data = req.body;
  if (data.obj?.success === true) {
    const merchantOrderId = data.obj?.order?.merchant_order_id || '';
    const { userToken, planId } = parseMerchantOrderId(merchantOrderId);

    if (userToken && planId && users[userToken] && PLANS[planId]) {
      users[userToken].credits += PLANS[planId].credits;
      users[userToken].plan = planId;
    }
  }

  res.json({ received: true });
});

app.get('/api/admin/users', (req, res) => {
  if (!requireAdminToken(req, res)) return;

  const entries = Object.entries(users).map(([id, user]) => ({
    id,
    credits: user.credits,
    used: user.used,
    plan: user.plan
  }));

  res.json({ total: entries.length, users: entries });
});

app.post('/api/admin/add-credits', (req, res) => {
  if (!requireAdminToken(req, res)) return;

  const { userId, credits } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const toAdd = parsePositiveInteger(credits);
  if (!toAdd) {
    return res.status(400).json({ error: 'credits must be a positive integer' });
  }

  const user = getUser(userId);
  user.credits += toAdd;

  res.json({ success: true, newCredits: user.credits });
});

app.listen(PORT, () => {
  console.log(`MISR STEEL v2.1 on port ${PORT}`);
  console.log(`Stability: ${STABILITY_KEY ? 'YES' : 'NO'}`);
  console.log(`OpenAI: ${OPENAI_KEY ? 'YES' : 'NO'}`);
  console.log(`Admin API: ${ADMIN_TOKEN ? 'ENABLED' : 'DISABLED (no ADMIN_TOKEN)'}`);
});

module.exports = app;
