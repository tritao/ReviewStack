/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {VersionCommit} from './github/types';

import {useCommand} from './KeyboardShortcuts';
import {isAutomatedCommit, isReviewableCommit} from './commitReview';
import {
  gitHubPullRequestComparableVersionsAtom,
  gitHubPullRequestReviewTargetAtom,
  gitHubPullRequestSelectedVersionCommitsAtom,
  gitHubPullRequestSelectedVersionIndexAtom,
  gitHubPullRequestVersionDiffAtom,
  gitHubPullRequestVersionsAtom,
} from './jotai';
import {
  isReviewProgressComplete,
  setReviewProgressComplete,
  useReviewProgressVersion,
} from './reviewProgress';
import {updateReviewURL} from './reviewURL';
import {shortOid} from './utils';
import {ActionList, ActionMenu, Button, ButtonGroup} from '@primer/react';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';
import {loadable} from 'jotai/utils';
import {useEffect, useState} from 'react';

// Keep the action bar mounted while the selected commit's diff is fetched.
// Reading the promise atom directly would suspend PullRequestVersions through
// PullRequestHeader's fallback boundary.
const loadableVersionDiffAtom = loadable(gitHubPullRequestVersionDiffAtom);

export default function PullRequestReviewMode(): React.ReactElement {
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const versions = useAtomValue(gitHubPullRequestVersionsAtom);
  const selectedVersionIndex = useAtomValue(gitHubPullRequestSelectedVersionIndexAtom);
  const [target, setTarget] = useAtom(gitHubPullRequestReviewTargetAtom);
  const setComparableVersions = useSetAtom(gitHubPullRequestComparableVersionsAtom);
  const diffLoadable = useAtomValue(loadableVersionDiffAtom);
  const diff = diffLoadable.state === 'hasData' ? diffLoadable.data : null;
  const diffReady = diffLoadable.state === 'hasData' && diffLoadable.data != null;
  useReviewProgressVersion();
  const [showUnviewedWarning, setShowUnviewedWarning] = useState(false);
  const selectedIndex =
    target.type === 'commit' ? commits.findIndex(commit => commit.commit === target.commitID) : -1;
  const selectedCommit = commits[selectedIndex];
  const reviewableCommitCount = commits.filter(isReviewableCommit).length;

  useEffect(() => {
    if (target.type === 'commit' && selectedIndex === -1) {
      setTarget({type: 'layer'});
    }
  }, [selectedIndex, setTarget, target.type]);

  const selectLayer = () => {
    setTarget({type: 'layer'});
    const version = versions[selectedVersionIndex];
    setComparableVersions(
      version == null ? null : {beforeCommitID: null, afterCommitID: version.headCommit},
    );
    updateReviewURL({mode: 'layer', commitID: null});
  };
  const selectCommit = (index: number) => {
    const commit = commits[index];
    if (commit != null && !isAutomatedCommit(commit)) {
      setTarget({type: 'commit', commitID: commit.commit});
      updateReviewURL({mode: 'commit', commitID: commit.commit});
    }
  };
  const firstUnreviewedIndex = commits.findIndex(
    commit => isReviewableCommit(commit) && !isReviewProgressComplete('commit', commit.commit),
  );
  const firstReviewableIndex = commits.findIndex(isReviewableCommit);
  const previousReviewableIndex = findPreviousReviewableIndex(commits, selectedIndex);
  const nextReviewableIndex = commits.findIndex(
    (commit, index) => index > selectedIndex && isReviewableCommit(commit),
  );
  const changedPaths =
    diff?.diff.map(change => {
      const entry = change.type === 'modify' ? change.after : change.entry;
      return [change.basePath, entry.name].filter(Boolean).join('/');
    }) ?? [];
  const unviewedFiles = changedPaths.filter(path => !isReviewProgressComplete('file', path));
  useEffect(() => setShowUnviewedWarning(false), [selectedIndex]);

  const markReviewedAndContinue = (force = false) => {
    const commit = commits[selectedIndex];
    if (commit == null || isAutomatedCommit(commit) || !diffReady) {
      return;
    }
    if (!force && unviewedFiles.length > 0) {
      setShowUnviewedWarning(true);
      return;
    }
    setReviewProgressComplete('commit', commit.commit, true);
    const nextIndex = commits.findIndex(
      (candidate, index) =>
        index > selectedIndex &&
        isReviewableCommit(candidate) &&
        !isReviewProgressComplete('commit', candidate.commit),
    );
    if (nextIndex !== -1) {
      selectCommit(nextIndex);
    }
  };
  useCommand('PreviousCommit', () => selectCommit(previousReviewableIndex));
  useCommand('NextCommit', () => selectCommit(nextReviewableIndex));

  return (
    <>
      <ButtonGroup>
        <Button
          title="Review only the changes introduced by this pull-request layer"
          variant={target.type === 'layer' ? 'primary' : 'default'}
          onClick={selectLayer}>
          Layer
        </Button>
        <Button
          variant={target.type === 'commit' ? 'primary' : 'default'}
          title="Review one commit from this version at a time"
          disabled={reviewableCommitCount === 0}
          onClick={() =>
            selectCommit(
              selectedIndex !== -1 && isReviewableCommit(commits[selectedIndex])
                ? selectedIndex
                : firstUnreviewedIndex === -1
                ? firstReviewableIndex
                : firstUnreviewedIndex,
            )
          }>
          Commit
        </Button>
      </ButtonGroup>
      {target.type === 'commit' && (
        <>
          <Button
            title="Previous commit (Alt+Up)"
            disabled={previousReviewableIndex === -1}
            onClick={() => selectCommit(previousReviewableIndex)}>
            Previous
          </Button>
          <ActionMenu>
            <ActionMenu.Button>
              {selectedIndex + 1}/{commits.length} · {shortOid(target.commitID)}
            </ActionMenu.Button>
            <ActionMenu.Overlay width="large">
              <ActionList selectionVariant="single">
                {commits.map((commit, index) => (
                  <ActionList.Item
                    key={commit.commit}
                    disabled={isAutomatedCommit(commit)}
                    selected={index === selectedIndex}
                    onSelect={() => selectCommit(index)}>
                    {index + 1}. {commit.title}
                    {isAutomatedCommit(commit) ? ' · automated (skipped)' : ''}
                  </ActionList.Item>
                ))}
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
          <Button
            title="Next commit (Alt+Down)"
            disabled={nextReviewableIndex === -1}
            onClick={() => selectCommit(nextReviewableIndex)}>
            Next
          </Button>
          {selectedCommit != null && isAutomatedCommit(selectedCommit) ? (
            <Button disabled title="Automated commit deactivated from review">
              Automated commit skipped
            </Button>
          ) : showUnviewedWarning && diffReady ? (
            <>
              <Button disabled>{unviewedFiles.length} files unviewed</Button>
              <Button variant="danger" onClick={() => markReviewedAndContinue(true)}>
                Mark anyway
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={!diffReady}
              title={
                diffLoadable.state === 'loading'
                  ? 'Loading changed files…'
                  : diffLoadable.state === 'hasError'
                  ? 'Changed files are unavailable'
                  : undefined
              }
              onClick={() => markReviewedAndContinue()}>
              Reviewed → next
            </Button>
          )}
        </>
      )}
    </>
  );
}

function findPreviousReviewableIndex(
  commits: ReadonlyArray<VersionCommit>,
  selectedIndex: number,
): number {
  for (let index = selectedIndex - 1; index >= 0; index--) {
    if (isReviewableCommit(commits[index])) {
      return index;
    }
  }
  return -1;
}
