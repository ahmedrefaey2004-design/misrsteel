'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createConfig } = require('../server');

function createTempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'misrsteel-test-'));
  return { dir, file: path.join(dir, `${crypto.randomUUID()}.json`) };
}

async function withServer(configOverrides, run) {
  const temp = createTempStorePath();
  const config = {
    ...createConfig({}),
    ...configOverrides,
    usersStoreFile: temp.file,
    siteConfigFile: path.join(temp.dir, 'site-config.json'),
    customersStoreFile: path.join(temp.dir, 'customers.json'),
    ordersStoreFile: path.join(temp.dir, 'orders.json'),
    affiliatesStoreFile: path.join(temp.dir, 'affiliates.json')
  };
  const app = createApp(config);
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    await run(baseUrl, temp.file);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp.dir, { recursive: true, force: true });
  }
}

test('GET / returns health payload', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.service, 'MISR STEEL API');
    assert.equal(json.version, '2.3.0');
  });
});

test('POST /api/generate rejects missing token', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'modern steel chair' })
    });

    assert.equal(res.status, 401);
    const json = await res.json();
    assert.match(json.error, /Invalid or missing user token/i);
  });
});

test('auth register and login endpoints support customer accounts', async () => {
  await withServer({}, async (baseUrl) => {
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ahmed Ali',
        email: 'ahmed@example.com',
        phone: '+201000000000',
        country: 'EG',
        password: 'secret123'
      })
    });

    assert.equal(registerRes.status, 201);
    const registerJson = await registerRes.json();
    assert.equal(registerJson.success, true);
    assert.ok(registerJson.token);
    assert.equal(registerJson.user.email, 'ahmed@example.com');

    const duplicateRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ahmed Ali',
        email: 'ahmed@example.com',
        password: 'secret123'
      })
    });
    assert.equal(duplicateRes.status, 409);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ahmed@example.com',
        password: 'secret123'
      })
    });
    assert.equal(loginRes.status, 200);
    const loginJson = await loginRes.json();
    assert.equal(loginJson.success, true);
    assert.equal(loginJson.user.name, 'Ahmed Ali');

    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ahmed@example.com',
        password: 'wrong-password'
      })
    });
    assert.equal(badLoginRes.status, 401);
  });
});

test('orders endpoint creates orders and returns references', async () => {
  await withServer({}, async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Client One',
        customerPhone: '+201111111111',
        customerCountry: 'EG',
        items: [{ id: 'p-1', nameAr: 'منتج', qty: 2, priceUSD: 100 }],
        totalUSD: 200,
        depositUSD: 100,
        affiliateCode: 'MSA100'
      })
    });

    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    assert.equal(createJson.success, true);
    assert.ok(createJson.orderId);
    assert.ok(createJson.ref);
    assert.equal(createJson.order.affiliateCode, 'MSA100');

    const badRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: '', items: [] })
    });
    assert.equal(badRes.status, 400);
  });
});

test('affiliate register/login/orders endpoints work with affiliate-linked orders', async () => {
  await withServer({}, async (baseUrl) => {
    const registerRes = await fetch(`${baseUrl}/api/affiliates/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Affiliate One',
        phone: '+201222222222',
        whatsapp: '+201222222222'
      })
    });
    assert.equal(registerRes.status, 201);
    const registerJson = await registerRes.json();
    assert.equal(registerJson.success, true);
    const code = registerJson.affiliate.code;
    assert.ok(code);

    const loginRes = await fetch(`${baseUrl}/api/affiliates/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, phone: '+201222222222' })
    });
    assert.equal(loginRes.status, 200);
    const loginJson = await loginRes.json();
    assert.equal(loginJson.success, true);
    assert.equal(loginJson.affiliate.code, code);
    const token = loginJson.affiliate.token;
    assert.ok(token);

    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Order Client',
        customerPhone: '+201333333333',
        items: [{ id: 'p-aff', nameAr: 'منتج مسوق', qty: 1, priceUSD: 80 }],
        totalUSD: 80,
        affiliateCode: code
      })
    });
    assert.equal(orderRes.status, 201);

    const myOrdersRes = await fetch(`${baseUrl}/api/affiliates/orders?code=${code}`, {
      headers: { 'x-aff-token': token }
    });
    assert.equal(myOrdersRes.status, 200);
    const myOrdersJson = await myOrdersRes.json();
    assert.equal(myOrdersJson.success, true);
    assert.equal(myOrdersJson.total, 1);
    assert.equal(myOrdersJson.orders[0].affiliateCode, code);

    const unauthorizedRes = await fetch(`${baseUrl}/api/affiliates/orders?code=${code}`, {
      headers: { 'x-aff-token': 'wrong-token' }
    });
    assert.equal(unauthorizedRes.status, 401);
  });
});

