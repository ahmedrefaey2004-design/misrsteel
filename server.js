'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createConfig(env = process.env) {
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : ['*'];

  return {
    port: toPositiveInt(env.PORT, 3000),
    nodeEnv: env.NODE_ENV || 'development',
    stabilityKey: env.STABILITY_API_KEY || '',
    openaiKey: env.OPENAI_API_KEY || '',
    adminToken: env.ADMIN_TOKEN || '',
    allowedOrigins,
    maxPromptLength: toPositiveInt(env.MAX_PROMPT_LENGTH, 1200),
    generateRateLimit: toPositiveInt(env.GENERATE_RATE_LIMIT, 30),
    generateRateWindowMs: toPositiveInt(env.GENERATE_RATE_WINDOW_MS, 60 * 1000),
    usersStoreFile: env.USERS_STORE_FILE || path.join(process.cwd(), 'data', 'users.json'),
    siteConfigFile: env.SITE_CONFIG_FILE || path.join(process.cwd(), 'data', 'site-config.json')
  };
}

const DEFAULT_USER = Object.freeze({ credits: 2, paid: 0, used: 0, plan: 'free' });
const PLANS = Object.freeze({
  starter: { price_usd: 50, credits: 25, name_en: 'Starter' },
  business: { price_usd: 200, credits: 120, name_en: 'Business' },
  pro: { price_usd: 500, credits: 350, name_en: 'Pro' },
  annual: { price_usd: 4500, credits: 99999, name_en: 'Annual' }
});


const DEFAULT_SITE_CONFIG = Object.freeze({
  sections: [
    { id: 'hero', enabled: true, titleAr: 'أثاث استانلس فاخر', titleEn: 'Premium Stainless Furniture' },
    { id: 'products', enabled: true, titleAr: 'منتجاتنا', titleEn: 'Products' }
  ],
  categories: [
    { id: 'all', labelAr: '⭐ الكل', labelEn: '⭐ All' },
    { id: 'ai-link', type: 'link', link: 'ai-designer.html', labelAr: '🤖 مصمم AI', labelEn: '🤖 AI Designer' },
    { id: 'chairs', labelAr: '🪑 الكراسي', labelEn: '🪑 Chairs' },
    { id: 'tables', labelAr: '🍽 الترابيزات', labelEn: '🍽 Tables' },
    { id: 'lounge', labelAr: '🛋 لاونج', labelEn: '🛋 Lounge' },
    { id: 'velvet', labelAr: '✨ مخمل', labelEn: '✨ Velvet' },
    { id: 'gold', labelAr: '🥇 ذهبي', labelEn: '🥇 Gold' }
  ],
  posters: [
    { id: 'hero-main', titleAr: 'بوستر رئيسي', titleEn: 'Main Poster', image: '', ctaLink: 'shop.html' }
  ],
  buttons: [
    { id: 'ai-nav', labelAr: '🤖 مصمم AI', labelEn: '🤖 AI Designer', link: 'ai-designer.html', visible: true },
    { id: 'shop-main', labelAr: '🛒 تصفح المنتجات', labelEn: '🛒 Browse Products', link: '#products', visible: true },
    { id: 'quote-main', labelAr: 'طلب عرض سعر', labelEn: 'Request a Quote', link: 'shop.html', visible: true },
    { id: 'promo-order', labelAr: 'اطلب الآن', labelEn: 'Order Now', link: 'shop.html', visible: true },
    { id: 'order-main', labelAr: '🛒 اطلب الآن', labelEn: '🛒 Order Now', link: 'shop.html', visible: true }
  ],
  products: []
});

