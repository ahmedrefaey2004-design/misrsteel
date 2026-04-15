// MISR STEEL Backend v3 — Stability AI Image-to-Image
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

const STABILITY_KEY = process.env.STABILITY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'misrsteel_admin_2025';

const users = {};
const PLANS = {
  starter:  { price_usd: 50,   credits: 25    },
  business: { price_usd: 200,  credits: 120   },
  pro:      { price_usd: 500,  credits: 350   },
  annual:   { price_usd: 4500, credits: 99999 },
};

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

function getUser(id) {
  if (!users[id]) users[id] = { credits: 2, paid: 0, used: 0, plan: 'free' };
  return users[id];
}

function requireToken(req, res) {
  const token = req.headers['x-user-token'];
  if (!token) { res.status(401).json({ error: 'No token' }); return null; }
  return token;
}

// ── Health check ──────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MISR STEEL API v3',
    stability: STABILITY_KEY ? 'yes' : 'no',
    openai: OPENAI_KEY ? 'yes' : 'no'
  });
});

// ── GET /api/credits ──────────────────────────
app.get('/api/credits', (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;
  const user = getUser(token);
  res.json({ success: true, credits: user.credits, used: user.used, plan: user.plan });
});

// ── POST /api/generate — Text to Image ────────
app.post('/api/generate', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;
  const user = getUser(token);
  if (user.credits <= 0) return res.status(402).json({ error: 'no_credits' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  try {
    const imageUrl = await genStability(prompt);
    user.credits--;
    user.used++;
    res.json({ success: true, imageUrl, creditsLeft: user.credits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/visualize — Image to Image ──────
// Takes customer room photo + product image
// Returns room with product placed inside
app.post('/api/visualize', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;
  const user = getUser(token);
  if (user.credits <= 0) return res.status(402).json({ error: 'no_credits' });

  const { roomImageBase64, productName, prompt } = req.body;

  if (!roomImageBase64) return res.status(400).json({ error: 'Room image required' });
  if (!STABILITY_KEY) return res.status(500).json({ error: 'Stability AI not configured' });

  try {
    // Convert base64 to buffer
    const base64Data = roomImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Build professional interior design prompt
    const finalPrompt = prompt || `Interior design photo of a room furnished with ${productName || 'elegant stainless steel chairs with gold frame and premium velvet upholstery'}. Photorealistic, professional interior photography, 8K, high quality, warm lighting, luxury furniture placement. The furniture fits naturally in the space.`;

    const fd = new FormData();
    fd.append('image', imageBuffer, { filename: 'room.jpg', contentType: 'image/jpeg' });
    fd.append('prompt', finalPrompt);
    fd.append('output_format', 'jpeg');
    fd.append('strength', '0.65'); // 0.65 = keeps room structure, adds furniture
    fd.append('negative_prompt', 'ugly, distorted, blurry, bad quality, watermark, text, deformed furniture, unrealistic');

    const response = await fetch(
      'https://api.stability.ai/v2beta/stable-image/generate/sd3',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STABILITY_KEY}`,
          'Accept': 'application/json',
          ...fd.getHeaders()
        },
        body: fd
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Stability error:', errText);

      // Fallback: try image-to-image endpoint
      const fd2 = new FormData();
      fd2.append('init_image', imageBuffer, { filename: 'room.jpg', contentType: 'image/jpeg' });
      fd2.append('text_prompts[0][text]', finalPrompt);
      fd2.append('text_prompts[0][weight]', '1');
      fd2.append('text_prompts[1][text]', 'ugly, distorted, blurry, bad quality');
      fd2.append('text_prompts[1][weight]', '-1');
      fd2.append('init_image_mode', 'IMAGE_STRENGTH');
      fd2.append('image_strength', '0.35');
      fd2.append('cfg_scale', '7');
      fd2.append('samples', '1');
      fd2.append('steps', '30');

      const res2 = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STABILITY_KEY}`,
            'Accept': 'application/json',
            ...fd2.getHeaders()
          },
          body: fd2
        }
      );

      if (!res2.ok) {
        const err2 = await res2.json().catch(() => ({}));
        throw new Error(err2.message || 'Stability AI error');
      }

      const data2 = await res2.json();
      const imageUrl = `data:image/jpeg;base64,${data2.artifacts[0].base64}`;
      user.credits--;
      user.used++;
      return res.json({ success: true, imageUrl, creditsLeft: user.credits });
    }

    const data = await response.json();
    const imageUrl = `data:image/jpeg;base64,${data.image}`;
    user.credits--;
    user.used++;
    res.json({ success: true, imageUrl, creditsLeft: user.credits });

  } catch (err) {
    console.error('Visualize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Stability text-to-image helper ────────────
async function genStability(prompt) {
  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('output_format', 'jpeg');
  fd.append('width', '1024');
  fd.append('height', '1024');

  const r = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STABILITY_KEY}`,
      'Accept': 'application/json',
      ...fd.getHeaders()
    },
    body: fd
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || 'Stability AI error');
  }
  const d = await r.json();
  return `data:image/jpeg;base64,${d.image}`;
}

// ── Admin routes ──────────────────────────────
app.get('/api/admin/users', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ total: Object.keys(users).length, users: Object.entries(users).map(([id, u]) => ({ id, ...u })) });
});

app.post('/api/admin/add-credits', (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  const { userId, credits } = req.body;
  if (!userId || !credits) return res.status(400).json({ error: 'Missing fields' });
  getUser(userId).credits += parseInt(credits);
  res.json({ success: true, newCredits: users[userId].credits });
});

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏭 MISR STEEL Backend v3`);
  console.log(`✅ Port: ${PORT}`);
  console.log(`🎨 Stability: ${STABILITY_KEY ? 'YES ✅' : 'NO ❌'}`);
  console.log(`🤖 OpenAI: ${OPENAI_KEY ? 'YES' : 'not set'}\n`);
});

module.exports = app;
