'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

function toPositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value));
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
    defaultUsdRate: toPositiveFloat(env.DEFAULT_USD_RATE, 50.85),
    maxPromptLength: toPositiveInt(env.MAX_PROMPT_LENGTH, 1200),
    usersStoreFile: env.USERS_STORE_FILE || path.join(process.cwd(), 'data', 'users.json'),
    siteConfigFile: env.SITE_CONFIG_FILE || path.join(process.cwd(), 'data', 'site-config.json'),
    customersStoreFile: env.CUSTOMERS_STORE_FILE || path.join(process.cwd(), 'data', 'customers.json'),
    ordersStoreFile: env.ORDERS_STORE_FILE || path.join(process.cwd(), 'data', 'orders.json'),
    affiliatesStoreFile: env.AFFILIATES_STORE_FILE || path.join(process.cwd(), 'data', 'affiliates.json')
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
    buttons: [],
    portfolio: []
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
      buttons: Array.isArray(value.buttons) ? value.buttons : [],
      portfolio: Array.isArray(value.portfolio) ? value.portfolio : []
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

  function addToCollection(collection, item) {
    const current = Array.isArray(config[collection]) ? config[collection] : [];
    config[collection] = [...current, item];
    persist();
    return get();
  }

  function updateInCollection(collection, id, patch) {
    const current = Array.isArray(config[collection]) ? config[collection] : [];
    const idx = current.findIndex((item) => item && String(item.id) === String(id));
    if (idx < 0) return null;
    current[idx] = { ...current[idx], ...patch };
    config[collection] = current;
    persist();
    return get();
  }

  function removeFromCollection(collection, id) {
    const current = Array.isArray(config[collection]) ? config[collection] : [];
    const next = current.filter((item) => !item || String(item.id) !== String(id));
    config[collection] = next;
    persist();
    return get();
  }

  load();

  return { get, replace, addProduct, addToCollection, updateInCollection, removeFromCollection, path: resolvedPath };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string' || !passwordHash.includes(':')) return false;
  const [salt, savedHash] = passwordHash.split(':');
  if (!salt || !savedHash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(savedHash, 'hex'), Buffer.from(derived, 'hex'));
}

function createCustomersStore(filePath) {
  const customers = new Map();
  const resolvedPath = path.resolve(filePath);
  let persistenceEnabled = true;

  function persist() {
    if (!persistenceEnabled) return;
    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      const payload = JSON.stringify(Object.fromEntries(customers.entries()), null, 2);
      const tempPath = `${resolvedPath}.tmp`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      fs.renameSync(tempPath, resolvedPath);
    } catch (error) {
      persistenceEnabled = false;
      console.warn(`[customers-store] persistence disabled for ${resolvedPath}: ${error.message}`);
    }
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      for (const [email, customer] of Object.entries(parsed)) {
        customers.set(email.toLowerCase(), customer);
      }
    } catch (error) {
      console.warn(`[customers-store] load failed for ${resolvedPath}: ${error.message}`);
    }
  }

  function getByEmail(email) {
    return customers.get(String(email || '').trim().toLowerCase()) || null;
  }

  function list() {
    return Array.from(customers.values()).map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      phone: item.phone || '',
      country: item.country || '',
      createdAt: item.createdAt
    }));
  }

  function register(payload) {
    const normalizedEmail = String(payload.email || '').trim().toLowerCase();
    if (customers.has(normalizedEmail)) return null;

    const customer = {
      id: crypto.randomUUID(),
      name: payload.name,
      email: normalizedEmail,
      phone: payload.phone || '',
      country: payload.country || '',
      passwordHash: hashPassword(payload.password),
      createdAt: new Date().toISOString()
    };
    customers.set(normalizedEmail, customer);
    persist();
    return customer;
  }

  load();
  return { getByEmail, register, list, path: resolvedPath };
}

