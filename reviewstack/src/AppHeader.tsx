/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {GitHubOrgAndRepo} from './jotai';
import type {FormEvent} from 'react';

import './AppHeader.css';

import Link from './Link';
import URLFor from './URLFor';
import Username from './Username';
import {APP_HEADER_HEIGHT} from './constants';
import {parseReviewTarget} from './reviewTarget';
import useNavigate from './useNavigate';
import {MarkGithubIcon, RepoIcon, SearchIcon, StackIcon} from '@primer/octicons-react';
import {ActionMenu, Box, Button, Header, IconButton, Text, TextInput} from '@primer/react';
import {useState} from 'react';

type Props = {
  orgAndRepo: GitHubOrgAndRepo | null;
};

export default function AppHeader({orgAndRepo}: Props): React.ReactElement {
  return (
    <Header className="reviewstack-app-header" sx={{fontSize: 2, height: APP_HEADER_HEIGHT}}>
      <Header.Item className="reviewstack-app-header-context">
        <Box className="reviewstack-app-brand">
          <Link href="/">
            <Box className="reviewstack-app-brand-content">
              <StackIcon size="medium" aria-hidden="true" />
              <Text color="fg.onEmphasis" fontWeight="bold">
                ReviewStack
              </Text>
            </Box>
          </Link>
        </Box>
        {orgAndRepo != null && (
          <>
            <Text className="reviewstack-app-header-separator" color="fg.onEmphasis">
              /
            </Text>
            <Box className="reviewstack-app-header-repository">
              <PullsLink {...orgAndRepo} />
            </Box>
          </>
        )}
      </Header.Item>
      <Header.Item className="reviewstack-app-header-search">
        <HeaderQuickOpen />
      </Header.Item>
      <Header.Item className="reviewstack-app-header-actions">
        <Link href="/reviews">Saved reviews</Link>
        <Link href="/mcp">MCP setup</Link>
        <IconButton
          as="a"
          href="https://github.com/tritao/ReviewStack"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="ReviewStack on GitHub"
          title="ReviewStack on GitHub"
          icon={MarkGithubIcon}
          variant="invisible"
        />
        <Username />
      </Header.Item>
    </Header>
  );
}

function PullsLink({org, repo}: {org: string; repo: string}) {
  return (
    <Link href={URLFor.project({org, repo})}>
      <Box className="reviewstack-repository-context">
        <RepoIcon aria-hidden="true" />
        <Text color="fg.onEmphasis" fontWeight="bold">
          {org} / {repo}
        </Text>
      </Box>
    </Link>
  );
}

function HeaderQuickOpen(): React.ReactElement {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const target = parseReviewTarget(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (target != null) {
      navigate(target);
    }
  };
  const input = (
    <TextInput
      block
      leadingVisual={SearchIcon}
      aria-label="Quick open a GitHub pull request or repository"
      placeholder="Open owner/repository#123"
      value={value}
      onChange={event => setValue(event.target.value)}
    />
  );

  return (
    <>
      <Box as="form" className="reviewstack-header-search-form" onSubmit={submit}>
        {input}
      </Box>
      <Box className="reviewstack-header-search-mobile">
        <ActionMenu>
          <ActionMenu.Anchor>
            <IconButton
              icon={SearchIcon}
              variant="invisible"
              aria-label="Quick open"
              title="Quick open"
            />
          </ActionMenu.Anchor>
          <ActionMenu.Overlay align="end" width="medium">
            <Box as="form" className="reviewstack-header-search-overlay" onSubmit={submit}>
              {input}
              <Button type="submit" variant="primary" disabled={target == null}>
                Open
              </Button>
            </Box>
          </ActionMenu.Overlay>
        </ActionMenu>
      </Box>
    </>
  );
}
