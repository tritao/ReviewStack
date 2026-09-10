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

  await page.setViewportSize({width: 390, height: 844});
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
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
  // The workflow token is read-only, so these are field labels in CI and
  // action buttons for maintainers with write permission.
  await expect(page.getByText('Reviewers', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Labels', {exact: true}).first()).toBeVisible();
  await expect(page.locator('.split-diff-view-file-header').first()).toBeVisible();
  await expect(page.getByText(/^\+\d+$/).first()).toBeVisible();
  await expect(page.getByRole('button', {name: 'Layer', exact: true})).toBeVisible();
  const commit = page.getByRole('button', {name: 'Commit', exact: true});
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page).toHaveURL(/(?:\?|&)mode=commit(?:&|$)/);
  await expect(page.getByRole('heading', {name: 'Commit review'})).toBeVisible();
  await expect(page.getByText('0 of 2 reviewed')).toBeVisible();
  await page.locator('.commit-review-actions').getByRole('button', {name: 'Comment'}).click();
  const reviewDraft = 'Persistent review draft — do not submit';
  const reviewComposer = page.getByPlaceholder('Write a comment...').last();
  await expect(reviewComposer).toBeVisible();
  await expect(page.getByText(/Reviewing after/).last()).toBeAttached();
  const checksSummary = page.getByRole('button', {
    name: /(?:checks|failed|running|need attention).*Open check details/i,
  });
  await expect(checksSummary).toBeVisible();
  await checksSummary.click();
  const checksPanel = page.locator('.reviewstack-pr-timeline details');
  await expect(checksPanel).toBeVisible();
  await checksPanel.locator('summary').click();
  const githubCheckLink = checksPanel.getByRole('link', {name: /^View .* on GitHub$/}).first();
  await expect(githubCheckLink).toBeVisible();
  await expect(
    page.locator('.reviewstack-pr-workspace').getByText('Checks', {exact: true}),
  ).toHaveCount(0);
  await expect(page.getByText('View Details on GitHub', {exact: true})).toHaveCount(0);
  await expect
    .poll(() =>
      githubCheckLink.getByText('GitHub', {exact: true}).evaluate(element => {
        const style = getComputedStyle(element);
        return style.whiteSpace === 'nowrap';
      }),
    )
    .toBe(true);
  await reviewComposer.fill(reviewDraft);
  await page.reload();
  await expect(page.getByPlaceholder('Write a comment...').last()).toHaveValue(reviewDraft);
  const firstCommitURL = page.url();
  await page
    .getByLabel(/Mark .* as viewed/)
    .first()
    .check();
  await page.getByRole('button', {name: 'Reviewed → next'}).click();
  await expect.poll(() => page.url()).not.toBe(firstCommitURL);
  await expect(page.getByText('1 of 2 reviewed')).toBeVisible();
  const stackSelector = page.getByRole('button', {name: /^Pull Request \d+ of \d+$/});
  await expect(stackSelector).toBeVisible();
  await expect
    .poll(() =>
      stackSelector.evaluate(button => {
        const icon = button.querySelector(
          '[data-component="trailingAction"], [data-component="trailingIcon"]',
        );
        if (icon == null) return false;
        const buttonRect = button.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        return (
          iconRect.top >= buttonRect.top &&
          iconRect.bottom <= buttonRect.bottom &&
          iconRect.left >= buttonRect.left &&
          iconRect.right <= buttonRect.right
        );
      }),
    )
    .toBe(true);
  const reviewRail = page.locator('.drawer-right .drawer-label');
  await expect(reviewRail).toBeVisible();
  await expect
    .poll(() =>
      reviewRail.evaluate(label => {
        const labelRect = label.getBoundingClientRect();
        return (
          labelRect.width >= 32 &&
          [...label.children].every(child => {
            const childRect = child.getBoundingClientRect();
            return (
              childRect.top >= labelRect.top - 1 &&
              childRect.bottom <= labelRect.bottom + 1 &&
              childRect.left >= labelRect.left - 1 &&
              childRect.right <= labelRect.right + 1
            );
          })
        );
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
  expect(reactWarnings).toEqual([]);

  await page.setViewportSize({width: 390, height: 844});
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await expect(page.getByText('Review', {exact: true})).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.drawer-bottom .drawer-label').evaluate(element => element.clientHeight),
    )
    .toBeGreaterThanOrEqual(44);
  await context.close();
});