function createOrdersStore(filePath) {
  const orders = [];
  const resolvedPath = path.resolve(filePath);
  let persistenceEnabled = true;

  function persist() {
    if (!persistenceEnabled) return;
    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      const payload = JSON.stringify(orders, null, 2);
      const tempPath = `${resolvedPath}.tmp`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      fs.renameSync(tempPath, resolvedPath);
    } catch (error) {
      persistenceEnabled = false;
      console.warn(`[orders-store] persistence disabled for ${resolvedPath}: ${error.message}`);
    }
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) orders.push(...parsed);
    } catch (error) {
      console.warn(`[orders-store] load failed for ${resolvedPath}: ${error.message}`);
    }
  }

  function add(payload) {
    const orderId = crypto.randomUUID();
    const ref = `MS-${new Date().getFullYear()}-${String(orders.length + 1).padStart(5, '0')}`;
    const order = {
      id: orderId,
      orderId,
      ref,
      orderRef: ref,
      createdAt: new Date().toISOString(),
      customerName: payload.customerName || 'عميل',
      customerEmail: payload.customerEmail || '',
      customerPhone: payload.customerPhone || '',
      customerCountry: payload.customerCountry || '',
      items: Array.isArray(payload.items) ? payload.items : [],
      totalUSD: Number.isFinite(Number(payload.totalUSD)) ? Number(payload.totalUSD) : 0,
      depositUSD: Number.isFinite(Number(payload.depositUSD)) ? Number(payload.depositUSD) : 0,
      notes: payload.notes || '',
      affiliateCode: payload.affiliateCode || '',
      source: payload.source || 'website'
    };
    orders.push(order);
    persist();
    return order;
  }

  function list() {
    return [...orders];
  }

  function updateById(id, patch) {
    const idx = orders.findIndex((order) => order && String(order.id) === String(id));
    if (idx < 0) return null;
    orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
    persist();
    return orders[idx];
  }

  load();
  return { add, list, updateById, path: resolvedPath };
}

