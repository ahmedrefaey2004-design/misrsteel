'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const APP_VERSION = '2.3.0';
const DEFAULT_USER = Object.freeze({ credits: 2, paid: 0, used: 0, plan: 'free' });
const PLANS = Object.freeze({
  starter: { price_usd: 50, credits: 25, name_en: 'Starter' },
  business: { price_usd: 200, credits: 120, name_en: 'Business' },
  pro: { price_usd: 500, credits: 350, name_en: 'Pro' },
  annual: { price_usd: 4500, credits: 99999, name_en: 'Annual' }
});

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createConfig(env = process.env) {
  return {
    port: toPositiveInt(env.PORT, 3000),
    nodeEnv: env.NODE_ENV || 'development',
    stabilityKey: env.STABILITY_API_KEY || '',
    openaiKey: env.OPENAI_API_KEY || '',
    adminToken: env.ADMIN_TOKEN || '',
    allowedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
      : ['*'],
    maxPromptLength: toPositiveInt(env.MAX_PROMPT_LENGTH, 1200),
    usersStoreFile: env.USERS_STORE_FILE || path.join(process.cwd(), 'data', 'users.json'),
    siteConfigFile: env.SITE_CONFIG_FILE || path.join(process.cwd(), 'data', 'site-config.json')
  };
}

function createUserStore(filePath) {
  const users = new Map();
  const resolvedPath = path.resolve(filePath);
  let persistenceEnabled = true;

  function persist() {
    if (!persistenceEnabled) return;
    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      const payload = JSON.stringify(Object.fromEntries(users.entries()), null, 2);
      const tempPath = `${resolvedPath}.tmp`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      fs.renameSync(tempPath, resolvedPath);
    } catch (error) {
      persistenceEnabled = false;
      console.warn(`[user-store] persistence disabled for ${resolvedPath}: ${error.message}`);
    }
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) return;

      const parsed = JSON.parse(raw);
      for (const [id, user] of Object.entries(parsed)) {
        users.set(id, {
          credits: Number.isFinite(Number(user.credits)) ? Number(user.credits) : DEFAULT_USER.credits,
          paid: Number.isFinite(Number(user.paid)) ? Number(user.paid) : DEFAULT_USER.paid,
          used: Number.isFinite(Number(user.used)) ? Number(user.used) : DEFAULT_USER.used,
          plan: typeof user.plan === 'string' ? user.plan : DEFAULT_USER.plan
        });
      }
    } catch (error) {
      console.warn(`[user-store] load failed for ${resolvedPath}: ${error.message}`);
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

  function addCredits(id, credits) {
    const user = getOrCreate(id);
    user.credits += credits;
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

  function applyPlan(id, planId) {
    const plan = PLANS[planId];
    if (!plan) return null;
    const user = getOrCreate(id);
    user.credits += plan.credits;
    user.plan = planId;
    persist();
    return user;
  }

  load();

  return { getOrCreate, list, addCredits, consumeCredit, applyPlan, path: resolvedPath };
}

function createSiteConfigStore(filePath) {
  const resolvedPath = path.resolve(filePath);
  let persistenceEnabled = true;
  const DEFAULT_SITE_CONFIG = Object.freeze({
    products: [],
    categories: [],
    sections: [],
    posters: [],
    buttons: []
  });
  let config = { ...DEFAULT_SITE_CONFIG };

  function normalizeSiteConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_SITE_CONFIG };
    return {
      ...value,
      products: Array.isArray(value.products) ? value.products : [],
      categories: Array.isArray(value.categories) ? value.categories : [],
      sections: Array.isArray(value.sections) ? value.sections : [],
      posters: Array.isArray(value.posters) ? value.posters : [],
      buttons: Array.isArray(value.buttons) ? value.buttons : []
    };
  }

  function persist() {
    if (!persistenceEnabled) return;
    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      const payload = JSON.stringify(config, null, 2);
      const tempPath = `${resolvedPath}.tmp`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      fs.renameSync(tempPath, resolvedPath);
    } catch (error) {
      persistenceEnabled = false;
      console.warn(`[site-config] persistence disabled for ${resolvedPath}: ${error.message}`);
    }
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) return;
      config = normalizeSiteConfig(JSON.parse(raw));
    } catch (error) {
      console.warn(`[site-config] load failed for ${resolvedPath}: ${error.message}`);
    }
  }

  function get() {
    return JSON.parse(JSON.stringify(config));
  }

  function replace(nextConfig) {
    config = normalizeSiteConfig(nextConfig);
    persist();
    return get();
  }

  function addProduct(product) {
    config.products = [...config.products, product];
    persist();
    return get();
  }

  load();

  return { get, replace, addProduct, path: resolvedPath };
}

