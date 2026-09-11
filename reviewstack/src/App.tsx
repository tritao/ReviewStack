/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import AppHeader from './AppHeader';
import CenteredSpinner from './CenteredSpinner';
import {ErrorBoundary} from './ErrorBoundary';
import GitHubMarkdownStyles from './GitHubMarkdownStyles';
import {ShortcutCommandContext} from './KeyboardShortcuts';
import LoginDialog from './LoginDialog';
import McpSetupPage from './McpSetupPage';
import NotificationBanner from './NotificationBanner';
import PrimerStyles from './PrimerStyles';
import SplitDiffViewPrimerStyles from './SplitDiffViewPrimerStyles';
import TextMateStyles from './TextMateStyles';
import {
  gitHubTokenListenerAtom,
  gitHubTokenPersistenceAtom,
  primerColorModeAtom,
} from './jotai/atoms';
import {BaseStyles, Box, Text, useTheme} from '@primer/react';
import {useAtom, useAtomValue} from 'jotai';
import {loadable} from 'jotai/utils';
import React, {useEffect, useMemo} from 'react';

const CommitView = React.lazy(() => import('./CommitView'));
const GitHubProjectPage = React.lazy(() => import('./GitHubProjectPage'));
const PullRequestLayout = React.lazy(() => import('./PullRequestLayout'));
const PullsView = React.lazy(() => import('./PullsView'));
const UserHomePage = React.lazy(() => import('./UserHomePage'));

type Page =
  | {type: 'home'}
  | {type: 'mcp'; endpoint: string}
  | {
      type: 'project';
      org: string;
      repo: string;
    }
  | {
      type: 'pulls';
      org: string;
      repo: string;
    }
  | {
      type: 'pr';
      org: string;
      repo: string;
      number: number;
    }
  | {
      type: 'commit';
      org: string;
      repo: string;
      oid: string;
    };

/**
 * <App> assumes that <Provider> from jotai and <ThemeProvider> from
 * @primer/react are ancestor components in the hierarchy.
 */
export default function App({page}: {page: Page}): React.ReactElement {
  return (
    <div>
      <ShortcutCommandContext>
        <ThemeListener />
        <BaseStyles>
          <PrimerStyles />
          <GitHubMarkdownStyles />
          <SplitDiffViewPrimerStyles />
          <TextMateStyles />
          <Box bg="canvas.default" fontFamily="normal" className="reviewstack">
            <ContentOrLoginDialog page={page} />
          </Box>
          <NotificationBanner />
        </BaseStyles>
      </ShortcutCommandContext>
    </div>
  );
}

function ContentOrLoginDialog({page}: {page: Page}): React.ReactElement {
  if (page.type === 'mcp') {
    return <McpSetupPage endpoint={page.endpoint} />;
  }
  return <AuthenticatedContent page={page} />;
}

function AuthenticatedContent({page}: {page: Exclude<Page, {type: 'mcp'}>}): React.ReactElement {
  // Subscribe to the listener atom to set up cross-tab logout handling
  useAtom(gitHubTokenListenerAtom);

  // Use loadable to get loading/error/data states
  const loadableTokenAtom = useMemo(() => loadable(gitHubTokenPersistenceAtom), []);
  const tokenLoadable = useAtomValue(loadableTokenAtom);
  const orgAndRepo = page.type !== 'home' ? {org: page.org, repo: page.repo} : null;

  switch (tokenLoadable.state) {
    case 'hasData': {
      const token = tokenLoadable.data;
      return token != null ? (
        <>
          <AppHeader orgAndRepo={orgAndRepo} />
          <ErrorBoundary>
            <React.Suspense fallback={<CenteredSpinner message="Loading page…" />}>
              <AppContent page={page} />
            </React.Suspense>
          </ErrorBoundary>
        </>
      ) : (
        <LoginDialog />
      );
    }
    case 'loading': {
      return (
        <Box>
          <CenteredSpinner message="Please wait...deleting local data..." />
        </Box>
      );
    }
    case 'hasError': {
      return (
        <Text>
          Failed to delete data. Please close all other instances of ReviewStack, refresh this page,
          and press Logout again.
        </Text>
      );
    }
  }
}

/**
 * ThemeListener is a component that exists to listen to changes to the user's
 * theme preference (which is defined as a Jotai atom) and updates
 * <ThemeProvider> accordingly, so it must be a descendant of both <Provider>
 * and <ThemeProvider>. Also, because of its use of hooks, it must be defined
 * as a functional React component.
 *
 * It is included high in the component hierarchy of <App> to reduce the
 * chance of it being considered for re-rendering (which is also why it is
 * wrapped in React.memo()).
 */
// eslint-disable-next-line prefer-arrow-callback
const ThemeListener = React.memo(function ThemeListener(): React.ReactElement {
  const colorMode = useAtomValue(primerColorModeAtom);
  const {setColorMode} = useTheme();
  useEffect(() => {
    setColorMode(colorMode);
  }, [colorMode, setColorMode]);
  return <></>;
});

const AppContent = React.memo(({page}: {page: Page}): React.ReactElement => {
  switch (page.type) {
    case 'mcp':
      return <McpSetupPage endpoint={page.endpoint} />;
    case 'home':
      return <UserHomePage />;
    case 'project':
      return <GitHubProjectPage {...page} />;
    case 'pulls':
      return <PullsView {...page} />;
    case 'pr':
      return <PullRequestLayout {...page} />;
    case 'commit':
      return <CommitView {...page} />;
  }
});
