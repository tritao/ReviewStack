const AUTH_SCOPE = 'review:read';
const STATE_TTL_SECONDS = 10 * 60;
const CODE_TTL_SECONDS = 2 * 60;
const ACCESS_TTL_SECONDS = 60 * 60;
const GITHUB_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;
const defaultFetch = (...args) => globalThis.fetch(...args);

export function getIssuer(request, env) {
  return stripTrailingSlash(env.OAUTH_ISSUER || new URL(request.url).origin);
}

export function getResource(request, env) {
  return stripTrailingSlash(env.MCP_RESOURCE || new URL(request.url).origin);
}

export function protectedResourceMetadata(request, env) {
  const issuer = getIssuer(request, env);
  return {
    resource: getResource(request, env),
    authorization_servers: [issuer],
    scopes_supported: [AUTH_SCOPE],
    resource_documentation: `${issuer}/README.md`,
  };
}

export function authorizationServerMetadata(request, env) {
  const issuer = getIssuer(request, env);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    scopes_supported: [AUTH_SCOPE],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

export function unauthorizedResponse(request, env, message = 'Authentication required.') {
  const issuer = getIssuer(request, env);
  const metadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
  return json({error: 'unauthorized', error_description: message}, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}" scope="${AUTH_SCOPE}"`,
  });
}

export async function authenticateRequest(request, env) {
  const token = bearerToken(request);
  if (token == null) {
    return {response: unauthorizedResponse(request, env)};
  }
  const record = await getJson(env, `oauth:access:${token}`);
  if (
    record == null ||
    typeof record.expiresAt !== 'number' ||
    record.expiresAt <= Math.floor(Date.now() / 1000) ||
    record.resource !== getResource(request, env) ||
    record.scope !== AUTH_SCOPE
  ) {
    return {
      response: unauthorizedResponse(request, env, 'The access token is invalid or expired.'),
    };
  }

  const githubRecord = await getJson(env, record.githubTokenKey);
  if (typeof githubRecord?.accessToken !== 'string' || githubRecord.accessToken.length === 0) {
    return {
      response: unauthorizedResponse(request, env, 'The linked GitHub account is unavailable.'),
    };
  }
  return {
    identity: {
      subject: record.subject,
      githubLogin: githubRecord.login ?? null,
      githubToken: githubRecord.accessToken,
    },
  };
}

/**
 * Authenticate the ReviewStack browser API. The browser already has a GitHub
 * token from the standalone app, while ChatGPT has a short-lived MCP token.
 * Accepting both here lets the browser and MCP share one review store without
 * persisting the browser token in Cloudflare storage.
 */
export async function authenticateReviewRequest(request, env, fetchImpl = defaultFetch) {
  const token = bearerToken(request);
  if (token == null) {
    return {response: unauthorizedResponse(request, env)};
  }

  if (env.MCP_KV != null && typeof env.MCP_KV.get === 'function') {
    try {
      const record = await getJson(env, `oauth:access:${token}`);
      if (
        record != null &&
        typeof record.expiresAt === 'number' &&
        record.expiresAt > Math.floor(Date.now() / 1000) &&
        record.resource === getResource(request, env) &&
        record.scope === AUTH_SCOPE
      ) {
        const githubRecord = await getJson(env, record.githubTokenKey);
        if (typeof githubRecord?.accessToken === 'string' && githubRecord.accessToken.length > 0) {
          return {
            identity: {
              subject: record.subject,
              githubLogin: githubRecord.login ?? null,
              githubToken: githubRecord.accessToken,
            },
          };
        }
      }
    } catch {
      // A browser request can still authenticate directly with GitHub if the
      // optional MCP token lookup is unavailable.
    }
  }

  try {
    const profileResponse = await fetchImpl('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ReviewStack-MCP',
      },
    });
    const profile = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !Number.isInteger(profile?.id)) {
      return {
        response: unauthorizedResponse(request, env, 'The GitHub access token is invalid.'),
      };
    }
    return {
      identity: {
        subject: `github:${profile.id}`,
        githubLogin: typeof profile.login === 'string' ? profile.login : null,
        githubToken: token,
      },
    };
  } catch {
    return {
      response: unauthorizedResponse(request, env, 'The GitHub account could not be verified.'),
    };
  }
}

