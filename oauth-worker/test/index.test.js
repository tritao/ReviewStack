import assert from 'node:assert/strict';
import test from 'node:test';

import {handleRequest} from '../src/index.js';

const env = {
  APP_ORIGIN: 'https://tritao.github.io',
  CALLBACK_URL: 'https://tritao.github.io/ReviewStack/auth/callback',
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
};

test('rejects token requests from another origin', async () => {
  const request = new Request('https://worker.example/token', {
    method: 'POST',
    headers: {Origin: 'https://attacker.example', 'Content-Type': 'application/json'},
    body: '{}',
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {error: 'origin_not_allowed'});
});

test('exchanges a valid code without exposing the secret to the client', async () => {
  let githubRequest;
  const request = new Request('https://worker.example/token', {
    method: 'POST',
    headers: {Origin: env.APP_ORIGIN, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      code: 'temporary-code',
      code_verifier: 'pkce-verifier-that-is-at-least-forty-three-characters',
      redirect_uri: env.CALLBACK_URL,
    }),
  });
  const response = await handleRequest(request, env, async (_url, init) => {
    githubRequest = JSON.parse(init.body);
    return Response.json({access_token: 'secret-token', token_type: 'bearer'});
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.APP_ORIGIN);
  assert.deepEqual(await response.json(), {
    access_token: 'secret-token',
    scope: '',
    token_type: 'bearer',
  });
  assert.deepEqual(githubRequest, {
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code: 'temporary-code',
    code_verifier: 'pkce-verifier-that-is-at-least-forty-three-characters',
    redirect_uri: env.CALLBACK_URL,
  });
});

test('requires the configured callback URL', async () => {
  const request = new Request('https://worker.example/token', {
    method: 'POST',
    headers: {Origin: env.APP_ORIGIN, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      code: 'code',
      code_verifier: 'pkce-verifier-that-is-at-least-forty-three-characters',
      redirect_uri: 'https://evil.example',
    }),
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {error: 'invalid_request'});
});
