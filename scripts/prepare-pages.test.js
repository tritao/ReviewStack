const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {preparePages} = require('./prepare-pages');

test('creates the SPA fallback and a real OAuth callback route', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewstack-pages-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'index.html'), '<main>ReviewStack</main>');
  preparePages(directory);
  assert.equal(
    fs.readFileSync(path.join(directory, '404.html'), 'utf8'),
    '<main>ReviewStack</main>',
  );
  assert.equal(
    fs.readFileSync(path.join(directory, 'auth/callback/index.html'), 'utf8'),
    '<main>ReviewStack</main>',
  );
});

test('fails clearly when the build has no entry point', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewstack-pages-'));
  try {
    assert.throws(() => preparePages(directory), /Missing Pages entry point/);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
