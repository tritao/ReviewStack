/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import TrustedRenderedMarkdown from './TrustedRenderedMarkdown';
import {renderToStaticMarkup} from 'react-dom/server';

describe('TrustedRenderedMarkdown', () => {
  test('marks block content as GitHub-rendered Markdown', () => {
    const html = renderToStaticMarkup(
      <TrustedRenderedMarkdown trustedHTML={'<p>Rendered by GitHub</p>'} />,
    );

    expect(html).toBe('<div class="markdown-body PRT-bodyHTML"><p>Rendered by GitHub</p></div>');
  });

  test('preserves caller classes and inline rendering', () => {
    const html = renderToStaticMarkup(
      <TrustedRenderedMarkdown trustedHTML={'<strong>Title</strong>'} inline className="title" />,
    );

    expect(html).toBe('<span class="title PRT-bodyHTML"><strong>Title</strong></span>');
  });
});
