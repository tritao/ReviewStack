#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function preparePages(buildDirectory) {
  const index = path.join(buildDirectory, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`Missing Pages entry point: ${index}`);
  fs.copyFileSync(index, path.join(buildDirectory, '404.html'));
  const callbackDirectory = path.join(buildDirectory, 'auth', 'callback');
  fs.mkdirSync(callbackDirectory, {recursive: true});
  fs.copyFileSync(index, path.join(callbackDirectory, 'index.html'));
}

if (require.main === module) preparePages(path.resolve(process.argv[2] ?? 'reviewstack.dev/build'));

module.exports = {preparePages};