function isValidUserToken(token) {
  return typeof token === 'string' && /^[a-zA-Z0-9._:-]{8,200}$/.test(token.trim());
}

async function generateWithStability(prompt, key) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'jpeg');
  form.append('width', '1024');
  form.append('height', '1024');

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...form.getHeaders()
    },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stability API error: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  return `data:image/jpeg;base64,${data.image}`;
}

function createApp(config = createConfig()) {
  const app = express();
  const userStore = createUserStore(config.usersStoreFile);
  const siteConfigStore = createSiteConfigStore(config.siteConfigFile);

  app.disable('x-powered-by');
  app.use(cors({ origin: config.allowedOrigins.includes('*') ? '*' : config.allowedOrigins }));
  app.use(express.json({ limit: '2mb' }));

  function requireUserToken(req, res) {
    const token = req.headers['x-user-token'];
    if (!isValidUserToken(token)) {
      res.status(401).json({ error: 'Invalid or missing user token' });
      return null;
    }
    return token.trim();
  }

  function requireAdmin(req, res) {
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

  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'MISR STEEL API', version: APP_VERSION });
  });

  app.get('/api/credits', (req, res) => {
    const token = requireUserToken(req, res);
    if (!token) return;
    const user = userStore.getOrCreate(token);
    res.json({ success: true, credits: user.credits, used: user.used, plan: user.plan, canGenerate: user.credits > 0 });
  });

  app.post('/api/generate', async (req, res) => {
    const token = requireUserToken(req, res);
    if (!token) return;

    const user = userStore.getOrCreate(token);
    if (user.credits <= 0) {
      return res.status(402).json({ error: 'no_credits', message: 'انتهى رصيدك', credits: 0 });
    }

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });
    if (prompt.length > config.maxPromptLength) return res.status(400).json({ error: 'Prompt too long' });

    try {
      const imageUrl = config.stabilityKey
        ? await generateWithStability(prompt, config.stabilityKey)
        : 'https://placehold.co/1024x1024/jpeg?text=MISR+STEEL+Preview';

      const updated = userStore.consumeCredit(token);
      return res.json({ success: true, imageUrl, creditsLeft: updated ? updated.credits : 0 });
    } catch (error) {
      return res.status(502).json({ error: 'generation_failed', details: error.message });
    }
  });

  app.get('/api/plans', (req, res) => {
    res.json({ success: true, plans: PLANS });
  });

  app.get('/api/site-config', (req, res) => {
    res.json({ success: true, config: siteConfigStore.get() });
  });

  app.get('/api/products', (req, res) => {
    const siteConfig = siteConfigStore.get();
    const allProducts = Array.isArray(siteConfig.products) ? siteConfig.products : [];
    const section = typeof req.query?.section === 'string' ? req.query.section.trim().toLowerCase() : '';
    const category = typeof req.query?.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const search = typeof req.query?.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const limit = Number.parseInt(req.query?.limit, 10);

    let products = allProducts.filter((product) => product && typeof product === 'object');

    if (section) {
      products = products.filter((product) => String(product.section || '').toLowerCase() === section);
    }

    if (category) {
      products = products.filter((product) => String(product.category || '').toLowerCase() === category);
    }

    if (search) {
      products = products.filter((product) => {
        const haystack = [
          product.id,
          product.nameAr,
          product.nameEn,
          product.name,
          product.desc,
          product.description
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }

    if (Number.isFinite(limit) && limit > 0) {
      products = products.slice(0, limit);
    }

    res.json({ success: true, total: products.length, products });
  });

  app.get('/api/products/:id', (req, res) => {
    const siteConfig = siteConfigStore.get();
    const products = Array.isArray(siteConfig.products) ? siteConfig.products : [];
    const targetId = String(req.params?.id || '').trim();

    const product = products.find((item) => item && String(item.id) === targetId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    return res.json({ success: true, product });
  });

  app.get('/api/meta/catalog.csv', (req, res) => {
    const siteConfig = siteConfigStore.get();
    const products = Array.isArray(siteConfig.products) ? siteConfig.products : [];
    const siteBaseUrl = (req.query?.siteUrl || 'https://misrsteel.vercel.app').toString().replace(/\/+$/, '');
    const imageBaseUrl = (req.query?.imageBaseUrl || siteBaseUrl).toString().replace(/\/+$/, '');
    const defaultBrand = (req.query?.brand || 'MISR STEEL').toString();
    const defaultCurrency = (req.query?.currency || 'USD').toString().toUpperCase();

    const columns = [
      'id',
      'title',
      'description',
      'availability',
      'condition',
      'price',
      'link',
      'image_link',
      'brand'
    ];

    function csvEscape(value) {
      const stringValue = String(value ?? '').replace(/\r?\n|\r/g, ' ').trim();
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    function buildAbsoluteUrl(baseUrl, maybeRelativePath) {
      if (!maybeRelativePath) return '';
      if (/^https?:\/\//i.test(maybeRelativePath)) return maybeRelativePath;
      return `${baseUrl}/${String(maybeRelativePath).replace(/^\/+/, '')}`;
    }

    const lines = [columns.join(',')];
    for (const product of products) {
      if (!product || typeof product !== 'object') continue;
      const id = product.id ?? '';
      const title = product.nameAr || product.nameEn || product.name || '';
      if (!id || !title) continue;

      const unitPrice = Number(product.price);
      const price = Number.isFinite(unitPrice) && unitPrice > 0
        ? `${unitPrice.toFixed(2)} ${defaultCurrency}`
        : '';
      const image = Array.isArray(product.imgs) && product.imgs.length > 0
        ? buildAbsoluteUrl(imageBaseUrl, product.imgs[0])
        : '';
      const row = [
        id,
        title,
        product.desc || product.description || title,
        product.inStock === false ? 'out of stock' : 'in stock',
        'new',
        price,
        `${siteBaseUrl}/product.html?id=${encodeURIComponent(String(id))}`,
        image,
        product.brand || defaultBrand
      ];
      lines.push(row.map(csvEscape).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="meta-catalog.csv"');
    res.send(lines.join('\n'));
  });

  app.post('/api/admin/users', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ total: userStore.list().length, users: userStore.list() });
  });

  app.get('/api/admin/users', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ total: userStore.list().length, users: userStore.list() });
  });

  app.post('/api/admin/add-credits', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const credits = Number.parseInt(req.body?.credits, 10);

    if (!isValidUserToken(userId)) return res.status(400).json({ error: 'Invalid userId' });
    if (!Number.isFinite(credits) || credits <= 0) return res.status(400).json({ error: 'Invalid credits' });

    const user = userStore.addCredits(userId, credits);
    return res.json({ success: true, newCredits: user.credits });
  });

  app.post('/api/admin/apply-plan', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const planId = typeof req.body?.planId === 'string' ? req.body.planId.trim() : '';
    if (!isValidUserToken(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const user = userStore.applyPlan(userId, planId);
    if (!user) return res.status(400).json({ error: 'Unknown plan' });

    return res.json({ success: true, user });
  });

  app.get('/api/admin/site-config', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ success: true, config: siteConfigStore.get() });
  });

  app.put('/api/admin/site-config', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid config payload' });
    }
    const updated = siteConfigStore.replace(req.body);
    return res.json({ success: true, config: updated });
  });

  app.post('/api/admin/site-config/products', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid product payload' });
    }

    const updated = siteConfigStore.addProduct(req.body);
    return res.json({ success: true, config: updated });
  });

  return app;
}

function startServer(app, config) {
  const server = app.listen(config.port, () => {
    console.log(`MISR STEEL v${APP_VERSION} on port ${config.port}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
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