test('portfolio endpoint returns projects and supports category filters', async () => {
  await withServer({ adminToken: 'admin_portfolio' }, async (baseUrl) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': 'admin_portfolio'
    };

    const seedRes = await fetch(`${baseUrl}/api/admin/site-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        portfolio: [
          { id: 1, name: 'Hotel Nile', category: 'hotel', location: 'Cairo' },
          { id: 2, name: 'Royal Hall', category: 'hall', location: 'Alex' }
        ]
      })
    });
    assert.equal(seedRes.status, 200);

    const allRes = await fetch(`${baseUrl}/api/portfolio`);
    assert.equal(allRes.status, 200);
    const allJson = await allRes.json();
    assert.equal(allJson.success, true);
    assert.equal(allJson.total, 2);

    const filteredRes = await fetch(`${baseUrl}/api/portfolio?category=hall`);
    assert.equal(filteredRes.status, 200);
    const filteredJson = await filteredRes.json();
    assert.equal(filteredJson.total, 1);
    assert.equal(filteredJson.projects[0].name, 'Royal Hall');
  });
});

test('admin portfolio CRUD and generic site-config collection endpoints work', async () => {
  await withServer({ adminToken: 'admin_portfolio_crud' }, async (baseUrl) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': 'admin_portfolio_crud'
    };

    const createRes = await fetch(`${baseUrl}/api/admin/portfolio`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'proj-1', name: 'Project 1', category: 'hotel' })
    });
    assert.equal(createRes.status, 201);

    const listRes = await fetch(`${baseUrl}/api/admin/portfolio`, { headers });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.total, 1);

    const updateRes = await fetch(`${baseUrl}/api/admin/portfolio/proj-1`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'Project 1 Updated' })
    });
    assert.equal(updateRes.status, 200);

    const genericAddRes = await fetch(`${baseUrl}/api/admin/site-config/categories`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'cat-1', labelAr: 'قسم' })
    });
    assert.equal(genericAddRes.status, 200);
    const genericAddJson = await genericAddRes.json();
    assert.equal(genericAddJson.config.categories.length, 1);

    const genericDeleteRes = await fetch(`${baseUrl}/api/admin/site-config/categories/cat-1`, {
      method: 'DELETE',
      headers
    });
    assert.equal(genericDeleteRes.status, 200);
    const genericDeleteJson = await genericDeleteRes.json();
    assert.equal(genericDeleteJson.config.categories.length, 0);

    const deleteRes = await fetch(`${baseUrl}/api/admin/portfolio/proj-1`, {
      method: 'DELETE',
      headers
    });
    assert.equal(deleteRes.status, 200);
    const deleteJson = await deleteRes.json();
    assert.equal(deleteJson.projects.length, 0);
  });
});

test('admin routes disabled without ADMIN_TOKEN', async () => {
  await withServer({ adminToken: '' }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users`);
    assert.equal(res.status, 503);

    const json = await res.json();
    assert.match(json.error, /disabled/i);
  });
});

test('admin add credits works with valid token and payload', async () => {
  await withServer({ adminToken: 'admin_token_12345' }, async (baseUrl) => {
    const userToken = 'user_token_12345';

    const addCreditsRes = await fetch(`${baseUrl}/api/admin/add-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'admin_token_12345'
      },
      body: JSON.stringify({ userId: userToken, credits: 7 })
    });

    assert.equal(addCreditsRes.status, 200);
    const addCreditsJson = await addCreditsRes.json();
    assert.equal(addCreditsJson.success, true);
    assert.equal(addCreditsJson.newCredits, 9);

    const listRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'x-admin-token': 'admin_token_12345' }
    });

    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();

    assert.equal(listJson.total, 1);
    assert.equal(listJson.users[0].id, userToken);
    assert.equal(listJson.users[0].credits, 9);
  });
});

test('credits persist after app restart using the same store file', async () => {
  const temp = createTempStorePath();
  const adminToken = 'admin_token_12345';
  const userToken = 'persist_user_123';

  async function runOnce(callback) {
    const app = createApp({
      ...createConfig({}),
      adminToken,
      usersStoreFile: temp.file,
      siteConfigFile: path.join(temp.dir, 'site-config.json')
    });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();

    try {
      await callback(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  try {
    await runOnce(async (baseUrl) => {
      const addCreditsRes = await fetch(`${baseUrl}/api/admin/add-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ userId: userToken, credits: 3 })
      });
      assert.equal(addCreditsRes.status, 200);
    });

    await runOnce(async (baseUrl) => {
      const listRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { 'x-admin-token': adminToken }
      });
      assert.equal(listRes.status, 200);

      const listJson = await listRes.json();
      assert.equal(listJson.users[0].id, userToken);
      assert.equal(listJson.users[0].credits, 5);
    });
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
  }
});

