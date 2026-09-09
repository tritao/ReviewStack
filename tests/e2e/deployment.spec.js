const {expect, test} = require('@playwright/test');

test('login and OAuth callback are served as application routes', async ({
  page,
  request,
  baseURL,
}) => {
  const errors = [];
  const thirdPartyScripts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (
      request.resourceType() === 'script' &&
      new URL(request.url()).origin !== new URL(baseURL).origin
    ) {
      thirdPartyScripts.push(request.url());
    }
  });
  const callback = await request.get('auth/callback/');
  expect(callback.status()).toBe(200);
  expect(await callback.text()).toContain('<div id="root">');
  await page.goto('./');
  await expect(page.getByText(/^Sign in with (GitHub|a token)$/).first()).toBeVisible();
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'self' https://api.github.com");
  const connectSources = csp
    .split(';')
    .find(directive => directive.trim().startsWith('connect-src'))
    .trim()
    .split(/\s+/);
  expect(connectSources).not.toContain('https:');
  const scriptSources = await page
    .locator('script[src]')
    .evaluateAll(scripts => scripts.map(script => script.src));
  expect(scriptSources.length).toBeGreaterThan(0);
  expect(scriptSources.every(source => new URL(source).origin === new URL(baseURL).origin)).toBe(
    true,
  );
  expect(thirdPartyScripts).toEqual([]);
  expect(errors).toEqual([]);
});

test('fixture PR exposes layer and commit review modes', async ({browser, baseURL, request}) => {
  const token = process.env.REVIEWSTACK_E2E_GITHUB_TOKEN;
  test.skip(!token, 'Set REVIEWSTACK_E2E_GITHUB_TOKEN to run the authenticated production check.');

  const apiResponse = await request.post('https://api.github.com/graphql', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
    data: {
      query: `query ReviewStackFixture {
        repository(owner: "tritao", name: "ReviewStack") {
          pullRequest(number: 1) { number }
        }
      }`,
    },
  });
  const apiBody = await apiResponse.json().catch(() => null);
  if (!apiResponse.ok() || apiBody?.data?.repository?.pullRequest?.number !== 1) {
    throw new Error(
      `GitHub fixture preflight failed (${apiResponse.status()}): ${JSON.stringify(apiBody)}`,
    );
  }

  const context = await browser.newContext();
  await context.addInitScript(githubToken => {
    localStorage.setItem('github.hostname', 'github.com');
    localStorage.setItem('github.token', githubToken);
  }, token);
  const page = await context.newPage();
  const errors = [];
  const reactWarnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (
      message.type() === 'warning' &&
      /unique "key" prop|Unknown event handler property|not implemented/.test(message.text())
    ) {
      reactWarnings.push(message.text());
    }
  });
  await page.goto(new URL('tritao/ReviewStack/pull/1', baseURL).toString());
  await expect(page.getByRole('button', {name: 'Reviewers', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Labels', exact: true})).toBeVisible();
  await expect(page.locator('.split-diff-view-file-header').first()).toBeVisible();
  await expect(page.getByText(/^\+\d+$/).first()).toBeVisible();
  await expect(page.getByRole('button', {name: 'Layer', exact: true})).toBeVisible();
  const commit = page.getByRole('button', {name: 'Commit', exact: true});
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page).toHaveURL(/(?:\?|&)mode=commit(?:&|$)/);
  expect(errors).toEqual([]);
  expect(reactWarnings).toEqual([]);
  await context.close();
});
