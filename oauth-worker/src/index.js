const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};

export async function handleRequest(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ok: true}, 200, env.APP_ORIGIN);
  }
  if (request.method === 'OPTIONS' && url.pathname === '/token') {
    return corsPreflight(request, env.APP_ORIGIN);
  }
  if (request.method !== 'POST' || url.pathname !== '/token') {
    return json({error: 'not_found'}, 404, env.APP_ORIGIN);
  }
  if (request.headers.get('Origin') !== env.APP_ORIGIN) {
    return json({error: 'origin_not_allowed'}, 403, env.APP_ORIGIN);
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.CALLBACK_URL) {
    return json({error: 'server_not_configured'}, 503, env.APP_ORIGIN);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({error: 'invalid_json'}, 400, env.APP_ORIGIN);
  }
  if (
    typeof input?.code !== 'string' ||
    input.code.length < 1 ||
    input.code.length > 512 ||
    typeof input?.code_verifier !== 'string' ||
    input.code_verifier.length < 43 ||
    input.code_verifier.length > 128 ||
    input.redirect_uri !== env.CALLBACK_URL
  ) {
    return json({error: 'invalid_request'}, 400, env.APP_ORIGIN);
  }

  const response = await fetchImpl(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'ReviewStack-OAuth',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: input.code,
      code_verifier: input.code_verifier,
      redirect_uri: env.CALLBACK_URL,
    }),
  });
  const result = await response.json().catch(() => ({error: 'invalid_github_response'}));
  if (response.ok && typeof result.access_token === 'string') {
    return json(
      {
        access_token: result.access_token,
        scope: typeof result.scope === 'string' ? result.scope : '',
        token_type: typeof result.token_type === 'string' ? result.token_type : 'bearer',
      },
      200,
      env.APP_ORIGIN,
    );
  }
  return json(
    {
      error: typeof result.error === 'string' ? result.error : 'github_exchange_failed',
      error_description:
        typeof result.error_description === 'string' ? result.error_description : undefined,
    },
    response.ok ? 502 : response.status,
    env.APP_ORIGIN,
  );
}

function corsPreflight(request, origin) {
  if (request.headers.get('Origin') !== origin) {
    return json({error: 'origin_not_allowed'}, 403, origin);
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function json(value, status, origin) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