test('site config can be edited from admin API and read publicly', async () => {
  const temp = createTempStorePath();
  const configFile = path.join(temp.dir, 'site-config.json');
  const adminToken = 'admin_token_site_config';

  async function runOnce(callback) {
    const app = createApp({
      ...createConfig({}),
      adminToken,
      usersStoreFile: temp.file,
      siteConfigFile: configFile
    });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();

    try {
      await callback(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  try {
    await runOnce(async (baseUrl) => {
      const addRes = await fetch(`${baseUrl}/api/admin/site-config/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({
          id: 'chair-1',
          nameAr: 'كرسي ذهبي',
          section: 'hall'
        })
      });

      assert.equal(addRes.status, 200);
      const addJson = await addRes.json();
      assert.equal(addJson.config.products.length, 1);
      assert.equal(addJson.config.products[0].id, 'chair-1');
    });

    await runOnce(async (baseUrl) => {
      const publicRes = await fetch(`${baseUrl}/api/site-config`);
      assert.equal(publicRes.status, 200);
      const publicJson = await publicRes.json();
      assert.equal(publicJson.config.products.length, 1);
      assert.equal(publicJson.config.products[0].id, 'chair-1');
    });
  } finally {
    fs.rmSync(temp.dir, { recursive: true, force: true });
  }
});

test('products endpoints expose list and item details from site config', async () => {
  await withServer({ adminToken: 'admin_token_products' }, async (baseUrl) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': 'admin_token_products'
    };

    const seedRes = await fetch(`${baseUrl}/api/admin/site-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        products: [
          { id: 'p-100', nameAr: 'كرسي قاعة فاخر', section: 'hall', category: 'chairs' },
          { id: 'p-101', nameAr: 'كرسي مطعم', section: 'restaurant', category: 'chairs' }
        ]
      })
    });
    assert.equal(seedRes.status, 200);

    const listRes = await fetch(`${baseUrl}/api/products?section=hall`);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.success, true);
    assert.equal(listJson.total, 1);
    assert.equal(listJson.products[0].id, 'p-100');

    const itemRes = await fetch(`${baseUrl}/api/products/p-101`);
    assert.equal(itemRes.status, 200);
    const itemJson = await itemRes.json();
    assert.equal(itemJson.success, true);
    assert.equal(itemJson.product.id, 'p-101');

    const missingRes = await fetch(`${baseUrl}/api/products/missing-id`);
    assert.equal(missingRes.status, 404);
  });
});

test('public settings endpoint returns USD rate with configured fallback', async () => {
  await withServer({ adminToken: 'admin_token_settings', defaultUsdRate: 51.25 }, async (baseUrl) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': 'admin_token_settings'
    };

    const fallbackRes = await fetch(`${baseUrl}/api/settings/public`);
    assert.equal(fallbackRes.status, 200);
    const fallbackJson = await fallbackRes.json();
    assert.equal(fallbackJson.success, true);
    assert.equal(fallbackJson.usdRate, 51.25);

    const seedRes = await fetch(`${baseUrl}/api/admin/site-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        settings: { usdRate: 49.9 }
      })
    });
    assert.equal(seedRes.status, 200);

    const configuredRes = await fetch(`${baseUrl}/api/settings/public`);
    assert.equal(configuredRes.status, 200);
    const configuredJson = await configuredRes.json();
    assert.equal(configuredJson.success, true);
    assert.equal(configuredJson.currency, 'EGP');
    assert.equal(configuredJson.usdRate, 49.9);
  });
});

test('admin site-config endpoints support replace and validate payloads', async () => {
  await withServer({ adminToken: 'admin_token_site_config' }, async (baseUrl) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': 'admin_token_site_config'
    };

    const updateRes = await fetch(`${baseUrl}/api/admin/site-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        categories: [{ id: 'chairs', labelAr: 'كراسي' }],
        sections: [{ id: 'hall', labelAr: 'القاعات' }],
        products: [{ id: 'p-1', nameAr: 'منتج 1' }]
      })
    });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.config.products.length, 1);
    assert.equal(updateJson.config.categories.length, 1);

    const adminGetRes = await fetch(`${baseUrl}/api/admin/site-config`, { headers });
    assert.equal(adminGetRes.status, 200);
    const adminGetJson = await adminGetRes.json();
    assert.equal(adminGetJson.config.sections.length, 1);
    assert.equal(adminGetJson.config.products[0].id, 'p-1');

    const badProductRes = await fetch(`${baseUrl}/api/admin/site-config/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify([])
    });
    assert.equal(badProductRes.status, 400);
  });
});

test('meta catalog CSV endpoint exports products in feed format', async () => {
  await withServer({ adminToken: 'admin_token_meta' }, async (baseUrl) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': 'admin_token_meta'
    };

    const seedRes = await fetch(`${baseUrl}/api/admin/site-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        products: [{
          id: 'chair-101',
          nameAr: 'كرسي ستانلس فاخر',
          desc: 'كرسي مناسب للمطاعم والقاعات',
          price: 120,
          imgs: ['images/chair-101.jpg'],
          inStock: true
        }]
      })
    });
    assert.equal(seedRes.status, 200);

    const csvRes = await fetch(`${baseUrl}/api/meta/catalog.csv?siteUrl=https://misrsteel.example`);
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get('content-type') || '', /text\/csv/i);

    const csv = await csvRes.text();
    assert.match(csv, /id,title,description,availability,condition,price,link,image_link,brand/);
    assert.match(csv, /"chair-101"/);
    assert.match(csv, /"120\.00 USD"/);
    assert.match(csv, /"https:\/\/misrsteel\.example\/product\.html\?id=chair-101"/);
    assert.match(csv, /"https:\/\/misrsteel\.example\/images\/chair-101\.jpg"/);
  });
});
