import publicAssetURL from './publicAssetURL';

test('resolves assets at the origin root for local development', () => {
  expect(publicAssetURL('/generated/textmate/onig.wasm', '')).toBe(
    '/generated/textmate/onig.wasm',
  );
});

test('resolves assets below a deployment base path', () => {
  expect(publicAssetURL('generated/textmate/onig.wasm', '/ReviewStack/')).toBe(
    '/ReviewStack/generated/textmate/onig.wasm',
  );
});