export async function handleAuthorize(request, env) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  const responseType = params.get('response_type');
  const resource = params.get('resource');
  const scope = params.get('scope') || AUTH_SCOPE;
  const state = params.get('state');

  if (
    responseType !== 'code' ||
    !isChatGPTClient(clientId, env) ||
    !isChatGPTRedirect(redirectUri) ||
    !isValidCodeChallenge(codeChallenge) ||
    codeChallengeMethod !== 'S256' ||
    resource !== getResource(request, env) ||
    scope !== AUTH_SCOPE ||
    typeof state !== 'string' ||
    state.length < 1 ||
    state.length > 1024
  ) {
    return textResponse('Invalid OAuth authorization request.', 400);
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return textResponse('ReviewStack MCP is missing GitHub OAuth configuration.', 503);
  }

  const oauthState = randomToken();
  await putJson(
    env,
    `oauth:state:${oauthState}`,
    {
      clientId,
      redirectUri,
      codeChallenge,
      resource,
      scope,
      state,
      createdAt: Math.floor(Date.now() / 1000),
    },
    STATE_TTL_SECONDS,
  );

  const callbackUrl =
    env.GITHUB_OAUTH_CALLBACK_URL || `${getIssuer(request, env)}/oauth/github/callback`;
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set('redirect_uri', callbackUrl);
  githubUrl.searchParams.set('scope', env.GITHUB_OAUTH_SCOPE || 'public_repo read:user');
  githubUrl.searchParams.set('state', oauthState);
  githubUrl.searchParams.set('allow_signup', 'false');
  return new Response(null, {
    status: 302,
    headers: {Location: githubUrl.href, 'Cache-Control': 'no-store'},
  });
}

export async function handleGitHubCallback(request, env, fetchImpl = defaultFetch) {
  const url = new URL(request.url);
  const oauthState = url.searchParams.get('state');
  const githubCode = url.searchParams.get('code');
  if (typeof oauthState !== 'string' || typeof githubCode !== 'string') {
    return textResponse('GitHub authorization was cancelled or did not return a code.', 400);
  }

  const state = await getJson(env, `oauth:state:${oauthState}`);
  await deleteKey(env, `oauth:state:${oauthState}`);
  if (state == null) {
    return textResponse('The OAuth state is invalid or expired.', 400);
  }

  const callbackUrl =
    env.GITHUB_OAUTH_CALLBACK_URL || `${getIssuer(request, env)}/oauth/github/callback`;
  const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'ReviewStack-MCP',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: githubCode,
      redirect_uri: callbackUrl,
    }),
  });
  const tokenValue = await parseJsonOrForm(tokenResponse);
  if (!tokenResponse.ok || typeof tokenValue?.access_token !== 'string') {
    return textResponse('GitHub token exchange failed.', 502);
  }

  const profileResponse = await fetchImpl('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenValue.access_token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ReviewStack-MCP',
    },
  });
  const profile = await profileResponse.json().catch(() => null);
  if (!profileResponse.ok || !Number.isInteger(profile?.id)) {
    return textResponse('Could not identify the GitHub account.', 502);
  }

  const githubTokenKey = `github:user:${profile.id}`;
  await putJson(
    env,
    githubTokenKey,
    {
      accessToken: tokenValue.access_token,
      id: profile.id,
      login: typeof profile.login === 'string' ? profile.login : null,
      updatedAt: Math.floor(Date.now() / 1000),
    },
    GITHUB_TOKEN_TTL_SECONDS,
  );

  const code = randomToken();
  await putJson(
    env,
    `oauth:code:${code}`,
    {
      ...state,
      subject: `github:${profile.id}`,
      githubTokenKey,
      createdAt: Math.floor(Date.now() / 1000),
    },
    CODE_TTL_SECONDS,
  );

  const redirect = new URL(state.redirectUri);
  redirect.searchParams.set('code', code);
  redirect.searchParams.set('state', state.state);
  redirect.searchParams.set('iss', getIssuer(request, env));
  return new Response(null, {
    status: 302,
    headers: {Location: redirect.href, 'Cache-Control': 'no-store'},
  });
}

