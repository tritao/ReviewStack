import {appendFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const DEFAULT_NAMESPACE_TITLE = 'reviewstack-mcp';
const DEFAULT_DATABASE_NAME = 'reviewstack-reviews';
const DEFAULT_ALLOWED_REPOSITORIES = 'FreeCAD/FreeCAD';
const WORKER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function required(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function apiError(payload) {
  if (!Array.isArray(payload?.errors) || payload.errors.length === 0) {
    return 'Cloudflare API request failed.';
  }

  return payload.errors.map(error => error.message || error.code || 'unknown error').join('; ');
}

async function cloudflareRequest({fetchImpl, accountId, apiToken, path, ...options}) {
  const response = await fetchImpl(
    `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success !== true) {
    throw new Error(apiError(payload));
  }

  return payload;
}

export async function listKvNamespaces({
  fetchImpl = globalThis.fetch,
  accountId,
  apiToken,
  pageSize = 1000,
}) {
  const namespaces = [];

  for (let page = 1; page <= 20; page += 1) {
    const payload = await cloudflareRequest({
      fetchImpl,
      accountId: required(accountId, 'CLOUDFLARE_ACCOUNT_ID'),
      apiToken: required(apiToken, 'CLOUDFLARE_API_TOKEN'),
      path: `/storage/kv/namespaces?page=${page}&per_page=${pageSize}`,
      method: 'GET',
    });
    const result = Array.isArray(payload.result) ? payload.result : [];
    namespaces.push(...result);

    const info = payload.result_info;
    if (!info || page >= Number(info.total_pages || page) || result.length === 0) {
      break;
    }
  }

  return namespaces;
}

export async function ensureKvNamespace({
  fetchImpl = globalThis.fetch,
  accountId,
  apiToken,
  title = DEFAULT_NAMESPACE_TITLE,
}) {
  const normalizedAccountId = required(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const normalizedApiToken = required(apiToken, 'CLOUDFLARE_API_TOKEN');
  const normalizedTitle = required(title, 'REVIEWSTACK_MCP_KV_TITLE');
  const request = options =>
    cloudflareRequest({
      fetchImpl,
      accountId: normalizedAccountId,
      apiToken: normalizedApiToken,
      ...options,
    });

  const existing = (
    await listKvNamespaces({
      fetchImpl,
      accountId: normalizedAccountId,
      apiToken: normalizedApiToken,
    })
  ).find(namespace => namespace.title === normalizedTitle);

  if (existing?.id) {
    return {id: existing.id, created: false};
  }

  try {
    const payload = await request({
      path: '/storage/kv/namespaces',
      method: 'POST',
      body: JSON.stringify({title: normalizedTitle}),
    });
    const id = payload.result?.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Cloudflare did not return a KV namespace ID.');
    }

    return {id, created: true};
  } catch (error) {
    // A concurrent deployment may have created the namespace after the list
    // request. Re-read before surfacing the create error.
    const concurrent = (
      await listKvNamespaces({
        fetchImpl,
        accountId: normalizedAccountId,
        apiToken: normalizedApiToken,
      })
    ).find(namespace => namespace.title === normalizedTitle);
    if (concurrent?.id) {
      return {id: concurrent.id, created: false};
    }

    throw error;
  }
}

export async function listD1Databases({
  fetchImpl = globalThis.fetch,
  accountId,
  apiToken,
  name,
  pageSize = 1000,
}) {
  const databases = [];

  for (let page = 1; page <= 20; page += 1) {
    const params = new URLSearchParams({page: String(page), per_page: String(pageSize)});
    if (name) params.set('name', name);
    const payload = await cloudflareRequest({
      fetchImpl,
      accountId: required(accountId, 'CLOUDFLARE_ACCOUNT_ID'),
      apiToken: required(apiToken, 'CLOUDFLARE_API_TOKEN'),
      path: `/d1/database?${params.toString()}`,
      method: 'GET',
    });
    const result = Array.isArray(payload.result) ? payload.result : [];
    databases.push(...result);
    const info = payload.result_info;
    if (!info || page >= Number(info.total_pages || page) || result.length === 0) break;
  }

  return databases;
}

export async function ensureD1Database({
  fetchImpl = globalThis.fetch,
  accountId,
  apiToken,
  name = DEFAULT_DATABASE_NAME,
}) {
  const normalizedAccountId = required(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const normalizedApiToken = required(apiToken, 'CLOUDFLARE_API_TOKEN');
  const normalizedName = required(name, 'REVIEWSTACK_MCP_D1_NAME');
  const request = options =>
    cloudflareRequest({
      fetchImpl,
      accountId: normalizedAccountId,
      apiToken: normalizedApiToken,
      ...options,
    });

  const findExisting = async () =>
    (
      await listD1Databases({
        fetchImpl,
        accountId: normalizedAccountId,
        apiToken: normalizedApiToken,
        name: normalizedName,
      })
    ).find(database => database.name === normalizedName && (database.uuid || database.id));

  const existing = await findExisting();
  if (existing) {
    return {id: existing.uuid || existing.id, name: normalizedName, created: false};
  }

  try {
    const payload = await request({
      path: '/d1/database',
      method: 'POST',
      body: JSON.stringify({name: normalizedName}),
    });
    const id = payload.result?.uuid || payload.result?.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Cloudflare did not return a D1 database ID.');
    }
    return {id, name: normalizedName, created: true};
  } catch (error) {
    const concurrent = await findExisting();
    if (concurrent) {
      return {id: concurrent.uuid || concurrent.id, name: normalizedName, created: false};
    }
    throw error;
  }
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

export function buildWranglerConfig({
  kvNamespaceId,
  d1DatabaseId,
  d1DatabaseName = DEFAULT_DATABASE_NAME,
  migrationsDir,
  allowedRepositories = DEFAULT_ALLOWED_REPOSITORIES,
  resource,
  githubOAuthCallbackUrl,
  githubOAuthScope,
  main = 'src/index.js',
}) {
  const normalizedId = required(kvNamespaceId, 'KV namespace ID');
  const normalizedRepositories = required(
    allowedRepositories,
    'REVIEWSTACK_MCP_ALLOWED_REPOSITORIES',
  );
  const lines = [
    'name = "reviewstack-mcp"',
    `main = ${tomlString(main)}`,
    'compatibility_date = "2026-09-11"',
    'workers_dev = true',
    'preview_urls = false',
    '',
    '[vars]',
    `MCP_ALLOWED_REPOSITORIES = ${tomlString(normalizedRepositories)}`,
  ];

  if (resource) {
    lines.push(`MCP_RESOURCE = ${tomlString(resource)}`);
  }
  if (githubOAuthCallbackUrl) {
    lines.push(`GITHUB_OAUTH_CALLBACK_URL = ${tomlString(githubOAuthCallbackUrl)}`);
  }
  if (githubOAuthScope) {
    lines.push(`GITHUB_OAUTH_SCOPE = ${tomlString(githubOAuthScope)}`);
  }

  lines.push('', '[[kv_namespaces]]', 'binding = "MCP_KV"', `id = ${tomlString(normalizedId)}`, '');

  if (d1DatabaseId) {
    lines.push(
      '[[d1_databases]]',
      'binding = "REVIEWS_DB"',
      `database_name = ${tomlString(d1DatabaseName)}`,
      `database_id = ${tomlString(required(d1DatabaseId, 'D1 database ID'))}`,
      ...(migrationsDir ? [`migrations_dir = ${tomlString(migrationsDir)}`] : []),
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

function writeGitHubOutput(name, value, env = process.env) {
  const outputPath = env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${value}\n`);
  }
}

export async function provision({
  env = process.env,
  fetchImpl = globalThis.fetch,
  outputPath = join(env.RUNNER_TEMP || tmpdir(), 'reviewstack-mcp-wrangler.toml'),
} = {}) {
  const resource = env.REVIEWSTACK_MCP_RESOURCE?.trim() || undefined;
  const callback =
    env.REVIEWSTACK_MCP_GITHUB_OAUTH_CALLBACK_URL?.trim() ||
    (resource ? `${resource.replace(/\/$/, '')}/oauth/github/callback` : undefined);
  if (!callback) {
    throw new Error(
      'REVIEWSTACK_MCP_GITHUB_OAUTH_CALLBACK_URL is required for CI (or set REVIEWSTACK_MCP_RESOURCE so it can be derived).',
    );
  }

  const namespace = await ensureKvNamespace({
    fetchImpl,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    title: env.REVIEWSTACK_MCP_KV_TITLE || DEFAULT_NAMESPACE_TITLE,
  });
  const database = await ensureD1Database({
    fetchImpl,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    name: env.REVIEWSTACK_MCP_D1_NAME || DEFAULT_DATABASE_NAME,
  });
  const config = buildWranglerConfig({
    kvNamespaceId: namespace.id,
    d1DatabaseId: database.id,
    d1DatabaseName: database.name,
    migrationsDir: join(WORKER_ROOT, 'migrations'),
    allowedRepositories: env.REVIEWSTACK_MCP_ALLOWED_REPOSITORIES || DEFAULT_ALLOWED_REPOSITORIES,
    resource,
    githubOAuthCallbackUrl: callback,
    githubOAuthScope: env.REVIEWSTACK_MCP_GITHUB_OAUTH_SCOPE?.trim() || undefined,
    // The config is intentionally written to the runner's temporary directory;
    // use an absolute entry point so Wrangler does not resolve it relative to
    // that directory.
    main: join(WORKER_ROOT, 'src/index.js'),
  });

  mkdirSync(dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, config, 'utf8');
  writeGitHubOutput('config_path', outputPath, env);
  writeGitHubOutput('kv_namespace_created', String(namespace.created), env);
  writeGitHubOutput('d1_database_id', database.id, env);
  writeGitHubOutput('d1_database_created', String(database.created), env);

  return {...namespace, ...database, configPath: outputPath};
}

async function main() {
  const result = await provision();
  console.log(
    `${result.created ? 'Created' : 'Reusing'} Cloudflare ReviewStack MCP storage; generated ${
      result.configPath
    }.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(`provision-ci: ${error.message}`);
    process.exitCode = 1;
  });
}
