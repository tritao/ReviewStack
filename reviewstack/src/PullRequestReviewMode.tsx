/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {useCommand} from './KeyboardShortcuts';
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
import {useEffect, useState} from 'react';

export default function PullRequestReviewMode(): React.ReactElement {
  const commits = useAtomValue(gitHubPullRequestSelectedVersionCommitsAtom);
  const versions = useAtomValue(gitHubPullRequestVersionsAtom);
  const selectedVersionIndex = useAtomValue(gitHubPullRequestSelectedVersionIndexAtom);
  const [target, setTarget] = useAtom(gitHubPullRequestReviewTargetAtom);
  const setComparableVersions = useSetAtom(gitHubPullRequestComparableVersionsAtom);
  const diff = useAtomValue(gitHubPullRequestVersionDiffAtom);
  useReviewProgressVersion();
  const [showUnviewedWarning, setShowUnviewedWarning] = useState(false);
  const selectedIndex =
    target.type === 'commit' ? commits.findIndex(commit => commit.commit === target.commitID) : -1;

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
    if (commit != null) {
      setTarget({type: 'commit', commitID: commit.commit});
      updateReviewURL({mode: 'commit', commitID: commit.commit});
    }
  };
  const firstUnreviewedIndex = commits.findIndex(
    commit => commit.parents.length <= 1 && !isReviewProgressComplete('commit', commit.commit),
  );
  const previousReviewableIndex = findPreviousReviewableIndex(commits, selectedIndex);
  const nextReviewableIndex = commits.findIndex(
    (commit, index) => index > selectedIndex && commit.parents.length <= 1,
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
    if (commit == null) {
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
        candidate.parents.length <= 1 &&
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
          disabled={commits.length === 0}
          onClick={() =>
            selectCommit(
              selectedIndex === -1
                ? firstUnreviewedIndex === -1
                  ? 0
                  : firstUnreviewedIndex
                : selectedIndex,
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
                    selected={index === selectedIndex}
                    onSelect={() => selectCommit(index)}>
                    {index + 1}. {commit.title}
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
          {showUnviewedWarning ? (
            <>
              <Button disabled>{unviewedFiles.length} files unviewed</Button>
              <Button variant="danger" onClick={() => markReviewedAndContinue(true)}>
                Mark anyway
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => markReviewedAndContinue()}>
              Reviewed → next
            </Button>
          )}
        </>
      )}
    </>
  );
}

function findPreviousReviewableIndex(
  commits: ReadonlyArray<{parents: string[]}>,
  selectedIndex: number,
): number {
  for (let index = selectedIndex - 1; index >= 0; index--) {
    if (commits[index].parents.length <= 1) {
      return index;
    }
  }
  return -1;
}
