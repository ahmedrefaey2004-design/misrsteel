'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createConfig } = require('../server');

async function withServer(configOverrides, run) {
  const config = { ...createConfig({}), ...configOverrides };
  const app = createApp(config);
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET / returns health payload', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.service, 'MISR STEEL API');
    assert.equal(json.version, '2.2.1');
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
