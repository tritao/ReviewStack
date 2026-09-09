/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {ChangeEvent, FormEvent} from 'react';
import type {CustomLoginDialogProps} from 'reviewstack/src/LoginDialog';

import './DefaultLoginDialog.css';

import {beginGitHubOAuth, finishGitHubOAuth, getOAuthConfig, hasOAuthCallback} from './GitHubOAuth';
import {Box, Button, Flash, Link, Text} from '@primer/react';
import {useCallback, useEffect, useRef, useState} from 'react';

export default function LoginDialog({
  setTokenAndHostname,
  authError,
}: CustomLoginDialogProps): React.ReactElement | null {
  const [token, setToken] = useState('');
  const [hostname, setHostname] = useState('github.com');
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [isOAuthBusy, setOAuthBusy] = useState(false);
  const processedCallback = useRef(false);
  const oauthConfig = getOAuthConfig();

  useEffect(() => {
    if (oauthConfig == null || !hasOAuthCallback() || processedCallback.current) {
      return;
    }
    processedCallback.current = true;
    setOAuthBusy(true);
    finishGitHubOAuth(oauthConfig)
      .then(({token: oauthToken, returnTo}) => {
        window.history.replaceState(null, '', returnTo);
        setTokenAndHostname(oauthToken, 'github.com');
      })
      .catch(error => {
        setOAuthError(error instanceof Error ? error.message : 'GitHub login failed.');
      })
      .finally(() => setOAuthBusy(false));
  }, [oauthConfig, setTokenAndHostname]);

  const onOAuthClick = useCallback(() => {
    if (oauthConfig == null) {
      return;
    }
    setOAuthError(null);
    setOAuthBusy(true);
    beginGitHubOAuth(oauthConfig).catch(error => {
      setOAuthBusy(false);
      setOAuthError(error instanceof Error ? error.message : 'Could not start GitHub login.');
    });
  }, [oauthConfig]);

  const onChangeToken = useCallback(
    (e: ChangeEvent) => setToken((e.target as HTMLInputElement).value),
    [],
  );
  const onChangeHostname = useCallback(
    (e: ChangeEvent) => setHostname((e.target as HTMLInputElement).value),
    [],
  );

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setTokenAndHostname(token.trim(), hostname.trim());
      return false;
    },
    [token, hostname, setTokenAndHostname],
  );

  const isInputValid = isValid(token, hostname);

  return (
    <>
      <div className="LoginDialog-container">
        <Box
          bg="canvas.default"
          className="LoginDialog"
          borderWidth={1}
          borderColor="border.default">
          <form onSubmit={onSubmit}>
            {authError != null ? (
              <Box pb={2}>
                <Flash variant="warning">
                  <Text>{authError}</Text>
                </Flash>
              </Box>
            ) : null}
            {oauthError != null ? (
              <Box pb={2}>
                <Flash variant="danger">
                  <Text>{oauthError}</Text>
                </Flash>
              </Box>
            ) : null}
            {oauthConfig != null ? (
              <Box className="LoginDialog-oauth" pb={3}>
                <Text as="p">Sign in through GitHub to review public repositories.</Text>
                <Button variant="primary" onClick={onOAuthClick} disabled={isOAuthBusy}>
                  {isOAuthBusy ? 'Signing in…' : 'Sign in with GitHub'}
                </Button>
              </Box>
            ) : null}
            <Box className="LoginDialog-divider" pb={2}>
              <Text fontWeight="bold">
                {oauthConfig == null ? 'Sign in with a token' : 'Or sign in manually'}
              </Text>
            </Box>
            <Box pb={2}>
              <Text>
                This tool requires an authentication token so it can read and write data from
                GitHub. Follow GitHub's{' '}
                <Link
                  href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
                  target="_blank">
                  instructions to create a personal access token (PAT)
                </Link>{' '}
                and <Text fontWeight="bold">be sure to store it in a safe place</Text>. After
                initially viewing your PAT, GitHub will never show it to you again.
              </Text>
              {/* We may add a checkbox to aide in persisting these values. */}
            </Box>
            <Box pb={2}>
              <Text>
                Alternatively, if you have authenticated with the{' '}
                <Link href="https://cli.github.com/">GitHub CLI</Link>, you can use{' '}
                <Text as="code" bg="canvas.subtle">
                  gh auth status -t
                </Text>{' '}
                to dump the PAT you are using for{' '}
                <Text as="code" bg="canvas.subtle">
                  gh
                </Text>
                , which can also be used with ReviewStack if you are comfortable using the same PAT
                for both tools:
                <Box as="pre" bg="canvas.subtle" padding={2}>
                  {`$ gh auth status -t
github.com
  \u2713 Logged in to github.com as username (oauth_token)
  \u2713 Git operations for github.com configured to use https protocol.
  \u2713 Token: gho_this_is_your_real_PAT_xxxxxxxxxxxxxx
`}
                </Box>
              </Text>
            </Box>
            <Box pb={2}>
              <Text fontStyle="italic">
                Note your PAT will be stored in <code>localStorage</code> so you will not have to
                enter it again when you return to this page. Click{' '}
                <Text fontStyle="normal" fontWeight="bold">
                  Logout
                </Text>{' '}
                to delete your PAT and any data that was fetched from GitHub using your PAT from the
                browser.
              </Text>
            </Box>
            <Box pb={2}>
              Personal Access Token: <br />
              <input
                value={token}
                size={60}
                required={true}
                onChange={onChangeToken}
                placeholder="paste your token here"
              />
            </Box>
            <Box pb={2}>
              Hostname: <br />
              <input
                value={hostname}
                size={60}
                required={true}
                onChange={onChangeHostname}
                placeholder="github.com or GitHub Enterprise hostname"
              />
            </Box>
            <Box>
              <input
                type="submit"
                value="Grant access to your GitHub data"
                disabled={!isInputValid}
              />
            </Box>
          </form>
        </Box>
      </div>
    </>
  );
}

function isValid(token: string, hostname: string): boolean {
  if (token.trim() === '') {
    return false;
  }

  const normalizedHostname = hostname.trim();
  return normalizedHostname !== '' && normalizedHostname.indexOf('.') !== -1;
}
