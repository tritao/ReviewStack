/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {Theme} from '@primer/react/lib/ThemeProvider';

import {useTheme} from '@primer/react';
import React from 'react';

/**
 * GitHub's bodyHTML contains semantic markup and GitHub-specific class names,
 * but not the CSS that gives them their appearance. Keep those rules scoped to
 * TrustedRenderedMarkdown so opaque API HTML cannot affect the rest of the UI.
 */
// eslint-disable-next-line prefer-arrow-callback
export default React.memo(function GitHubMarkdownStyles(): React.ReactElement {
  const {theme} = useTheme();
  return <style>{getGitHubMarkdownStyles(theme)}</style>;
});

export function getGitHubMarkdownStyles(theme: Theme | undefined): string {
  const colors = theme?.colors;
  return `
.markdown-body.PRT-bodyHTML {
  color: ${colors?.fg.default};
  font-family: ${theme?.fonts.normal};
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: break-word;
}

.markdown-body.PRT-bodyHTML::before,
.markdown-body.PRT-bodyHTML::after {
  display: table;
  content: "";
}

.markdown-body.PRT-bodyHTML::after {
  clear: both;
}

.markdown-body.PRT-bodyHTML > *:first-child { margin-top: 0 !important; }
.markdown-body.PRT-bodyHTML > *:last-child { margin-bottom: 0 !important; }

.markdown-body.PRT-bodyHTML p,
.markdown-body.PRT-bodyHTML blockquote,
.markdown-body.PRT-bodyHTML ul,
.markdown-body.PRT-bodyHTML ol,
.markdown-body.PRT-bodyHTML dl,
.markdown-body.PRT-bodyHTML table,
.markdown-body.PRT-bodyHTML pre,
.markdown-body.PRT-bodyHTML details {
  margin-top: 0;
  margin-bottom: 16px;
}

.PRT-bodyHTML a { color: ${colors?.accent.fg}; }
.markdown-body.PRT-bodyHTML a:not([href]) { color: inherit; text-decoration: none; }
.markdown-body.PRT-bodyHTML .color-fg-muted { color: ${colors?.fg.muted}; }
.markdown-body.PRT-bodyHTML .sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.markdown-body.PRT-bodyHTML h1,
.markdown-body.PRT-bodyHTML h2,
.markdown-body.PRT-bodyHTML h3,
.markdown-body.PRT-bodyHTML h4,
.markdown-body.PRT-bodyHTML h5,
.markdown-body.PRT-bodyHTML h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}
.markdown-body.PRT-bodyHTML h1 { padding-bottom: 0.3em; font-size: 2em; border-bottom: 1px solid ${colors?.border.muted}; }
.markdown-body.PRT-bodyHTML h2 { padding-bottom: 0.3em; font-size: 1.5em; border-bottom: 1px solid ${colors?.border.muted}; }
.markdown-body.PRT-bodyHTML h3 { font-size: 1.25em; }
.markdown-body.PRT-bodyHTML h4 { font-size: 1em; }
.markdown-body.PRT-bodyHTML h5 { font-size: 0.875em; }
.markdown-body.PRT-bodyHTML h6 { color: ${colors?.fg.muted}; font-size: 0.85em; }
.markdown-body.PRT-bodyHTML summary h1,
.markdown-body.PRT-bodyHTML summary h2,
.markdown-body.PRT-bodyHTML summary h3,
.markdown-body.PRT-bodyHTML summary h4,
.markdown-body.PRT-bodyHTML summary h5,
.markdown-body.PRT-bodyHTML summary h6 { display: inline-block; }
.markdown-body.PRT-bodyHTML summary h1,
.markdown-body.PRT-bodyHTML summary h2 { padding-bottom: 0; border-bottom: 0; }

.markdown-body.PRT-bodyHTML .anchor {
  float: left;
  padding-right: 4px;
  margin-left: -20px;
  line-height: 1;
}
.markdown-body.PRT-bodyHTML h1 .octicon-link,
.markdown-body.PRT-bodyHTML h2 .octicon-link,
.markdown-body.PRT-bodyHTML h3 .octicon-link,
.markdown-body.PRT-bodyHTML h4 .octicon-link,
.markdown-body.PRT-bodyHTML h5 .octicon-link,
.markdown-body.PRT-bodyHTML h6 .octicon-link { color: ${colors?.fg.default}; visibility: hidden; vertical-align: middle; }
.markdown-body.PRT-bodyHTML h1:hover .octicon-link,
.markdown-body.PRT-bodyHTML h2:hover .octicon-link,
.markdown-body.PRT-bodyHTML h3:hover .octicon-link,
.markdown-body.PRT-bodyHTML h4:hover .octicon-link,
.markdown-body.PRT-bodyHTML h5:hover .octicon-link,
.markdown-body.PRT-bodyHTML h6:hover .octicon-link { visibility: visible; }

.markdown-body.PRT-bodyHTML ul,
.markdown-body.PRT-bodyHTML ol { padding-left: 2em; }
.markdown-body.PRT-bodyHTML ul.no-list,
.markdown-body.PRT-bodyHTML ol.no-list { padding: 0; list-style-type: none; }
.markdown-body.PRT-bodyHTML ul ul,
.markdown-body.PRT-bodyHTML ul ol,
.markdown-body.PRT-bodyHTML ol ol,
.markdown-body.PRT-bodyHTML ol ul { margin-top: 0; margin-bottom: 0; }
.markdown-body.PRT-bodyHTML li > p { margin-top: 16px; }
.markdown-body.PRT-bodyHTML li + li { margin-top: 0.25em; }
.markdown-body.PRT-bodyHTML .task-list-item { list-style-type: none; }
.markdown-body.PRT-bodyHTML .task-list-item-checkbox { margin: 0 0.2em 0.25em -1.4em; vertical-align: middle; }
.markdown-body.PRT-bodyHTML dl { padding: 0; }
.markdown-body.PRT-bodyHTML dl dt { margin-top: 16px; font-size: 1em; font-style: italic; font-weight: 600; }
.markdown-body.PRT-bodyHTML dl dd { padding: 0 16px; margin-bottom: 16px; }

.markdown-body.PRT-bodyHTML blockquote {
  padding: 0 1em;
  color: ${colors?.fg.muted};
  border-left: 0.25em solid ${colors?.border.default};
}
.markdown-body.PRT-bodyHTML blockquote > :first-child { margin-top: 0; }
.markdown-body.PRT-bodyHTML blockquote > :last-child { margin-bottom: 0; }
.markdown-body.PRT-bodyHTML hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: ${colors?.border.default}; border: 0; }

.markdown-body.PRT-bodyHTML table,
.markdown-body.PRT-bodyHTML markdown-accessiblity-table { max-width: 100%; overflow: auto; }
.markdown-body.PRT-bodyHTML markdown-accessiblity-table { display: block; }
.markdown-body.PRT-bodyHTML table { display: block; width: max-content; max-width: 100%; border-spacing: 0; border-collapse: collapse; font-variant: tabular-nums; }
.markdown-body.PRT-bodyHTML table th { font-weight: 600; }
.markdown-body.PRT-bodyHTML table th,
.markdown-body.PRT-bodyHTML table td { padding: 6px 13px; border: 1px solid ${colors?.border.default}; }
.markdown-body.PRT-bodyHTML table tr { background-color: ${colors?.canvas.default}; border-top: 1px solid ${colors?.border.muted}; }
.markdown-body.PRT-bodyHTML table tr:nth-child(2n) { background-color: ${colors?.canvas.subtle}; }
.markdown-body.PRT-bodyHTML table td > :last-child { margin-bottom: 0; }

.markdown-body.PRT-bodyHTML img { max-width: 100%; box-sizing: content-box; }
.markdown-body.PRT-bodyHTML img[align="right"] { padding-left: 20px; }
.markdown-body.PRT-bodyHTML img[align="left"] { padding-right: 20px; }
.markdown-body.PRT-bodyHTML .emoji { max-width: none; vertical-align: text-top; background-color: transparent; }

.markdown-body.PRT-bodyHTML code,
.markdown-body.PRT-bodyHTML tt,
.markdown-body.PRT-bodyHTML pre { font-family: ${theme?.fonts.mono}; }
.markdown-body.PRT-bodyHTML code,
.markdown-body.PRT-bodyHTML tt { padding: 0.2em 0.4em; margin: 0; font-size: 85%; white-space: break-spaces; background-color: ${colors?.neutral.muted}; border-radius: 6px; }
.markdown-body.PRT-bodyHTML pre { padding: 16px; overflow: auto; overflow-wrap: normal; font-size: 85%; line-height: 1.45; color: ${colors?.fg.default}; background-color: ${colors?.canvas.subtle}; border-radius: 6px; }
.markdown-body.PRT-bodyHTML pre > code,
.markdown-body.PRT-bodyHTML pre > tt { display: inline; padding: 0; margin: 0; overflow: visible; line-height: inherit; overflow-wrap: normal; white-space: pre; background: transparent; border: 0; }
.markdown-body.PRT-bodyHTML kbd { display: inline-block; padding: 3px 5px; font: 11px ${theme?.fonts.mono}; line-height: 10px; color: ${colors?.fg.default}; vertical-align: middle; background-color: ${colors?.canvas.subtle}; border: 1px solid ${colors?.border.default}; border-radius: 6px; box-shadow: inset 0 -1px 0 ${colors?.border.default}; }

.markdown-body.PRT-bodyHTML details summary { cursor: pointer; }
.markdown-body.PRT-bodyHTML details:not([open]) > :not(summary) { display: none !important; }
.markdown-body.PRT-bodyHTML .footnotes { font-size: 12px; color: ${colors?.fg.muted}; border-top: 1px solid ${colors?.border.default}; }
.markdown-body.PRT-bodyHTML [data-footnote-ref]::before { content: "["; }
.markdown-body.PRT-bodyHTML [data-footnote-ref]::after { content: "]"; }

.markdown-body.PRT-bodyHTML .markdown-alert { padding: 8px 16px; margin-bottom: 16px; color: inherit; border-left: 0.25em solid ${colors?.border.default}; }
.markdown-body.PRT-bodyHTML .markdown-alert > :first-child { margin-top: 0; }
.markdown-body.PRT-bodyHTML .markdown-alert > :last-child { margin-bottom: 0; }
.markdown-body.PRT-bodyHTML .markdown-alert-title { display: flex; align-items: center; margin-bottom: 4px; font-weight: 500; }
.markdown-body.PRT-bodyHTML .markdown-alert-title .octicon { margin-right: 8px; fill: currentColor; }
.markdown-body.PRT-bodyHTML .markdown-alert-note { border-left-color: ${colors?.accent.emphasis}; }
.markdown-body.PRT-bodyHTML .markdown-alert-note .markdown-alert-title { color: ${colors?.accent.fg}; }
.markdown-body.PRT-bodyHTML .markdown-alert-tip { border-left-color: ${colors?.success.emphasis}; }
.markdown-body.PRT-bodyHTML .markdown-alert-tip .markdown-alert-title { color: ${colors?.success.fg}; }
.markdown-body.PRT-bodyHTML .markdown-alert-important { border-left-color: ${colors?.done.emphasis}; }
.markdown-body.PRT-bodyHTML .markdown-alert-important .markdown-alert-title { color: ${colors?.done.fg}; }
.markdown-body.PRT-bodyHTML .markdown-alert-warning { border-left-color: ${colors?.attention.emphasis}; }
.markdown-body.PRT-bodyHTML .markdown-alert-warning .markdown-alert-title { color: ${colors?.attention.fg}; }
.markdown-body.PRT-bodyHTML .markdown-alert-caution { border-left-color: ${colors?.danger.emphasis}; }
.markdown-body.PRT-bodyHTML .markdown-alert-caution .markdown-alert-title { color: ${colors?.danger.fg}; }

/* GitHub enriches diagrams and math with site JavaScript. ReviewStack does not,
 * so prefer readable source over a loader that never completes. */
.markdown-body.PRT-bodyHTML .js-render-needs-enrichment .js-render-enrichment-loader { display: none; }
.markdown-body.PRT-bodyHTML .js-render-needs-enrichment .render-plaintext-hidden { display: block; }
.markdown-body.PRT-bodyHTML math-renderer { font-family: ${theme?.fonts.mono}; }

/* Suggested changes use specialized HTML returned for review comments. */
.markdown-body.PRT-bodyHTML .blob-code-deletion,
.markdown-body.PRT-bodyHTML .blob-code-marker-deletion { background-color: ${colors?.diffBlob.deletion.lineBg}; }
.markdown-body.PRT-bodyHTML .blob-code-addition,
.markdown-body.PRT-bodyHTML .blob-code-marker-addition { background-color: ${colors?.diffBlob.addition.lineBg}; }
.markdown-body.PRT-bodyHTML .blob-num-deletion { color: ${colors?.diffBlob.deletion.numText}; background-color: ${colors?.diffBlob.deletion.numBg}; }
.markdown-body.PRT-bodyHTML .blob-num-addition { color: ${colors?.diffBlob.addition.numText}; background-color: ${colors?.diffBlob.addition.numBg}; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob,
.markdown-body.PRT-bodyHTML .diff-view { display: flex; flex-direction: column; margin: 8px 0; overflow: hidden; border: 1px solid ${colors?.border.default}; border-radius: 6px; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob > div:first-child { display: flex; flex-direction: column; padding: 8px 10px; font-size: 12px; color: ${colors?.fg.muted}; background-color: ${colors?.canvas.subtle}; border-bottom: 1px solid ${colors?.border.default}; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob > div:first-child .color-fg-muted { display: inline; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob .blob-wrapper { display: flex; flex-direction: column; padding: 0; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob .js-apply-changes:empty { display: none; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob table { width: 100%; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob td { font-family: ${theme?.fonts.mono}; font-size: 12px; line-height: 20px; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob .blob-num { width: 1%; min-width: 40px; padding: 0 10px; font-size: 0; text-align: right; vertical-align: top; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob .blob-code-inner { padding: 0 10px; white-space: pre-wrap; word-break: break-all; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob .x { background-color: ${colors?.diffBlob.addition.wordBg}; }
.markdown-body.PRT-bodyHTML .js-suggested-changes-blob .blob-code-deletion .x { background-color: ${colors?.diffBlob.deletion.wordBg}; }
`;
}
