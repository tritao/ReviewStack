import assert from 'node:assert/strict';
import test from 'node:test';

import {handleRequest} from '../src/index.js';

class FakeKV {
  values = new Map();

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }
}

function makeEnv() {
  return {
    MCP_KV: new FakeKV(),
    MCP_RESOURCE: 'https://mcp.example.test',
    OAUTH_ISSUER: 'https://mcp.example.test',
    MCP_ALLOWED_REPOSITORIES: 'FreeCAD/FreeCAD',
    GITHUB_CLIENT_ID: 'github-client',
    GITHUB_CLIENT_SECRET: 'github-secret',
    GITHUB_OAUTH_CALLBACK_URL: 'https://mcp.example.test/oauth/github/callback',
    GITHUB_OAUTH_SCOPE: 'public_repo read:user',
  };
}

test('publishes MCP OAuth discovery metadata', async () => {
  const env = makeEnv();
  const protectedResource = await handleRequest(
    new Request('https://mcp.example.test/.well-known/oauth-protected-resource'),
    env,
  );
  assert.equal(protectedResource.status, 200);
  assert.deepEqual(await protectedResource.json(), {
    resource: env.MCP_RESOURCE,
    authorization_servers: [env.OAUTH_ISSUER],
    scopes_supported: ['review:read'],
    resource_documentation: `${env.OAUTH_ISSUER}/README.md`,
  });

  const authorizationServer = await handleRequest(
    new Request('https://mcp.example.test/.well-known/oauth-authorization-server'),
    env,
  );
  assert.equal(authorizationServer.status, 200);
  const metadata = await authorizationServer.json();
  assert.equal(metadata.issuer, env.OAUTH_ISSUER);
  assert.equal(metadata.authorization_endpoint, `${env.OAUTH_ISSUER}/oauth/authorize`);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none']);
});

test('rejects MCP requests without a ChatGPT OAuth access token', async () => {
  const env = makeEnv();
  const response = await handleRequest(new Request('https://mcp.example.test/mcp'), env);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('WWW-Authenticate'), /oauth-protected-resource/);
});

test('completes ChatGPT PKCE login through GitHub and serves MCP tools', async () => {
  const env = makeEnv();
  const verifier = 'a'.repeat(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const clientId = 'https://chatgpt.com/oauth/client.json';
  const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';

  const authorizationUrl = new URL('https://mcp.example.test/oauth/authorize');
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', 'review:read');
  authorizationUrl.searchParams.set('state', 'chatgpt-state');
  authorizationUrl.searchParams.set('resource', env.MCP_RESOURCE);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  const authorizeResponse = await handleRequest(new Request(authorizationUrl), env);
  assert.equal(authorizeResponse.status, 302);
  const githubAuthorizeUrl = new URL(authorizeResponse.headers.get('Location'));
  assert.equal(githubAuthorizeUrl.hostname, 'github.com');
  assert.equal(githubAuthorizeUrl.searchParams.get('scope'), env.GITHUB_OAUTH_SCOPE);
  const githubState = githubAuthorizeUrl.searchParams.get('state');

  const githubFetch = async (url, init) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      assert.match(init.body, /github-code/);
      return Response.json({access_token: 'github-access-token'});
    }
    if (url === 'https://api.github.com/user') {
      assert.equal(init.headers.Authorization, 'Bearer github-access-token');
      return Response.json({id: 42, login: 'reviewer'});
    }
    if (url.startsWith('https://api.github.com/repos/')) {
      return Response.json({
        number: 123,
        title: 'Improve review flow',
        body: 'Review body',
        state: 'open',
        draft: false,
        html_url: 'https://github.com/FreeCAD/FreeCAD/pull/123',
        user: {login: 'author'},
        base: {ref: 'main', sha: '0'.repeat(40), repo: {full_name: 'FreeCAD/FreeCAD'}},
        head: {ref: 'feature', sha: '1'.repeat(40), repo: {full_name: 'FreeCAD/FreeCAD'}},
        labels: [],
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const callbackUrl = new URL('https://mcp.example.test/oauth/github/callback');
  callbackUrl.searchParams.set('code', 'github-code');
  callbackUrl.searchParams.set('state', githubState);
  const callbackResponse = await handleRequest(new Request(callbackUrl), env, githubFetch);
  assert.equal(callbackResponse.status, 302);
  const chatgptCallback = new URL(callbackResponse.headers.get('Location'));
  assert.equal(chatgptCallback.searchParams.get('state'), 'chatgpt-state');
  const authorizationCode = chatgptCallback.searchParams.get('code');

  const tokenResponse = await handleRequest(
    new Request('https://mcp.example.test/oauth/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: env.MCP_RESOURCE,
      }),
    }),
    env,
  );
  assert.equal(tokenResponse.status, 200);
  const token = (await tokenResponse.json()).access_token;

  const initializeResponse = await handleRequest(
    new Request('https://mcp.example.test/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {name: 'test-client', version: '1.0.0'},
        },
      }),
    }),
    env,
    githubFetch,
  );
  assert.equal(initializeResponse.status, 200);
  const initialize = await initializeResponse.json();
  assert.equal(initialize.result.serverInfo.name, 'reviewstack');

  const toolResponse = await handleRequest(
    new Request('https://mcp.example.test/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'reviewstack_get_pull_request',
          arguments: {owner: 'FreeCAD', repo: 'FreeCAD', number: 123},
        },
      }),
    }),
    env,
    githubFetch,
  );
  assert.equal(toolResponse.status, 200);
  const toolResult = await toolResponse.json();
  assert.equal(toolResult.result.structuredContent.number, 123);
});

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
