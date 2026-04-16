'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function getArg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return process.env[name.toUpperCase()] || fallback;
  return process.argv[idx + 1] || fallback;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureUniqueId(products, baseId) {
  let id = baseId;
  let n = 2;
  const used = new Set(products.map((p) => p.id));
  while (used.has(id)) {
    id = `${baseId}-${n}`;
    n += 1;
  }
  return id;
}

function main() {
  const zipPath = path.resolve(getArg('zip'));
  const sectionId = slugify(getArg('section-id'));
  const sectionAr = getArg('section-ar');
  const sectionEn = getArg('section-en');
  const category = getArg('category', 'chairs');
  const priceUsd = Number(getArg('price', '45'));
  const minQty = Number(getArg('min-qty', category === 'tables' ? '20' : '50'));
  const step = Number(getArg('step', category === 'tables' ? '10' : '50'));
  const configFile = path.resolve(getArg('config', 'data/site-config.json'));

  if (!zipPath || !fs.existsSync(zipPath)) {
    throw new Error('Zip file not found. Use --zip /path/to/file.zip');
  }
  if (!sectionId) throw new Error('Missing --section-id');
  if (!sectionAr || !sectionEn) throw new Error('Missing --section-ar or --section-en');
  if (!fs.existsSync(configFile)) throw new Error(`Missing config file: ${configFile}`);

  const imagesDir = path.resolve('images', sectionId);
  fs.mkdirSync(imagesDir, { recursive: true });

  execSync(`unzip -o "${zipPath}" -d "${imagesDir}"`, { stdio: 'inherit' });

  const imageFiles = fs.readdirSync(imagesDir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (imageFiles.length === 0) {
    throw new Error('No images found after unzip (supported: jpg/jpeg/png/webp).');
  }

  const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  data.products = Array.isArray(data.products) ? data.products : [];
  data.sections = Array.isArray(data.sections) ? data.sections : [];
  data.categories = Array.isArray(data.categories) ? data.categories : [];

  if (!data.sections.some((s) => s.id === sectionId)) {
    data.sections.push({ id: sectionId, labelAr: sectionAr, labelEn: sectionEn });
  }

  if (!data.categories.some((c) => c.id === category)) {
    data.categories.push({ id: category, labelAr: category, labelEn: category });
  }

  let imported = 0;
  for (const fileName of imageFiles) {
    const base = path.parse(fileName).name;
    const baseId = slugify(`${sectionId}-${base}`);
    const productId = ensureUniqueId(data.products, baseId);

    data.products.push({
      id: productId,
      nameAr: `منتج ${sectionAr} - ${base}`,
      nameEn: `${sectionEn} Product - ${base}`,
      section: sectionId,
      cat: category,
      descriptionAr: `منتج ضمن قسم ${sectionAr}.`,
      descriptionEn: `Product in ${sectionEn} section.`,
      priceUsd,
      image: `images/${sectionId}/${fileName}`,
      badge: '',
      minQty,
      step
    });

    imported += 1;
  }

  fs.writeFileSync(configFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  console.log(`✅ Imported ${imported} products into section '${sectionId}'.`);
  console.log(`✅ Updated: ${configFile}`);
  console.log(`✅ Images copied to: ${imagesDir}`);
}

try {
  main();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
