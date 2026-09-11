import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {buildWranglerConfig, ensureKvNamespace, provision} from '../scripts/provision-ci.mjs';

function makeCloudflareFetch({namespaces = [], createdId = 'new-namespace-id'} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({url, init});
    if (init.method === 'POST') {
      return Response.json({success: true, result: {id: createdId}});
    }

    return Response.json({
      success: true,
      result: namespaces,
      result_info: {page: 1, total_pages: 1},
    });
  };

  return {calls, fetchImpl};
}

test('reuses an existing named KV namespace', async () => {
  const {calls, fetchImpl} = makeCloudflareFetch({
    namespaces: [{id: 'existing-id', title: 'reviewstack-mcp'}],
  });

  const result = await ensureKvNamespace({
    fetchImpl,
    accountId: 'account-id',
    apiToken: 'api-token',
  });

  assert.deepEqual(result, {id: 'existing-id', created: false});
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/accounts\/account-id\/storage\/kv\/namespaces/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer api-token');
});

test('creates a KV namespace when the title is absent', async () => {
  const {calls, fetchImpl} = makeCloudflareFetch();
  const result = await ensureKvNamespace({
    fetchImpl,
    accountId: 'account-id',
    apiToken: 'api-token',
  });

  assert.deepEqual(result, {id: 'new-namespace-id', created: true});
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].init.body), {title: 'reviewstack-mcp'});
});

test('handles a concurrent namespace creation', async () => {
  let listCount = 0;
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'POST') {
      return Response.json(
        {success: false, errors: [{message: 'namespace title already exists'}]},
        {status: 409},
      );
    }

    listCount += 1;
    return Response.json({
      success: true,
      result: listCount === 1 ? [] : [{id: 'concurrent-id', title: 'reviewstack-mcp'}],
      result_info: {page: 1, total_pages: 1},
    });
  };

  const result = await ensureKvNamespace({
    fetchImpl,
    accountId: 'account-id',
    apiToken: 'api-token',
  });

  assert.deepEqual(result, {id: 'concurrent-id', created: false});
});

test('writes an ephemeral CI Wrangler config with the OAuth callback', async () => {
  const {fetchImpl} = makeCloudflareFetch();
  const outputPath = `${process.env.RUNNER_TEMP || '/tmp'}/reviewstack-mcp-test.toml`;
  const outputFile = `${outputPath}.outputs`;
  const result = await provision({
    fetchImpl,
    outputPath,
    env: {
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_API_TOKEN: 'api-token',
      REVIEWSTACK_MCP_RESOURCE: 'https://mcp.example.test',
      REVIEWSTACK_MCP_ALLOWED_REPOSITORIES: 'FreeCAD/FreeCAD,FreeCAD/coin',
      REVIEWSTACK_MCP_GITHUB_OAUTH_SCOPE: 'repo read:user',
      GITHUB_OUTPUT: outputFile,
    },
  });

  assert.equal(result.configPath, outputPath);
  const config = await readFile(outputPath, 'utf8');
  assert.match(config, /MCP_ALLOWED_REPOSITORIES = "FreeCAD\/FreeCAD,FreeCAD\/coin"/);
  assert.match(config, /MCP_RESOURCE = "https:\/\/mcp\.example\.test"/);
  assert.match(
    config,
    /GITHUB_OAUTH_CALLBACK_URL = "https:\/\/mcp\.example\.test\/oauth\/github\/callback"/,
  );
  assert.match(config, /GITHUB_OAUTH_SCOPE = "repo read:user"/);
  assert.match(config, /id = "new-namespace-id"/);
});

test('renders TOML safely for values containing quotes', () => {
  const config = buildWranglerConfig({
    kvNamespaceId: 'namespace-id',
    allowedRepositories: 'owner/repo',
    resource: 'https://mcp.example.test/?label="review"',
    githubOAuthCallbackUrl: 'https://mcp.example.test/oauth/github/callback',
  });

  assert.match(config, /name = "reviewstack-mcp"/);
  assert.match(config, /binding = "MCP_KV"/);
  assert.match(config, /label=\\"review\\"/);
});

test('requires a stable callback URL for CI provisioning', async () => {
  const {fetchImpl} = makeCloudflareFetch();
  await assert.rejects(
    provision({
      fetchImpl,
      outputPath: '/tmp/reviewstack-mcp-missing-callback.toml',
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'api-token',
      },
    }),
    /REVIEWSTACK_MCP_GITHUB_OAUTH_CALLBACK_URL is required/,
  );
});
