/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {GitHubTokenState} from './jotai';

import {
  gitHubHostnameAtom,
  gitHubTokenPersistenceAtom,
  gitHubTokenStateAtom,
  gitHubViewerAtom,
  primerColorModeAtom,
} from './jotai';
import useNavigate from './useNavigate';
import {HomeIcon, MarkGithubIcon, MoonIcon, SignOutIcon, SunIcon} from '@primer/octicons-react';
import {ActionList, ActionMenu, Avatar, Button, Text} from '@primer/react';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';
import {loadable} from 'jotai/utils';
import {useCallback, useMemo} from 'react';

function getTokenValue(state: GitHubTokenState): string | null {
  return state.state === 'hasValue' ? state.value : null;
}

export default function Username(): React.ReactElement | null {
  const loadableViewerAtom = useMemo(() => loadable(gitHubViewerAtom), []);
  const viewerLoadable = useAtomValue(loadableViewerAtom);
  const viewer = viewerLoadable.state === 'hasData' ? viewerLoadable.data : null;
  const hostname = useAtomValue(gitHubHostnameAtom);
  const tokenState = useAtomValue(gitHubTokenStateAtom);
  const token = getTokenValue(tokenState);
  const setToken = useSetAtom(gitHubTokenPersistenceAtom);
  const navigate = useNavigate();
  const [colorMode, setColorMode] = useAtom(primerColorModeAtom);
  const onLogout = useCallback(() => setToken(null), [setToken]);

  if (tokenState.state !== 'hasValue' || token == null) {
    return null;
  }

  const username = viewer?.login;
  const dark = colorMode === 'night';
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Button
          className="reviewstack-account-button"
          variant="invisible"
          aria-label={username == null ? 'Account menu' : `Account menu for ${username}`}>
          {viewer?.avatarUrl != null ? (
            <Avatar src={viewer.avatarUrl} alt="" size={24} />
          ) : (
            <MarkGithubIcon size={24} />
          )}
        </Button>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay align="end" width="small">
        <ActionList>
          {username != null && (
            <ActionList.Group>
              <ActionList.GroupHeading>
                Signed in as <Text fontWeight="bold">{username}</Text>
              </ActionList.GroupHeading>
            </ActionList.Group>
          )}
          <ActionList.Item onSelect={() => navigate('/')}>
            <ActionList.LeadingVisual>
              <HomeIcon />
            </ActionList.LeadingVisual>
            Dashboard
          </ActionList.Item>
          {username != null && (
            <ActionList.Item
              as="a"
              href={`https://${hostname}/${username}`}
              target="_blank"
              rel="noopener noreferrer">
              <ActionList.LeadingVisual>
                <MarkGithubIcon />
              </ActionList.LeadingVisual>
              GitHub profile
            </ActionList.Item>
          )}
          <ActionList.Item onSelect={() => setColorMode(dark ? 'day' : 'night')}>
            <ActionList.LeadingVisual>{dark ? <SunIcon /> : <MoonIcon />}</ActionList.LeadingVisual>
            {dark ? 'Use light theme' : 'Use dark theme'}
          </ActionList.Item>
          <ActionList.Divider />
          <ActionList.Item variant="danger" onSelect={onLogout}>
            <ActionList.LeadingVisual>
              <SignOutIcon />
            </ActionList.LeadingVisual>
            Log out
          </ActionList.Item>
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
