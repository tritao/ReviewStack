#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const buildDirectory = path.resolve(process.argv[2] ?? 'reviewstack.dev/build');
const maxBytes = Number(process.env.MAX_MAIN_BUNDLE_GZIP_BYTES ?? 230_400);
const manifest = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'asset-manifest.json')));
const mainAsset = manifest.files['main.js'];

if (typeof mainAsset !== 'string') {
  throw new Error('The build manifest does not contain a main.js asset.');
}
if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
  throw new Error('MAX_MAIN_BUNDLE_GZIP_BYTES must be a positive integer.');
}

const staticPathIndex = mainAsset.indexOf('static/');
if (staticPathIndex === -1) {
  throw new Error(`Unexpected main.js asset path: ${mainAsset}`);
}
const assetPath = path.join(buildDirectory, mainAsset.slice(staticPathIndex));
const compressedBytes = zlib.gzipSync(fs.readFileSync(assetPath), {level: 9}).byteLength;
const kibibytes = (compressedBytes / 1024).toFixed(1);
const maxKibibytes = (maxBytes / 1024).toFixed(1);

console.log(`Main bundle: ${kibibytes} KiB gzip (limit: ${maxKibibytes} KiB)`);
if (compressedBytes > maxBytes) {
  throw new Error(`Main bundle exceeds its gzip budget by ${compressedBytes - maxBytes} bytes.`);
}