function createUserStore(filePath) {
  const users = new Map();
  const resolvedPath = path.resolve(filePath);

  function ensureDir() {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  function serialize() {
    const obj = Object.fromEntries(users.entries());
    return JSON.stringify(obj, null, 2);
  }

  function persist() {
    ensureDir();
    const tmp = `${resolvedPath}.tmp`;
    fs.writeFileSync(tmp, serialize(), 'utf8');
    fs.renameSync(tmp, resolvedPath);
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      for (const [id, data] of Object.entries(parsed)) {
        users.set(id, {
          credits: toPositiveInt(data.credits, DEFAULT_USER.credits),
          paid: Number.isFinite(Number(data.paid)) ? Number(data.paid) : DEFAULT_USER.paid,
          used: Number.isFinite(Number(data.used)) ? Number(data.used) : DEFAULT_USER.used,
          plan: typeof data.plan === 'string' ? data.plan : DEFAULT_USER.plan
        });
      }
    } catch (err) {
      console.error(`Failed to load users store at ${resolvedPath}:`, err.message);
    }
  }

  function getOrCreate(id) {
    if (!users.has(id)) {
      users.set(id, { ...DEFAULT_USER });
      persist();
    }
    return users.get(id);
  }

  function list() {
    return Array.from(users.entries()).map(([id, user]) => ({ id, ...user }));
  }

  function addCredits(id, amount) {
    const user = getOrCreate(id);
    user.credits += amount;
    persist();
    return user;
  }

  function consumeCredit(id) {
    const user = getOrCreate(id);
    if (user.credits <= 0) return null;
    user.credits -= 1;
    user.used += 1;
    persist();
    return user;
  }

  function applyPlanCredits(id, planId) {
    if (!PLANS[planId]) return null;
    const user = getOrCreate(id);
    user.credits += PLANS[planId].credits;
    user.plan = planId;
    persist();
    return user;
  }

  function has(id) {
    return users.has(id);
  }

  load();

  return {
    getOrCreate,
    list,
    addCredits,
    consumeCredit,
    applyPlanCredits,
    has,
    path: resolvedPath
  };
}