function createAffiliatesStore(filePath) {
  const affiliates = [];
  const resolvedPath = path.resolve(filePath);
  let persistenceEnabled = true;

  function persist() {
    if (!persistenceEnabled) return;
    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      const payload = JSON.stringify(affiliates, null, 2);
      const tempPath = `${resolvedPath}.tmp`;
      fs.writeFileSync(tempPath, payload, 'utf8');
      fs.renameSync(tempPath, resolvedPath);
    } catch (error) {
      persistenceEnabled = false;
      console.warn(`[affiliates-store] persistence disabled for ${resolvedPath}: ${error.message}`);
    }
  }

  function load() {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) affiliates.push(...parsed);
    } catch (error) {
      console.warn(`[affiliates-store] load failed for ${resolvedPath}: ${error.message}`);
    }
  }

  function generateCode(name) {
    const slug = String(name || 'AFF').replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'AFF';
    let code = '';
    do {
      code = `${slug}${Math.floor(100 + Math.random() * 900)}`;
    } while (affiliates.some((item) => item.code === code));
    return code;
  }

  function register(payload) {
    const phone = String(payload.phone || '').trim();
    if (affiliates.some((item) => item.phone === phone)) return null;
    const affiliate = {
      id: crypto.randomUUID(),
      code: generateCode(payload.name),
      token: crypto.randomUUID(),
      name: String(payload.name || '').trim(),
      phone,
      whatsapp: String(payload.whatsapp || phone).trim(),
      job: String(payload.job || '').trim(),
      facebook: String(payload.facebook || '').trim(),
      commissionRate: 10,
      level: 'starter',
      createdAt: new Date().toISOString()
    };
    affiliates.push(affiliate);
    persist();
    return affiliate;
  }

  function create(payload) {
    const phone = String(payload.phone || '').trim();
    if (affiliates.some((item) => item.phone === phone)) return null;
    const affiliate = {
      id: crypto.randomUUID(),
      code: String(payload.code || generateCode(payload.name)).trim().toUpperCase(),
      token: crypto.randomUUID(),
      name: String(payload.name || '').trim(),
      phone,
      whatsapp: String(payload.whatsapp || phone).trim(),
      job: String(payload.job || '').trim(),
      facebook: String(payload.facebook || '').trim(),
      commissionRate: Number.isFinite(Number(payload.commissionRate)) ? Number(payload.commissionRate) : 10,
      level: String(payload.level || 'starter').trim() || 'starter',
      status: String(payload.status || 'active').trim() || 'active',
      createdAt: new Date().toISOString()
    };
    affiliates.push(affiliate);
    persist();
    return affiliate;
  }

  function findByCodeAndPhone(code, phone) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const normalizedPhone = String(phone || '').trim();
    return affiliates.find((item) => item.code === normalizedCode && item.phone === normalizedPhone) || null;
  }

  function findByCode(code) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    return affiliates.find((item) => item.code === normalizedCode) || null;
  }

  function list() {
    return affiliates.map((item) => ({ ...item }));
  }

  function updateById(id, patch) {
    const idx = affiliates.findIndex((item) => item && String(item.id) === String(id));
    if (idx < 0) return null;
    affiliates[idx] = { ...affiliates[idx], ...patch, updatedAt: new Date().toISOString() };
    persist();
    return { ...affiliates[idx] };
  }

  function removeById(id) {
    const idx = affiliates.findIndex((item) => item && String(item.id) === String(id));
    if (idx < 0) return false;
    affiliates.splice(idx, 1);
    persist();
    return true;
  }

  load();
  return { register, create, findByCodeAndPhone, findByCode, list, updateById, removeById, path: resolvedPath };
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
  const customersStore = createCustomersStore(config.customersStoreFile);
  const ordersStore = createOrdersStore(config.ordersStoreFile);
  const affiliatesStore = createAffiliatesStore(config.affiliatesStoreFile);

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

  app.post('/api/auth/register', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields: name, email, password' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const created = customersStore.register({ name, email, password, phone, country });
    if (!created) return res.status(409).json({ error: 'Email already registered' });

    const token = crypto.randomUUID();
    const user = { id: created.id, name: created.name, email: created.email, phone: created.phone, country: created.country };
    return res.status(201).json({ success: true, token, user });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const customer = customersStore.getByEmail(email);
    if (!customer || !verifyPassword(password, customer.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = crypto.randomUUID();
    const user = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone || '',
      country: customer.country || ''
    };
    return res.json({ success: true, token, user });
  });

  app.post('/api/orders', (req, res) => {
    const customerName = typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : '';
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!customerName) return res.status(400).json({ error: 'customerName is required' });
    if (!items.length) return res.status(400).json({ error: 'items are required' });

    const order = ordersStore.add({
      customerName,
      customerEmail: typeof req.body?.customerEmail === 'string' ? req.body.customerEmail.trim() : '',
      customerPhone: typeof req.body?.customerPhone === 'string' ? req.body.customerPhone.trim() : '',
      customerCountry: typeof req.body?.customerCountry === 'string' ? req.body.customerCountry.trim() : '',
      items,
      totalUSD: req.body?.totalUSD,
      depositUSD: req.body?.depositUSD,
      notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : '',
      affiliateCode: typeof req.body?.affiliateCode === 'string' ? req.body.affiliateCode.trim().toUpperCase() : '',
      source: typeof req.body?.source === 'string' ? req.body.source.trim() : ''
    });

    return res.status(201).json({
      success: true,
      id: order.id,
      orderId: order.orderId,
      ref: order.ref,
      orderRef: order.orderRef,
      order
    });
  });

  app.post('/api/affiliates/register', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

    const affiliate = affiliatesStore.register({
      name,
      phone,
      whatsapp: req.body?.whatsapp,
      job: req.body?.job,
      facebook: req.body?.facebook
    });
    if (!affiliate) return res.status(409).json({ error: 'Phone already registered' });

    return res.status(201).json({
      success: true,
      message: `تم تسجيلك بنجاح — كودك: ${affiliate.code}`,
      affiliate: {
        name: affiliate.name,
        code: affiliate.code
      }
    });
  });

  app.post('/api/affiliates/login', (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!code || !phone) return res.status(400).json({ error: 'code and phone are required' });

    const affiliate = affiliatesStore.findByCodeAndPhone(code, phone);
    if (!affiliate) return res.status(401).json({ error: 'Invalid code or phone' });

    const myOrders = ordersStore.list().filter((order) => String(order.affiliateCode || '').toUpperCase() === affiliate.code);
    const totalSales = myOrders.reduce((sum, order) => sum + (Number(order.totalUSD) || 0), 0);
    const totalOrders = myOrders.length;
    const pendingCommission = totalSales * ((affiliate.commissionRate || 10) / 100);

    return res.json({
      success: true,
      affiliate: {
        id: affiliate.id,
        name: affiliate.name,
        phone: affiliate.phone,
        code: affiliate.code,
        token: affiliate.token,
        commissionRate: affiliate.commissionRate || 10,
        level: affiliate.level || 'starter',
        totalSales,
        totalOrders,
        pendingCommission
      }
    });
  });

  app.get('/api/affiliates/orders', (req, res) => {
    const code = typeof req.query?.code === 'string' ? req.query.code.trim().toUpperCase() : '';
    const token = typeof req.headers['x-aff-token'] === 'string' ? req.headers['x-aff-token'].trim() : '';
    if (!code) return res.status(400).json({ error: 'code is required' });

    const affiliate = affiliatesStore.findByCode(code);
    if (!affiliate) return res.status(404).json({ error: 'Affiliate not found' });
    if (!token || token !== affiliate.token) return res.status(401).json({ error: 'Unauthorized affiliate token' });

    const orders = ordersStore.list().filter((order) => String(order.affiliateCode || '').toUpperCase() === code);
    return res.json({ success: true, total: orders.length, orders });
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

  app.get('/api/settings/public', (req, res) => {
    const siteConfig = siteConfigStore.get();
    const configuredRate = toPositiveFloat(siteConfig?.usdRate, null)
      || toPositiveFloat(siteConfig?.settings?.usdRate, null)
      || toPositiveFloat(siteConfig?.settings?.exchangeRateUsdEgp, null)
      || config.defaultUsdRate;

    res.json({
      success: true,
      currency: 'EGP',
      usdRate: configuredRate
    });
  });

  app.get('/api/portfolio', (req, res) => {
    const siteConfig = siteConfigStore.get();
    const allProjects = Array.isArray(siteConfig?.portfolio)
      ? siteConfig.portfolio
      : (Array.isArray(siteConfig?.projects) ? siteConfig.projects : []);
    const category = typeof req.query?.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const limit = Number.parseInt(req.query?.limit, 10);

    let projects = allProjects.filter((item) => item && typeof item === 'object');
    if (category) {
      projects = projects.filter((item) => String(item.category || '').toLowerCase() === category);
    }
    if (Number.isFinite(limit) && limit > 0) {
      projects = projects.slice(0, limit);
    }

    return res.json({ success: true, total: projects.length, projects });
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

  app.get('/api/admin/customers', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const query = typeof req.query?.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const limit = Number.parseInt(req.query?.limit, 10);
    let customers = customersStore.list();

    if (query) {
      customers = customers.filter((customer) => {
        const haystack = [
          customer.name,
          customer.email,
          customer.phone,
          customer.country
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }
    if (Number.isFinite(limit) && limit > 0) customers = customers.slice(0, limit);

    return res.json({ success: true, total: customers.length, customers });
  });

  app.get('/api/admin/stats', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const orders = ordersStore.list();
    const customers = customersStore.list();
    const affiliates = affiliatesStore.list();

    const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.totalUSD) || 0), 0);
    const newOrders = orders.filter((order) => String(order.status || 'new').toLowerCase() === 'new').length;
    const totalCustomers = customers.length;
    const commissionByCode = new Map(
      affiliates.map((affiliate) => [affiliate.code, Number(affiliate.commissionRate) || 10])
    );
    const pendingCommissions = orders.reduce((sum, order) => {
      const code = String(order.affiliateCode || '').toUpperCase();
      if (!code || !commissionByCode.has(code)) return sum;
      const rate = commissionByCode.get(code);
      return sum + ((Number(order.totalUSD) || 0) * rate / 100);
    }, 0);

    return res.json({
      success: true,
      stats: {
        totalRevenue,
        newOrders,
        totalCustomers,
        pendingCommissions
      }
    });
  });

  app.get('/api/admin/orders', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const status = typeof req.query?.status === 'string' ? req.query.status.trim().toLowerCase() : '';
    const limit = Number.parseInt(req.query?.limit, 10);
    let orders = ordersStore.list();

    if (status) {
      orders = orders.filter((order) => String(order.status || 'new').toLowerCase() === status);
    }
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (Number.isFinite(limit) && limit > 0) {
      orders = orders.slice(0, limit);
    }

    return res.json({ success: true, total: orders.length, orders });
  });

  app.put('/api/admin/orders/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid order payload' });
    }

    const allowedFields = ['status', 'notes', 'depositUSD', 'totalUSD', 'affiliateCode'];
    const patch = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) patch[field] = req.body[field];
    }

    const updated = ordersStore.updateById(id, patch);
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    return res.json({ success: true, order: updated });
  });

  app.get('/api/admin/affiliates', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const orders = ordersStore.list();
    const affiliates = affiliatesStore.list().map((affiliate) => {
      const related = orders.filter((order) => String(order.affiliateCode || '').toUpperCase() === String(affiliate.code || '').toUpperCase());
      const totalSales = related.reduce((sum, order) => sum + (Number(order.totalUSD) || 0), 0);
      const totalOrders = related.length;
      const pendingCommission = totalSales * ((Number(affiliate.commissionRate) || 10) / 100);
      return {
        ...affiliate,
        totalSales,
        totalOrders,
        pendingCommission
      };
    });
    return res.json({ success: true, total: affiliates.length, affiliates });
  });

  app.post('/api/admin/affiliates', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid affiliate payload' });
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

    const affiliate = affiliatesStore.create(req.body);
    if (!affiliate) return res.status(409).json({ error: 'Phone already registered' });
    return res.status(201).json({ success: true, affiliate });
  });

  app.put('/api/admin/affiliates/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid affiliate payload' });
    }

    const allowed = ['name', 'phone', 'whatsapp', 'job', 'facebook', 'commissionRate', 'level', 'status', 'code'];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
    }
    if (typeof patch.code === 'string') patch.code = patch.code.trim().toUpperCase();
    const updated = affiliatesStore.updateById(id, patch);
    if (!updated) return res.status(404).json({ error: 'Affiliate not found' });
    return res.json({ success: true, affiliate: updated });
  });

  app.delete('/api/admin/affiliates/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const removed = affiliatesStore.removeById(id);
    if (!removed) return res.status(404).json({ error: 'Affiliate not found' });
    return res.json({ success: true });
  });

  app.put('/api/admin/affiliates/:id/commission', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Invalid amount' });
    const updated = affiliatesStore.updateById(id, { lastCommissionPayout: amount, lastCommissionPayoutAt: new Date().toISOString() });
    if (!updated) return res.status(404).json({ error: 'Affiliate not found' });
    return res.json({ success: true, affiliate: updated });
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

  app.post('/api/admin/site-config/:collection', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const collection = String(req.params?.collection || '').trim();
    const allowed = new Set(['products', 'categories', 'sections', 'posters', 'buttons', 'portfolio']);
    if (!allowed.has(collection)) return res.status(400).json({ error: 'Unknown collection' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const updated = siteConfigStore.addToCollection(collection, req.body);
    return res.json({ success: true, config: updated });
  });

  app.delete('/api/admin/site-config/:collection/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const collection = String(req.params?.collection || '').trim();
    const itemId = String(req.params?.id || '').trim();
    const allowed = new Set(['products', 'categories', 'sections', 'posters', 'buttons', 'portfolio']);
    if (!allowed.has(collection)) return res.status(400).json({ error: 'Unknown collection' });
    if (!itemId) return res.status(400).json({ error: 'id is required' });

    const updated = siteConfigStore.removeFromCollection(collection, itemId);
    return res.json({ success: true, config: updated });
  });

  app.get('/api/admin/portfolio', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const configValue = siteConfigStore.get();
    const projects = Array.isArray(configValue.portfolio) ? configValue.portfolio : [];
    return res.json({ success: true, total: projects.length, projects });
  });

  app.post('/api/admin/portfolio', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid project payload' });
    }
    const payload = { ...req.body };
    if (!payload.id) payload.id = crypto.randomUUID();
    const updated = siteConfigStore.addToCollection('portfolio', payload);
    return res.status(201).json({ success: true, projects: updated.portfolio || [] });
  });

  app.put('/api/admin/portfolio/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid project payload' });
    }
    const updated = siteConfigStore.updateInCollection('portfolio', id, req.body);
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, projects: updated.portfolio || [] });
  });

  app.delete('/api/admin/portfolio/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const updated = siteConfigStore.removeFromCollection('portfolio', id);
    return res.json({ success: true, projects: updated.portfolio || [] });
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
module.exports.createCustomersStore = createCustomersStore;
module.exports.createOrdersStore = createOrdersStore;
module.exports.createAffiliatesStore = createAffiliatesStore;
