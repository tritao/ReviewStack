/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import StyledOcticon from './StyledOcticon';
import UnauthorizedErrorHandler from './UnauthorizedErrorHandler';
import UnauthorizedError from './github/UnauthorizedError';
import StackMetadataError from './stackErrors';
import {AlertIcon} from '@primer/octicons-react';
import {Text, Flash, Box} from '@primer/react';
import {Component} from 'react';

const CHUNK_RECOVERY_PARAMETER = '__reviewstack_reload';
const CHUNK_RECOVERY_STORAGE_KEY = 'reviewstack.chunk-recovery';
const CHUNK_RECOVERY_WINDOW_MS = 60_000;

function ErrorNotice({title, error}: {title: React.ReactNode; error: Error}) {
  return (
    <Flash variant="warning" sx={{margin: 20}}>
      <StyledOcticon icon={AlertIcon} />
      <Text fontWeight="bold">{title}</Text>
      <Box as="p">
        <Text fontFamily={'mono'}>{error.stack ?? error.toString()}</Text>
      </Box>
    </Flash>
  );
}

type Props = {
  children: React.ReactNode;
};
type State = {error: Error | null};
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) {
      recoverFromStaleBundle();
    }
  }

  render() {
    if (this.state.error != null) {
      // For unauthorized errors, clear the token and redirect to login
      if (this.state.error instanceof UnauthorizedError) {
        return <UnauthorizedErrorHandler message={this.state.error.message} />;
      }
      if (this.state.error instanceof StackMetadataError) {
        return <ErrorNotice title="Stack metadata needs attention" error={this.state.error} />;
      }
      return <ErrorNotice title="Something went wrong" error={this.state.error} />;
    }

    return this.props.children;
  }
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /(?:Loading chunk|Loading CSS chunk) \d+ failed/i.test(error.message)
  );
}

function recoverFromStaleBundle(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const now = Date.now();
    const previousAttempt = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY));
    if (Number.isFinite(previousAttempt) && now - previousAttempt < CHUNK_RECOVERY_WINDOW_MS) {
      return;
    }
    window.sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(now));

    const url = new URL(window.location.href);
    url.searchParams.set(CHUNK_RECOVERY_PARAMETER, String(now));
    window.location.replace(url.href);
  } catch {
    // Storage or navigation can be unavailable in privacy-restricted browsers;
    // leave the normal error notice available in that case.
  }
}
