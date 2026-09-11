# ReviewStack MCP worker

This worker exposes ReviewStack's pull-request data to ChatGPT Web through a
remote MCP server. ChatGPT performs the review using the user's existing
ChatGPT subscription; this service does not call the OpenAI API and does not
need an OpenAI API key.

The worker uses OAuth 2.1 for the ChatGPT connection. The authorization flow
redirects to GitHub, stores the resulting GitHub access token in KV, and gives
ChatGPT a short-lived MCP access token. Only read-only review tools are
exposed.

The bundled OAuth broker is deliberately narrow and suitable for a personal
instance. For a multi-user deployment, replace it with an established OAuth
2.1/OIDC provider and keep the MCP resource-server token validation in place.

## One-time setup

1. Create a GitHub OAuth App. Set its callback URL to the deployed worker's
   `/oauth/github/callback` URL. `public_repo read:user` is the default scope;
   use `repo read:user` only when this instance must review private
   repositories.
2. Create a KV namespace:

   ```bash
   npx wrangler kv namespace create MCP_KV
   ```

   Add the returned ID to `wrangler.toml` by uncommenting the `MCP_KV`
   binding.

3. Set `MCP_ALLOWED_REPOSITORIES` in `wrangler.toml` to comma-separated
   `owner/repository` names, or an organization rule such as `FreeCAD/*`, for
   the repositories this instance may review. The worker origin is used
   automatically for `MCP_RESOURCE` and the GitHub callback; set those optional
   variables only when deploying behind a custom domain.
4. Store the GitHub OAuth credentials as Worker secrets:

   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

5. Deploy:

   ```bash
   npm install
   npm test
   npx wrangler deploy
   ```

## Headless CI deployment

`.github/workflows/mcp-worker.yml` can provision and deploy the worker on every
`main` push that changes this directory. The deploy job is disabled until the
repository variable `CLOUDFLARE_WORKER_CI_ENABLED` is set to `true`.

Configure these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`: an account token with Workers Scripts edit and Workers
  KV Storage edit permissions.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `REVIEWSTACK_GITHUB_CLIENT_ID` and `REVIEWSTACK_GITHUB_CLIENT_SECRET`: the
  GitHub OAuth App credentials.

Configure these repository variables:

- `REVIEWSTACK_MCP_GITHUB_OAUTH_CALLBACK_URL`: the exact deployed worker URL
  ending in `/oauth/github/callback` (the same URL registered in GitHub).
- `REVIEWSTACK_MCP_RESOURCE`: the worker origin, when it is different from the
  request origin (for example, a custom domain).
- `REVIEWSTACK_MCP_ALLOWED_REPOSITORIES`: comma-separated `owner/repository`
  names or organization rules such as `FreeCAD/*`; it defaults to
  `FreeCAD/FreeCAD`.
- `REVIEWSTACK_MCP_GITHUB_OAUTH_SCOPE`: optional GitHub OAuth scope; it defaults
  to `public_repo read:user` (use `repo read:user` for private repositories).
- `REVIEWSTACK_MCP_HEALTH_URL`: optional `/health` URL to verify after deploy.
- `REVIEWSTACK_MCP_KV_TITLE`: optional stable KV namespace title; it defaults to
  `reviewstack-mcp`.

The workflow uses `scripts/provision-ci.mjs` to find or create the named KV
namespace and writes a temporary Wrangler config containing its ID. It then
updates the Worker secrets and deploys with that config; no namespace IDs or
credentials are committed to the repository. The script is safe to rerun and
handles concurrent first deployments.

CI can provision the ReviewStack service, but it cannot sign in to ChatGPT or
approve the GitHub OAuth consent on your behalf. After the first deployment,
connect the `/mcp` URL once in ChatGPT Developer Mode and complete the browser
consent flow. ChatGPT then uses your existing subscription for the review; no
OpenAI API key is involved.

## Connect ChatGPT Web

In ChatGPT, enable Developer mode under **Settings → Security and login**.
Open the Plugins area, add a private plugin, and use the worker URL with the
`/mcp` path. On the first tool call, ChatGPT will open the worker's OAuth flow;
sign in to the GitHub account that should be used for reviews.

Try a prompt such as:

> Review pull request 123 in FreeCAD/FreeCAD. Focus on correctness and
> regression risk, and cite exact files and lines.

The first version deliberately has no GitHub write tools. Drafted comments
must be copied and submitted by a human in ReviewStack or GitHub.

## Local checks

```bash
npm test
npx wrangler deploy --dry-run
```

The service requires a configured `MCP_KV` binding at runtime. Do not expose a
GitHub token or an OpenAI API key in the Pages bundle.
