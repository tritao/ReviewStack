const {expect, test} = require('@playwright/test');

test('login and OAuth callback are served as application routes', async ({page, request}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const callback = await request.get('auth/callback/');
  expect(callback.status()).toBe(200);
  expect(await callback.text()).toContain('<div id="root">');
  await page.goto('./');
  await expect(page.getByRole('button', {name: 'Sign in with GitHub'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('FreeCAD PR exposes layer and commit review modes', async ({browser, baseURL}) => {
  const token = process.env.REVIEWSTACK_E2E_GITHUB_TOKEN;
  test.skip(!token, 'Set REVIEWSTACK_E2E_GITHUB_TOKEN to run the authenticated production check.');
  const context = await browser.newContext();
  await context.addInitScript(githubToken => {
    localStorage.setItem('github.hostname', 'github.com');
    localStorage.setItem('github.token', githubToken);
  }, token);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('FreeCAD/FreeCAD/pull/29700', baseURL).toString());
  await expect(page.getByRole('button', {name: 'Layer', exact: true})).toBeVisible();
  const commit = page.getByRole('button', {name: 'Commit', exact: true});
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page).toHaveURL(/(?:\?|&)mode=commit(?:&|$)/);
  expect(errors).toEqual([]);
  await context.close();
});
