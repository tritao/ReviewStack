import assert from 'node:assert/strict';
import test from 'node:test';

import {isAllowedRepository, parseAllowedRepositories} from '../src/github.js';

test('parses exact repositories and organization wildcards', () => {
  assert.deepEqual(parseAllowedRepositories('FreeCAD/*,FreeCAD/FreeCAD,invalid/*/*'), [
    'FreeCAD/*',
    'FreeCAD/FreeCAD',
  ]);
});

test('organization wildcard is scoped to that owner', () => {
  const allowed = parseAllowedRepositories('FreeCAD/*,other/repository');

  assert.equal(isAllowedRepository('FreeCAD/FreeCAD', allowed), true);
  assert.equal(isAllowedRepository('FreeCAD/coin', allowed), true);
  assert.equal(isAllowedRepository('Other/project', allowed), false);
  assert.equal(isAllowedRepository('other/repository', allowed), true);
});

test('does not treat a bare wildcard as an allow-all rule', () => {
  const allowed = parseAllowedRepositories('*');

  assert.deepEqual(allowed, []);
  assert.equal(isAllowedRepository('FreeCAD/FreeCAD', allowed), false);
});
