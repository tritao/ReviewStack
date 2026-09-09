/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {CommitChange, Diff, ModifyChange} from './github/diffTypes';
import type {GitObjectID} from './github/types';

import {FileHeader} from './SplitDiffFileHeader';
import SplitDiffView from './SplitDiffView';
import {findExactRenames} from './exactRenames';
import UnauthorizedError from './github/UnauthorizedError';
import hasBinaryContent from './hasBinaryContent';
import joinPath from './joinPath';
import {fileContentsDeltaAtom, gitHubBlobAtom} from './jotai/atoms';
import {Box, Button, Flash, Text} from '@primer/react';
import {useAtomValue} from 'jotai';
import React, {Component, Suspense, useMemo} from 'react';

function DiffFileSkeleton(): React.ReactElement {
  return (
    <Box
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.default"
      borderRadius={2}
      padding={3}
      bg="canvas.subtle">
      <Box height={20} width="60%" bg="neutral.muted" borderRadius={1} />
    </Box>
  );
}

export default function DiffView({diff, isPullRequest}: {diff: Diff; isPullRequest: boolean}) {
  if (diff != null) {
    const renames = findExactRenames(diff);
    const renameByIndex = new Map(renames.map(rename => [rename.removeIndex, rename]));
    const consumedIndexes = new Set(
      renames.flatMap(rename => [rename.removeIndex, rename.addIndex]),
    );
    return (
      <div>
        {diff.map((change, index) => {
          const rename = renameByIndex.get(index);
          if (rename != null) {
            return (
              <Box paddingY={1} key={`${rename.beforePath}->${rename.afterPath}`}>
                <MetadataOnlyFile
                  path={rename.afterPath}
                  description={`Renamed from ${rename.beforePath}. Contents unchanged.`}
                />
              </Box>
            );
          }
          if (consumedIndexes.has(index)) {
            return null;
          }
          const name = change.type === 'modify' ? change.before.name : change.entry.name;
          const key = `${change.basePath}/${name}`;
          return (
            <DiffFileErrorBoundary key={key} path={getPathForDisplay(change)}>
              <Suspense fallback={<DiffFileSkeleton />}>
                <Box paddingY={1}>
                  <ChangeDisplay change={change} isPullRequest={isPullRequest} />
                </Box>
              </Suspense>
            </DiffFileErrorBoundary>
          );
        })}
      </div>
    );
  } else {
    return <div>commit not found or fetched from GitHub URL above</div>;
  }
}

function getPathForDisplay(change: CommitChange): string {
  const entry = change.type === 'modify' ? change.after : change.entry;
  return joinPath(change.basePath, entry.name);
}

class DiffFileErrorBoundary extends Component<
  {children: React.ReactNode; path: string},
  {error: unknown}
