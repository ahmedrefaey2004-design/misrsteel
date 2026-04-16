'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { replace: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--replace') args.replace = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--api') args.api = argv[++i];
    else if (a === '--token') args.token = argv[++i];
  }
  return args;
}

async function requestJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv);
  const apiBase = (args.api || process.env.API_BASE || 'http://localhost:3000').replace(/\/$/, '');
  const token = args.token || process.env.ADMIN_TOKEN;
  const filePath = path.resolve(args.file || process.env.PRODUCTS_FILE || 'data/site-config.json');

  if (!token) {
    throw new Error('ADMIN_TOKEN is required (use --token or env).');
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.products)) {
    throw new Error('Input file must contain a products array.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-admin-token': token
  };

  if (args.replace) {
    const current = await requestJson(`${apiBase}/api/admin/site-config`, { headers });
    const merged = {
      ...current.config,
      ...parsed,
      products: parsed.products
    };

    const saved = await requestJson(`${apiBase}/api/admin/site-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(merged)
    });

    console.log(`✅ Replaced products. Total products: ${saved.config.products.length}`);
    return;
  }

  let success = 0;
  for (const product of parsed.products) {
    try {
      await requestJson(`${apiBase}/api/admin/site-config/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(product)
      });
      success += 1;
      process.stdout.write(`+ ${product.id || product.nameAr || 'product'}\n`);
    } catch (err) {
      process.stderr.write(`! Failed ${product.id || 'unknown'}: ${err.message}\n`);
    }
  }

  console.log(`✅ Uploaded ${success}/${parsed.products.length} products`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
