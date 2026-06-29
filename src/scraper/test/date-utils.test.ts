import { describe, expect, it } from 'vitest';

import {
  createTomorrowJapanDate,
  formatUnixSecondsInJapan,
  japanDateToUnixSeconds,
} from '../date-utils';

describe('Japan date utilities', () => {
  it('日本時間の翌日を返す', () => {
    expect(
      createTomorrowJapanDate(
        new Date('2026-06-28T15:00:00.000Z'),
      ),
    ).toBe('2026-06-30');
  });

  it('日本時間の00:00をUnix秒へ変換する', () => {
    const seconds =
      japanDateToUnixSeconds('2026-06-30');

    expect(
      new Date(Number(seconds) * 1000)
        .toISOString(),
    ).toBe('2026-06-29T15:00:00.000Z');
  });

  it('Unix秒を日本時間へ整形する', () => {
    expect(
      formatUnixSecondsInJapan('1783141200'),
    ).toMatch(/^2026\/07\/04 /);
  });
});