export async function handleToken(request, env) {
  const input = await formBody(request);
  const code = input.get('code');
  const clientId = input.get('client_id');
  const redirectUri = input.get('redirect_uri');
  const verifier = input.get('code_verifier');
  const grantType = input.get('grant_type');
  const resource = input.get('resource');
  if (
    grantType !== 'authorization_code' ||
    typeof code !== 'string' ||
    typeof clientId !== 'string' ||
    typeof redirectUri !== 'string' ||
    typeof verifier !== 'string' ||
    !isChatGPTClient(clientId, env) ||
    !isChatGPTRedirect(redirectUri) ||
    resource !== getResource(request, env)
  ) {
    return oauthError('invalid_grant', 'Invalid OAuth token request.');
  }

  const record = await getJson(env, `oauth:code:${code}`);
  await deleteKey(env, `oauth:code:${code}`);
  if (
    record == null ||
    record.clientId !== clientId ||
    record.redirectUri !== redirectUri ||
    record.resource !== resource ||
    !(await matchesCodeChallenge(verifier, record.codeChallenge))
  ) {
    return oauthError('invalid_grant', 'The authorization code or PKCE verifier is invalid.');
  }

  const accessToken = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;
  await putJson(
    env,
    `oauth:access:${accessToken}`,
    {
      subject: record.subject,
      githubTokenKey: record.githubTokenKey,
      resource,
      scope: AUTH_SCOPE,
      expiresAt,
    },
    ACCESS_TTL_SECONDS,
  );
  return json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    scope: AUTH_SCOPE,
  });
}

async function formBody(request) {
  const body = await request.text();
  return new URLSearchParams(body);
}

async function parseJsonOrForm(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function bearerToken(request) {
  const header = request.headers.get('Authorization');
  if (header == null) {
    return null;
  }
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function isChatGPTClient(value, env) {
  if (typeof value !== 'string') {
    return false;
  }
  if (typeof env.MCP_ALLOWED_CLIENT_ID === 'string' && env.MCP_ALLOWED_CLIENT_ID.length > 0) {
    return value === env.MCP_ALLOWED_CLIENT_ID;
  }
  return /^https:\/\/chatgpt\.com\/oauth\/(?:client\.json|[A-Za-z0-9_-]+\/client\.json)$/.test(
    value,
  );
}

function isChatGPTRedirect(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'chatgpt.com' && url.hostname !== 'chat.openai.com')
    ) {
      return false;
    }
    return (
      url.pathname === '/connector_platform_oauth_redirect' ||
      /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isValidCodeChallenge(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

async function matchesCodeChallenge(verifier, expected) {
  if (typeof expected !== 'string' || verifier.length < 43 || verifier.length > 128) {
    return false;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest)) === expected;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getJson(env, key) {
  if (env.MCP_KV == null || typeof env.MCP_KV.get !== 'function') {
    throw new Error('MCP_KV is not configured.');
  }
  const value = await env.MCP_KV.get(key);
  if (value == null) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function putJson(env, key, value, expirationTtl) {
  if (env.MCP_KV == null || typeof env.MCP_KV.put !== 'function') {
    throw new Error('MCP_KV is not configured.');
  }
  await env.MCP_KV.put(key, JSON.stringify(value), {expirationTtl});
}

async function deleteKey(env, key) {
  if (env.MCP_KV != null && typeof env.MCP_KV.delete === 'function') {
    await env.MCP_KV.delete(key);
  }
}

function oauthError(error, description) {
  return json({error, error_description: description}, 400);
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function textResponse(value, status = 200) {
  return new Response(value, {
    status,
    headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'},
  });
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}
