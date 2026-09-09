/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* Builds the standalone application and creates its GitHub Pages fallbacks. */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const buildDirectory = path.join(__dirname, 'build');
fs.rmSync(buildDirectory, {force: true, recursive: true});
childProcess.execSync('yarn run build', {stdio: 'inherit'});

const index = path.join(buildDirectory, 'index.html');
fs.copyFileSync(index, path.join(buildDirectory, '404.html'));
const callbackDirectory = path.join(buildDirectory, 'auth', 'callback');
fs.mkdirSync(callbackDirectory, {recursive: true});
fs.copyFileSync(index, path.join(callbackDirectory, 'index.html'));
