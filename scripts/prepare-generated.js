/** Prepare ignored build inputs from checked-in sources and locked dependencies. */
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
childProcess.execFileSync('yarn', ['workspace', 'reviewstack', 'graphql'], {
  cwd: root,
  stdio: 'inherit',
});

const wasmSource = path.join(root, 'node_modules/vscode-oniguruma/release/onig.wasm');
const wasmDestination = path.join(
  root,
  'reviewstack.dev/public/generated/textmate/onig.wasm',
);
fs.mkdirSync(path.dirname(wasmDestination), {recursive: true});
fs.copyFileSync(wasmSource, wasmDestination);
