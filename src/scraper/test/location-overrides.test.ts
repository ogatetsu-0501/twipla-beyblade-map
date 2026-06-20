import { describe, expect, it } from 'vitest';

import { findLocationOverride } from '../location-overrides';

describe('location overrides', () => {
  it('おもちゃのバンビ本郷店を施設座標へ割り当てる', () => {
    const result = findLocationOverride({
      locationText: 'おもちゃのバンビ本郷店',
      address: '',
      summaryLocation: '',
    });

    expect(result).toMatchObject({
      latitude: 36.66833120302214,
      longitude: 137.22910154960238,
      locationStatus: 'venue',
    });
  });

  it('短縮されたバンビ本郷店表記にも一致する', () => {
    const result = findLocationOverride({
      locationText: 'バンビ本郷店',
      address: '',
      summaryLocation: '',
    });

    expect(result?.locationStatus).toBe('venue');
  });


  it('設定外の場所には固定座標を適用しない', () => {
    const result = findLocationOverride({
      locationText: '別の会場',
      address: '',
      summaryLocation: '東京都',
    });

    expect(result).toBeNull();
  });
});
