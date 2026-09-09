#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const buildDirectory = path.resolve(process.argv[2] ?? 'reviewstack.dev/build');
const port = Number(process.env.PORT ?? 4173);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let relative = decodeURIComponent(url.pathname).replace(/^\/ReviewStack\/?/, '');
    if (relative === '' || relative.endsWith('/')) relative += 'index.html';
    const filename = path.resolve(buildDirectory, relative);
    if (!filename.startsWith(`${buildDirectory}${path.sep}`)) {
      response.writeHead(400).end('Invalid path');
      return;
    }
    const fallback = path.join(buildDirectory, '404.html');
    const servedFile =
      fs.existsSync(filename) && fs.statSync(filename).isFile() ? filename : fallback;
    response.writeHead(servedFile === fallback ? 404 : 200, {
      'Content-Type': contentTypes[path.extname(servedFile)] ?? 'application/octet-stream',
    });
    fs.createReadStream(servedFile).pipe(response);
  })
  .listen(port, '127.0.0.1', () => console.log(`ReviewStack Pages server listening on ${port}`));
