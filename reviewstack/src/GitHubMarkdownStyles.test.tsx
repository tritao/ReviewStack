/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {getGitHubMarkdownStyles} from './GitHubMarkdownStyles';

jest.mock('@primer/react', () => ({useTheme: () => ({theme: undefined})}));

const theme = {
  fonts: {normal: 'system-ui', mono: 'monospace'},
  colors: {
    fg: {default: '#fg', muted: '#muted'},
    accent: {fg: '#note-fg', emphasis: '#note-border'},
    success: {fg: '#tip-fg', emphasis: '#tip-border'},
    done: {fg: '#important-fg', emphasis: '#important-border'},
    attention: {fg: '#warning-fg', emphasis: '#warning-border'},
    danger: {fg: '#caution-fg', emphasis: '#caution-border'},
    border: {default: '#border', muted: '#border-muted'},
    canvas: {default: '#canvas', subtle: '#canvas-subtle'},
    neutral: {muted: '#neutral-muted'},
    diffBlob: {
      deletion: {lineBg: '#deletion-line', numBg: '#deletion-num', numText: '#deletion-text'},
      addition: {
        lineBg: '#addition-line',
        numBg: '#addition-num',
        numText: '#addition-text',
        wordBg: '#addition-word',
      },
    },
  },
};

describe('GitHub Markdown styles', () => {
  const styles = getGitHubMarkdownStyles(theme);

  test.each([
    ['note', '#note-fg', '#note-border'],
    ['tip', '#tip-fg', '#tip-border'],
    ['important', '#important-fg', '#important-border'],
    ['warning', '#warning-fg', '#warning-border'],
    ['caution', '#caution-fg', '#caution-border'],
  ])('maps the %s alert to Primer theme colors', (kind, foreground, border) => {
    expect(styles).toContain(`.markdown-alert-${kind} { border-left-color: ${border}; }`);
    expect(styles).toContain(
      `.markdown-alert-${kind} .markdown-alert-title { color: ${foreground}; }`,
    );
  });

  test('covers GitHub rendered Markdown structures', () => {
    for (const selector of [
      'h1',
      'ul',
      '.task-list-item-checkbox',
      'markdown-accessiblity-table',
      'table th',
      'img',
      'kbd',
      'details summary',
      '.footnotes',
      '[data-footnote-ref]',
      '.markdown-alert',
    ]) {
      expect(styles).toContain(`.markdown-body.PRT-bodyHTML ${selector}`);
    }
  });

  test('uses readable fallbacks for content requiring GitHub enrichment', () => {
    expect(styles).toContain(
      '.js-render-needs-enrichment .js-render-enrichment-loader { display: none; }',
    );
    expect(styles).toContain(
      '.js-render-needs-enrichment .render-plaintext-hidden { display: block; }',
    );
  });
});