> {
  state: {error: unknown} = {error: null};

  static getDerivedStateFromError(error: unknown) {
    return {error};
  }

  render() {
    const {error} = this.state;
    if (error == null) {
      return this.props.children;
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return (
      <Box paddingY={1}>
        <FileHeader path={this.props.path} />
        <Flash variant="warning">
          <Text>Could not load this file: {message}</Text>{' '}
          <Button size="small" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Flash>
      </Box>
    );
  }
}

function ChangeDisplay({change, isPullRequest}: {change: CommitChange; isPullRequest: boolean}) {
  if (change.type === 'modify' && change.before.oid === change.after.oid) {
    return (
      <MetadataOnlyFile
        path={joinPath(change.basePath, change.before.name)}
        description={`Mode changed from ${formatMode(change.before.mode)} to ${formatMode(
          change.after.mode,
        )}.`}
      />
    );
  }
  const beforeEntry =
    change.type === 'modify' ? change.before : change.type === 'remove' ? change.entry : null;
  const afterEntry =
    change.type === 'modify' ? change.after : change.type === 'add' ? change.entry : null;
  if (beforeEntry?.mode === 57344 || afterEntry?.mode === 57344) {
    const path = joinPath(change.basePath, (beforeEntry ?? afterEntry)?.name ?? 'submodule');
    return (
      <MetadataOnlyFile
        path={path}
        description={`Submodule revision changed from ${beforeEntry?.oid ?? 'none'} to ${
          afterEntry?.oid ?? 'none'
        }.`}
      />
    );
  }
  switch (change.type) {
    case 'add': {
      const {basePath, entry} = change;
      const {name, oid} = entry;
      return <AddedFile basePath={basePath} name={name} oid={oid} isPullRequest={isPullRequest} />;
    }
    case 'remove': {
      const {basePath, entry} = change;
      const {name, oid} = entry;
      return <RemovedFile basePath={basePath} name={name} oid={oid} />;
    }
    case 'modify': {
      return <ModifiedFile modify={change} isPullRequest={isPullRequest} />;
    }
  }
}

function formatMode(mode: number): string {
  return mode.toString(8);
}

function MetadataOnlyFile({path, description}: {path: string; description: string}) {
  return (
    <Box>
      <FileHeader path={path} />
      <Text>{description}</Text>
    </Box>
  );
}

function AddedFile({
  basePath,
  name,
  oid,
  isPullRequest,
}: {
  basePath: string;
  name: string;
  oid: GitObjectID;
  isPullRequest: boolean;
}) {
  const path = joinPath(basePath, name);
  const blobAtom = useMemo(() => gitHubBlobAtom(oid), [oid]);
  const blob = useAtomValue(blobAtom);
  const {isBinary, text} = blob ?? {};
  // Check both the isBinary flag and perform our own binary content detection
  if (text != null && !isBinary && !hasBinaryContent(text)) {
    return <SplitDiffView path={path} before={null} after={oid} isPullRequest={isPullRequest} />;
  } else {
    return <BinaryFile path={path} />;
  }
}

function RemovedFile({basePath, name, oid}: {basePath: string; name: string; oid: GitObjectID}) {
  const path = joinPath(basePath, name);
  const blobAtom = useMemo(() => gitHubBlobAtom(oid), [oid]);
  // useAtomValue will suspend until the blob is loaded
  useAtomValue(blobAtom);
  return (
    <div>
      <FileHeader path={path} />
      <div className="patch-remove-line">File removed.</div>
    </div>
  );
}

function ModifiedFile({modify, isPullRequest}: {modify: ModifyChange; isPullRequest: boolean}) {
  const {basePath, before, after} = modify;
  const path = joinPath(basePath, before.name);
  const fileMod = useMemo(
    () => ({
      before: before.oid,
      after: after.oid,
      path,
    }),
    [before.oid, after.oid, path],
  );
  const fileModAtom = useMemo(() => fileContentsDeltaAtom(fileMod), [fileMod]);
  const delta = useAtomValue(fileModAtom);
  const {before: beforeBlob, after: afterBlob} = delta;
  if (beforeBlob == null || afterBlob == null) {
    // Something went wrong?
    return null;
  }

  // Check both the isBinary flag and perform our own binary content detection
  if (
    beforeBlob.isBinary ||
    afterBlob.isBinary ||
    hasBinaryContent(beforeBlob.text) ||
    hasBinaryContent(afterBlob.text)
  ) {
    // We could handle this more gracefully, particularly if only one of the
    // two files is binary, but this is good enough, for now.
    return <BinaryFile path={path} />;
  } else if (beforeBlob.text == null || afterBlob.text == null) {
    // Something went wrong?
    return null;
  } else {
    return (
      <SplitDiffView
        path={path}
        before={beforeBlob.oid}
        after={afterBlob.oid}
        isPullRequest={isPullRequest}
      />
    );
  }
}

function BinaryFile({path}: {path: string}) {
  return (
    <Box>
      <FileHeader path={path} />
      <Text>Binary file not shown.</Text>
    </Box>
  );
}
