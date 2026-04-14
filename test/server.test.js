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
  const config = { ...createConfig({}), ...configOverrides, usersStoreFile: temp.file };
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
    const app = createApp({ ...createConfig({}), adminToken, usersStoreFile: temp.file });
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