function createSiteConfigStore(filePath) {
  const resolvedPath = path.resolve(filePath);
  let config = JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG));

  function ensureDir() {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  function persist() {
    ensureDir();
    const tmp = `${resolvedPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmp, resolvedPath);
  }

  function normalize(input) {
    const merged = {
      ...JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG)),
      ...(input && typeof input === 'object' ? input : {})
    };

    for (const key of ['sections', 'categories', 'posters', 'buttons', 'products']) {
      if (!Array.isArray(merged[key])) merged[key] = [];
    }

    return merged;
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) {
        persist();
        return;
      }
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) {
        persist();
        return;
      }
      config = normalize(JSON.parse(raw));
      persist();
    } catch (err) {
      console.error(`Failed to load site config at ${resolvedPath}:`, err.message);
      config = JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG));
      persist();
    }
  }

  function get() {
    return JSON.parse(JSON.stringify(config));
  }

  function replace(nextConfig) {
    config = normalize(nextConfig);
    persist();
    return get();
  }

  function updateCollection(name, updater) {
    if (!Array.isArray(config[name])) config[name] = [];
    config[name] = updater(config[name]);
    persist();
    return get();
  }

  load();

  return {
    get,
    replace,
    updateCollection,
    path: resolvedPath
  };
}

function createApp(config = createConfig()) {
  const app = express();
  const rateBuckets = new Map();
  const userStore = createUserStore(config.usersStoreFile);
  const siteConfigStore = createSiteConfigStore(config.siteConfigFile);

  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      if (config.allowedOrigins.includes('*') || !origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin denied'));
    }
  }));
  app.use(express.json({ limit: '1mb' }));

  function getClientKey(req) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const token = req.headers['x-user-token'] || 'anonymous';
    return `${ip}:${String(token)}`;
  }

  function hitRateLimit(key) {
    const now = Date.now();
    const current = rateBuckets.get(key);

    if (!current || now > current.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + config.generateRateWindowMs });
      return false;
    }

    current.count += 1;
    return current.count > config.generateRateLimit;
  }

  function isValidToken(value) {
    if (typeof value !== 'string') return false;
    const token = value.trim();
    if (token.length < 8 || token.length > 200) return false;
    return /^[a-zA-Z0-9._:-]+$/.test(token);
  }

  function requireUserToken(req, res) {
    const token = req.headers['x-user-token'];
    if (!isValidToken(token)) {
      res.status(401).json({ error: 'Invalid or missing user token' });
      return null;
    }
    return token.trim();
  }

  function requireAdminToken(req, res) {
    if (!config.adminToken) {
      res.status(503).json({ error: 'Admin API disabled: ADMIN_TOKEN is not configured' });
      return false;
    }

    if (req.headers['x-admin-token'] !== config.adminToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    return true;
  }

  function requireJsonBody(req, res, next) {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Content-Type must be application/json' });
      return;
    }
    next();
  }

  function parsePositiveInteger(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function parseMerchantOrderId(mid = '') {
    const value = String(mid).trim();
    const index = value.lastIndexOf('_');

    if (index <= 0 || index === value.length - 1) {
      return { userToken: null, planId: null };
    }

    return {
      userToken: value.slice(0, index),
      planId: value.slice(index + 1)
    };
  }

  function sanitizePrompt(prompt) {
    if (typeof prompt !== 'string') return null;
    const normalized = prompt.trim();
    if (!normalized) return null;
    if (normalized.length > config.maxPromptLength) return null;
    return normalized;
  }

  async function genOpenAI(prompt) {
    if (!config.openaiKey) throw new Error('OpenAI key is not configured');

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
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
    if (!response.ok) throw new Error(data?.error?.message || 'OpenAI error');
    if (!data?.data?.[0]?.url) throw new Error('Invalid OpenAI response payload');
    return data.data[0].url;
  }

  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'MISR STEEL API',
      version: '2.3.0',
      env: config.nodeEnv,
      ai: config.stabilityKey ? 'stability' : config.openaiKey ? 'openai' : 'none'
    });
  });

  app.get('/api/credits', (req, res) => {
    const token = requireUserToken(req, res);
    if (!token) return;

    const user = userStore.getOrCreate(token);
    res.json({
      success: true,
      credits: user.credits,
      used: user.used,
      plan: user.plan,
      canGenerate: user.credits > 0
    });
  });

  app.post('/api/generate', requireJsonBody, async (req, res) => {
    const token = requireUserToken(req, res);
    if (!token) return;

    const rateKey = getClientKey(req);
    if (hitRateLimit(rateKey)) {
      return res.status(429).json({ error: 'Too many requests, please retry later' });
    }

    const user = userStore.getOrCreate(token);
    if (user.credits <= 0) {
      return res.status(402).json({ error: 'no_credits', message: 'انتهى رصيدك', credits: 0 });
    }

    const prompt = sanitizePrompt(req.body?.prompt);
    if (!prompt) {
      return res.status(400).json({
        error: `Prompt must be a non-empty string up to ${config.maxPromptLength} characters`
      });
    }

    try {
      let imageUrl = null;

      if (config.stabilityKey) {
        const fd = new FormData();
        fd.append('prompt', prompt);
        fd.append('output_format', 'jpeg');
        fd.append('width', '1024');
        fd.append('height', '1024');

        const stabilityResponse = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.stabilityKey}`,
            Accept: 'application/json',
            ...fd.getHeaders()
          },
          body: fd
        });

        if (stabilityResponse.ok) {
          const data = await stabilityResponse.json();
          if (!data?.image) throw new Error('Invalid Stability response payload');
          imageUrl = `data:image/jpeg;base64,${data.image}`;
        } else if (config.openaiKey) {
          imageUrl = await genOpenAI(prompt);
        } else {
          const err = await stabilityResponse.json().catch(() => ({}));
          return res.status(500).json({ error: err.message || 'Stability AI error' });
        }
      } else if (config.openaiKey) {
        imageUrl = await genOpenAI(prompt);
      } else {
        return res.status(500).json({ error: 'No AI API configured' });
      }

      const updated = userStore.consumeCredit(token);
      if (!updated) {
        return res.status(409).json({ error: 'Credit update failed' });
      }

      return res.json({ success: true, imageUrl, creditsLeft: updated.credits });
    } catch (err) {
      return res.status(500).json({
        error: config.nodeEnv === 'production' ? 'Generation failed' : (err.message || 'Generation failed')
      });
    }
  });

  app.post('/api/payment/callback', requireJsonBody, (req, res) => {
    const data = req.body;
    if (data?.obj?.success === true) {
      const merchantOrderId = data.obj?.order?.merchant_order_id || '';
      const { userToken, planId } = parseMerchantOrderId(merchantOrderId);

      if (userToken && planId && PLANS[planId]) {
        userStore.applyPlanCredits(userToken, planId);
      }
    }

    res.json({ received: true });
  });

  app.get('/api/admin/users', (req, res) => {
    if (!requireAdminToken(req, res)) return;

    const entries = userStore.list().map((user) => ({
      id: user.id,
      credits: user.credits,
      used: user.used,
      plan: user.plan
    }));

    res.json({ total: entries.length, users: entries });
  });

  app.post('/api/admin/add-credits', requireJsonBody, (req, res) => {
    if (!requireAdminToken(req, res)) return;

    const { userId, credits } = req.body || {};
    if (!isValidToken(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const toAdd = parsePositiveInteger(credits);
    if (!toAdd) {
      return res.status(400).json({ error: 'credits must be a positive integer' });
    }

    const user = userStore.addCredits(userId.trim(), toAdd);
    res.json({ success: true, newCredits: user.credits });
  });


  app.get('/api/public/site-config', (req, res) => {
    res.json({ success: true, config: siteConfigStore.get() });
  });

  app.get('/api/admin/site-config', (req, res) => {
    if (!requireAdminToken(req, res)) return;
    res.json({ success: true, config: siteConfigStore.get() });
  });

  app.put('/api/admin/site-config', requireJsonBody, (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const next = req.body;
    if (!next || typeof next !== 'object') {
      return res.status(400).json({ error: 'site config payload must be an object' });
    }
    const saved = siteConfigStore.replace(next);
    return res.json({ success: true, config: saved });
  });

  app.post('/api/admin/site-config/:collection', requireJsonBody, (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const { collection } = req.params;
    if (!['products', 'categories', 'sections', 'posters', 'buttons'].includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }

    const item = req.body;
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ error: 'item payload must be an object' });
    }

    const id = String(item.id || Date.now());
    let updated;
    try {
      updated = siteConfigStore.updateCollection(collection, (arr) => {
        if (arr.some((entry) => String(entry.id) === id)) {
          throw new Error('ID already exists');
        }
        return [...arr, { ...item, id }];
      });
    } catch (err) {
      return res.status(409).json({ error: err.message || 'Unable to add item' });
    }

    return res.json({ success: true, config: updated });
  });

  app.put('/api/admin/site-config/:collection/:id', requireJsonBody, (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const { collection, id } = req.params;
    if (!['products', 'categories', 'sections', 'posters', 'buttons'].includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'item payload must be an object' });
    }

    const updated = siteConfigStore.updateCollection(collection, (arr) =>
      arr.map((entry) => (String(entry.id) === String(id) ? { ...entry, ...payload, id: entry.id } : entry))
    );

    return res.json({ success: true, config: updated });
  });

  app.delete('/api/admin/site-config/:collection/:id', (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const { collection, id } = req.params;
    if (!['products', 'categories', 'sections', 'posters', 'buttons'].includes(collection)) {
      return res.status(404).json({ error: 'Unknown collection' });
    }

    const updated = siteConfigStore.updateCollection(collection, (arr) =>
      arr.filter((entry) => String(entry.id) !== String(id))
    );

    return res.json({ success: true, config: updated });
  });

  app.use((err, req, res, next) => {
    if (err?.message === 'CORS origin denied') {
      return res.status(403).json({ error: 'Origin is not allowed' });
    }

    return res.status(500).json({
      error: config.nodeEnv === 'production' ? 'Internal server error' : (err.message || 'Internal server error')
    });
  });

  const bucketCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets.entries()) {
      if (now > bucket.resetAt) rateBuckets.delete(key);
    }
  }, Math.min(config.generateRateWindowMs, 60 * 1000));
  bucketCleanup.unref();

  return app;
}

function startServer(app, config) {
  const server = app.listen(config.port, () => {
    console.log(`MISR STEEL v2.3.0 on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Stability: ${config.stabilityKey ? 'YES' : 'NO'}`);
    console.log(`OpenAI: ${config.openaiKey ? 'YES' : 'NO'}`);
    console.log(`Admin API: ${config.adminToken ? 'ENABLED' : 'DISABLED (no ADMIN_TOKEN)'}`);
    console.log(`Users store: ${config.usersStoreFile}`);
    console.log(`Site config store: ${config.siteConfigFile}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

const config = createConfig();
const app = createApp(config);

if (require.main === module) {
  startServer(app, config);
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.createConfig = createConfig;
module.exports.startServer = startServer;
module.exports.createUserStore = createUserStore;
module.exports.createSiteConfigStore = createSiteConfigStore;
