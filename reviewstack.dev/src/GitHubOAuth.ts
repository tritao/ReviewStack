/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const OAUTH_SESSION_KEY = 'reviewstack.github-oauth';

type OAuthSession = {
  state: string;
  verifier: string;
  returnTo: string;
};

type OAuthConfig = {
  clientId: string;
  callbackUrl: string;
  tokenEndpoint: string;
};

type TokenResponse = {
  access_token?: unknown;
  error?: unknown;
  error_description?: unknown;
};

export function getOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.REACT_APP_GITHUB_OAUTH_CLIENT_ID?.trim();
  const callbackUrl = process.env.REACT_APP_GITHUB_OAUTH_CALLBACK_URL?.trim();
  const tokenEndpoint = process.env.REACT_APP_GITHUB_OAUTH_TOKEN_ENDPOINT?.trim();
  if (!clientId || !callbackUrl || !tokenEndpoint) {
    return null;
  }
  return {clientId, callbackUrl, tokenEndpoint};
}

export async function beginGitHubOAuth(config: OAuthConfig): Promise<void> {
  const state = randomUrlSafeString(32);
  const verifier = randomUrlSafeString(64);
  const challenge = await sha256UrlSafe(verifier);
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const session: OAuthSession = {state, verifier, returnTo};
  window.sessionStorage.setItem(OAUTH_SESSION_KEY, JSON.stringify(session));

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl);
  authorizeUrl.searchParams.set('scope', 'public_repo');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(authorizeUrl.toString());
}

export function hasOAuthCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') || params.has('error');
}

export async function finishGitHubOAuth(config: OAuthConfig): Promise<{
  token: string;
  returnTo: string;
}> {
  const params = new URLSearchParams(window.location.search);
  const githubError = params.get('error');
  if (githubError != null) {
    throw new Error(
      params.get('error_description') ?? `GitHub authorization failed: ${githubError}`,
    );
  }

  const code = params.get('code');
  const returnedState = params.get('state');
  const session = readOAuthSession();
  if (!code || !returnedState || session == null || returnedState !== session.state) {
    throw new Error('The GitHub login response could not be verified. Please start again.');
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      code,
      code_verifier: session.verifier,
      redirect_uri: config.callbackUrl,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || typeof body.access_token !== 'string') {
    const detail =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
        ? body.error
        : `token exchange failed (${response.status})`;
    throw new Error(`GitHub login failed: ${detail}`);
  }

  window.sessionStorage.removeItem(OAUTH_SESSION_KEY);
  return {token: body.access_token, returnTo: safeReturnPath(session.returnTo)};
}

function readOAuthSession(): OAuthSession | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(OAUTH_SESSION_KEY) ?? 'null',
    ) as Partial<OAuthSession> | null;
    return value != null &&
      typeof value.state === 'string' &&
      typeof value.verifier === 'string' &&
      typeof value.returnTo === 'string'
      ? (value as OAuthSession)
      : null;
  } catch {
    return null;
  }
}

function safeReturnPath(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function randomUrlSafeString(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}

async function sha256UrlSafe(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
