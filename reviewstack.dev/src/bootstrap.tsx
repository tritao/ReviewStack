/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import LazyLoginDialog from './LazyLoginDialog';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Link, Route, Routes, useNavigate, useParams} from 'react-router-dom';
import {setCustomLoginDialogComponent} from 'reviewstack/src/LoginDialog';
import {DEFAULT_MCP_ENDPOINT} from 'reviewstack/src/McpSetupPage';
import {
  App,
  getColorModeFromLocalStorage,
  JotaiProvider,
  setCustomLinkElement,
  setCustomNavigateHook,
  ThemeProvider,
} from 'reviewstack/src/index';

const MCP_ENDPOINT = process.env.REACT_APP_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT;

clearChunkRecoveryParameter();

function CustomLink({
  href,
  style,
  children,
}: {
  href: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <Link to={href} style={style}>
      {children}
    </Link>
  );
}

function RepositoryPage({type}: {type: 'project' | 'pulls'}) {
  const {org, repo} = useParams();
  return org && repo ? <App page={{type, org, repo}} /> : null;
}

function PullRequestPage() {
  const {org, repo, pr} = useParams();
  const number = Number(pr);
  return org && repo && Number.isInteger(number) ? (
    <App page={{type: 'pr', org, repo, number}} />
  ) : null;
}

function CommitPage() {
  const {org, repo, oid} = useParams();
  return org && repo && oid ? <App page={{type: 'commit', org, repo, oid}} /> : null;
}

function SavedReviewsPage() {
  const {reviewId} = useParams();
  return <App page={{type: 'reviews', endpoint: MCP_ENDPOINT, reviewId}} />;
}

setCustomLinkElement(CustomLink);
setCustomNavigateHook(useNavigate);
setCustomLoginDialogComponent(LazyLoginDialog);

const rootElement = document.getElementById('root');
if (rootElement == null) {
  throw new Error('Missing ReviewStack root element.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <JotaiProvider>
      <ThemeProvider colorMode={getColorModeFromLocalStorage()}>
        <BrowserRouter basename={process.env.PUBLIC_URL || '/'}>
          <Routes>
            <Route path="/" element={<App page={{type: 'home'}} />} />
            <Route path="/mcp" element={<App page={{type: 'mcp', endpoint: MCP_ENDPOINT}} />} />
            <Route
              path="/reviews"
              element={<App page={{type: 'reviews', endpoint: MCP_ENDPOINT}} />}
            />
            <Route path="/reviews/:reviewId" element={<SavedReviewsPage />} />
            <Route path="/auth/callback" element={<App page={{type: 'home'}} />} />
            <Route path="/:org/:repo" element={<RepositoryPage type="project" />} />
            <Route path="/:org/:repo/pulls" element={<RepositoryPage type="pulls" />} />
            <Route path="/:org/:repo/pull/:pr" element={<PullRequestPage />} />
            <Route path="/:org/:repo/commit/:oid" element={<CommitPage />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </JotaiProvider>
  </React.StrictMode>,
);

function clearChunkRecoveryParameter(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('__reviewstack_reload')) {
    return;
  }
  url.searchParams.delete('__reviewstack_reload');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
