import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  classifyEventCategory,
  classifyEventFilterTags,
} from '../event-type';

describe('event category classification', () => {
  it.each([
    ['体験会', 'experience'],
    ['連勝バトル', 'winning'],
    ['G3大会/タッグ戦', 'g3'],
    ['S1イベント', 's1'],
    ['CASUAL BATTLE DAY', 'casual'],
    [
      'アンバサダーイベント（X-TREME）',
      'ambassador',
    ],
    [
      'B4ストアカップG2大会',
      'g2',
    ],
    ['G1大会', 'g1gp'],
    ['名称不明', 'other'],
  ] as const)(
    '%sを%sへ分類する',
    (value, expected) => {
      expect(
        classifyEventCategory(value),
      ).toBe(expected);
    },
  );
});

describe('event filter tag classification', () => {
  it.each([
    [
      'G3大会（オープン/6歳以上）',
      ['open', 'ranked'],
    ],
    [
      'G3大会（レギュラー/6～12歳限定）',
      ['regular', 'ranked'],
    ],
    [
      'B4ストアカップG2大会（オープン/6歳以上）',
      ['open', 'b4'],
    ],
    [
      'S1イベント/タッグ戦（オープン/6歳以上）',
      ['open', 's1'],
    ],
    [
      'アンバサダーイベント/チーム戦（オープン/6歳以上）',
      ['open', 'ambassador'],
    ],
    ['G1大会', ['ranked']],
    ['GP', ['ranked']],
    ['体験会', ['experience']],
    ['連勝バトル', ['winning']],
    [
      'CASUAL BATTLE DAY',
      ['other'],
    ],
    ['名称不明', ['other']],
  ] as const)(
    '%sへ絞り込み属性を付ける',
    (value, expected) => {
      expect(
        classifyEventFilterTags(value)
          .sort(),
      ).toEqual(
        [...expected].sort(),
      );
    },
  );
});
