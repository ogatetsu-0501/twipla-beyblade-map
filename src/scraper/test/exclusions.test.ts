import { describe, expect, it } from 'vitest';

import {
  extractDetailSocialLinks,
  isExcludedByDetailSocialLinks,
  normalizeSocialLink,
} from '../exclusions';

describe('detail SNS exclusions', () => {
  it('twitter.comをx.comとして正規化する', () => {
    expect(
      normalizeSocialLink(
        'https://twitter.com/Takashi/status/123?ref=test',
      ),
    ).toBe('x.com/takashi/status/123');
  });

  it('詳細本文内のSNSリンクだけを抽出する', () => {
    const html = `
      <div id="desc">
        <a href="https://x.com/Takashi">X</a>
        <a href="https://example.com/page">通常リンク</a>
      </div>
      <a href="https://x.com/intent/tweet">共有リンク</a>
    `;

    expect(extractDetailSocialLinks(html)).toEqual([
      'x.com/takashi',
    ]);
  });

  it('設定された詳細SNSリンクを除外する', () => {
    expect(
      isExcludedByDetailSocialLinks([
        'x.com/takashi/status/123',
      ]),
    ).toBe(true);
  });

  it('別のSNSリンクは除外しない', () => {
    expect(
      isExcludedByDetailSocialLinks([
        'x.com/another_user',
      ]),
    ).toBe(false);
  });
});
