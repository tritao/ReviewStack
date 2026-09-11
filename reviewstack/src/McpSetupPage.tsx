/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import AppHeader from './AppHeader';
import Link from './Link';
import {CheckCircleIcon, CopyIcon, SyncIcon, XCircleIcon} from '@primer/octicons-react';
import {Box, Button, Flash, Heading, Text, TextInput} from '@primer/react';
import {useCallback, useEffect, useMemo, useState} from 'react';

export const DEFAULT_MCP_ENDPOINT = 'https://reviewstack-mcp.joao-9f7.workers.dev/mcp';

type Health = {
  ok?: boolean;
  kvConfigured?: boolean;
  reviewsDbConfigured?: boolean;
  githubOAuthConfigured?: boolean;
};

type WorkerStatus =
  | {state: 'loading'}
  | {state: 'ready'; health: Health}
  | {state: 'degraded'; health: Health}
  | {state: 'offline'; message: string};

type Props = {
  endpoint?: string;
};

export default function McpSetupPage({endpoint}: Props): React.ReactElement {
  const mcpEndpoint = useMemo(
    () => normalizeEndpoint(endpoint || process.env.REACT_APP_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT),
    [endpoint],
  );
  const [status, setStatus] = useState<WorkerStatus>({state: 'loading'});
  const [copied, setCopied] = useState(false);

  const checkHealth = useCallback(async () => {
    setStatus({state: 'loading'});
    try {
      const response = await fetch(healthEndpoint(mcpEndpoint), {
        headers: {Accept: 'application/json'},
        credentials: 'omit',
      });
      if (!response.ok) {
        throw new Error(`Worker returned HTTP ${response.status}.`);
      }
      const health = (await response.json()) as Health;
      if (health.ok !== true) {
        throw new Error('Worker health check did not report ok.');
      }
      setStatus({
        state:
          health.kvConfigured && health.reviewsDbConfigured && health.githubOAuthConfigured
            ? 'ready'
            : 'degraded',
        health,
      });
    } catch (error) {
      setStatus({
        state: 'offline',
        message: error instanceof Error ? error.message : 'Could not reach the MCP worker.',
      });
    }
  }, [mcpEndpoint]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const copyEndpoint = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpEndpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [mcpEndpoint]);

  return (
    <>
      <AppHeader orgAndRepo={null} />
      <Box as="main" paddingX={[3, 4]} paddingY={4} sx={{maxWidth: 960, marginX: 'auto'}}>
        <Box paddingBottom={4}>
          <Text color="accent.fg" fontWeight="bold">
            ChatGPT integration
          </Text>
          <Heading as="h1" sx={{fontSize: [4, 5], marginTop: 1}}>
            Connect ChatGPT to ReviewStack
          </Heading>
          <Text as="p" color="fg.muted" fontSize={2} sx={{maxWidth: 720}}>
            Use your existing ChatGPT subscription to ask for read-only reviews of ReviewStack pull
            requests. GitHub access is granted separately through OAuth; no OpenAI API key belongs
            in ReviewStack.
          </Text>
        </Box>

        <Box
          borderWidth={1}
          borderStyle="solid"
          borderColor="border.default"
          borderRadius={2}
          padding={3}
          marginBottom={4}>
          <Heading as="h2" sx={{fontSize: 3}}>
            1. Connect this MCP server
          </Heading>
          <Text as="p" color="fg.muted">
            In ChatGPT Developer Mode, add a private MCP app and paste this endpoint:
          </Text>
          <Box display="flex" flexWrap="wrap" gridGap={2} alignItems="center">
            <TextInput
              value={mcpEndpoint}
              readOnly
              aria-label="ReviewStack MCP endpoint"
              sx={{flex: '1 1 420px'}}
            />
            <Button leadingVisual={CopyIcon} onClick={copyEndpoint}>
              {copied ? 'Copied' : 'Copy endpoint'}
            </Button>
          </Box>
          <Text as="p" color="fg.muted" fontSize={0} marginTop={2}>
            ChatGPT will open GitHub authorization the first time it calls a tool. Sign in with the
            GitHub account that can access the repositories you review.
          </Text>
          <Button as="a" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">
            Open ChatGPT
          </Button>
        </Box>

        <Box
          borderWidth={1}
          borderStyle="solid"
          borderColor="border.default"
          borderRadius={2}
          padding={3}
          marginBottom={4}>
          <Heading as="h2" sx={{fontSize: 3}}>
            2. Check the worker
          </Heading>
          <Status status={status} />
          <Button leadingVisual={SyncIcon} onClick={() => void checkHealth()}>
            Check again
          </Button>
        </Box>

        <Box
          borderWidth={1}
          borderStyle="solid"
          borderColor="border.default"
          borderRadius={2}
          padding={3}
          marginBottom={4}>
          <Heading as="h2" sx={{fontSize: 3}}>
            3. GitHub OAuth and CI setup
          </Heading>
          <Text as="p">
            The maintainer deploys the worker from GitHub Actions. These values belong in GitHub
            settings, never in this page:
          </Text>
          <Box as="ol" paddingLeft={3}>
            <li>
              <Text>
                Create a GitHub OAuth App at{' '}
                <Link href="https://github.com/settings/developers">
                  github.com/settings/developers
                </Link>{' '}
                with callback URL{' '}
                <Text as="code" sx={{overflowWrap: 'anywhere'}}>
                  {`${workerOrigin(mcpEndpoint)}/oauth/github/callback`}
                </Text>
                .
              </Text>
            </li>
            <li>
              <Text>
                Store its Client ID and Client Secret as{' '}
                <Text as="code">REVIEWSTACK_GITHUB_CLIENT_ID</Text> and{' '}
                <Text as="code">REVIEWSTACK_GITHUB_CLIENT_SECRET</Text> repository secrets.
              </Text>
            </li>
            <li>
              <Text>
                Create a Cloudflare API token with Workers Scripts Edit, Workers KV Storage Edit,
                and D1 read/write permissions at{' '}
                <Link href="https://dash.cloudflare.com/profile/api-tokens">
                  dash.cloudflare.com/profile/api-tokens
                </Link>
                , then store it and your account ID as <Text as="code">CLOUDFLARE_API_TOKEN</Text>{' '}
                and <Text as="code">CLOUDFLARE_ACCOUNT_ID</Text> repository secrets.
              </Text>
            </li>
            <li>
              <Text>
                Set <Text as="code">REVIEWSTACK_MCP_ALLOWED_REPOSITORIES=FreeCAD/*</Text> to allow
                every repository owned by the FreeCAD organization.
              </Text>
              <Text as="p" color="fg.muted" fontSize={0}>
                The default OAuth scope is suitable for public repositories. For private
                repositories, use <Text as="code">repo read:user</Text> instead.
              </Text>
            </li>
          </Box>
          <Text as="p" color="fg.muted">
            Set these repository variables:
          </Text>
          <Box as="pre" padding={2} sx={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
            {[
              'CLOUDFLARE_WORKER_CI_ENABLED=true',
              `REVIEWSTACK_MCP_RESOURCE=${workerOrigin(mcpEndpoint)}`,
              `REVIEWSTACK_MCP_GITHUB_OAUTH_CALLBACK_URL=${workerOrigin(
                mcpEndpoint,
              )}/oauth/github/callback`,
              'REVIEWSTACK_MCP_ALLOWED_REPOSITORIES=FreeCAD/*',
              'REVIEWSTACK_MCP_GITHUB_OAUTH_SCOPE=public_repo read:user',
              `REVIEWSTACK_MCP_HEALTH_URL=${workerOrigin(mcpEndpoint)}/health`,
              'REVIEWSTACK_MCP_D1_NAME=reviewstack-reviews',
            ].join('\n')}
          </Box>
          <Button
            as="a"
            href="https://github.com/tritao/ReviewStack/settings/secrets/actions"
            target="_blank"
            rel="noopener noreferrer">
            Open GitHub Actions settings
          </Button>
        </Box>

        <Box
          borderWidth={1}
          borderStyle="solid"
          borderColor="border.default"
          borderRadius={2}
          padding={3}>
          <Heading as="h2" sx={{fontSize: 3}}>
            Try a review
          </Heading>
          <Box as="pre" padding={2} sx={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
            Review PR 123 in FreeCAD/FreeCAD. Focus on correctness and regression risk, and cite
            exact files and lines.
          </Box>
          <Text as="p" color="fg.muted" fontSize={0}>
            GitHub access remains read-only. ChatGPT can save drafts and notes in the ReviewStack
            workspace, but nothing is submitted to GitHub without a human.
          </Text>
        </Box>
      </Box>
    </>
  );
}

function Status({status}: {status: WorkerStatus}): React.ReactElement {
  if (status.state === 'loading') {
    return (
      <Flash variant="warning" sx={{mb: 2}}>
        Checking the MCP worker…
      </Flash>
    );
  }

  if (status.state === 'offline') {
    return (
      <Flash variant="danger" sx={{mb: 2}}>
        <XCircleIcon aria-hidden="true" /> {status.message}
      </Flash>
    );
  }

  if (status.state === 'degraded') {
    return (
      <Flash variant="warning" sx={{mb: 2}}>
        Worker is reachable, but CI setup is incomplete. KV:{' '}
        {status.health.kvConfigured ? 'ready' : 'missing'}; GitHub OAuth:{' '}
        {status.health.githubOAuthConfigured ? 'ready' : 'missing'}; Reviews DB:{' '}
        {status.health.reviewsDbConfigured ? 'ready' : 'missing'}.
      </Flash>
    );
  }

  return (
    <Flash variant="success" sx={{mb: 2}}>
      <CheckCircleIcon aria-hidden="true" /> Worker is ready. KV, Reviews DB, and GitHub OAuth are
      configured.
    </Flash>
  );
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function workerOrigin(endpoint: string): string {
  return new URL(endpoint).origin;
}

function healthEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  url.pathname = `${url.pathname.replace(/\/mcp\/?$/, '')}/health`;
  return url.href;
}
