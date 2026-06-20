import { describe, expect, it } from 'vitest';

import {
  createGeocodeCandidates,
  createGeocodeQueries,
} from '../geocoder';

describe('geocode query creation', () => {
  it('住所、施設名、地域代表地点の候補を作る', () => {
    const event = {
      address: '長野県上田市上丸子1488',
      locationText: '丸子文化会館 セレスホール 1階 展示室',
      summaryLocation: '長野県上田市',
    };
    const queries = createGeocodeQueries(event);
    const candidates = createGeocodeCandidates(event);

    expect(queries).toContain('長野県上田市上丸子1488');
    expect(queries).toContain('丸子文化会館');
    expect(queries).toContain('長野県上田市');
    expect(
      candidates.some(
        (candidate) =>
          candidate.query === '長野県上田市' &&
          candidate.precision === 'area',
      ),
    ).toBe(true);
  });

  it('市区町村だけでも代表地点候補として残す', () => {
    const candidates = createGeocodeCandidates({
      address: '',
      locationText: '鹿児島市中央町10番地 キャンセ8階',
      summaryLocation: '',
    });

    expect(
      candidates.some(
        (candidate) =>
          candidate.query === '鹿児島市' &&
          candidate.precision === 'area',
      ),
    ).toBe(true);
  });

  it('付近・近辺・周辺と注釈を除いて駅名を検索する', () => {
    const candidates = createGeocodeCandidates({
      address: '',
      locationText:
        'JR川崎駅近辺（Discordで確認）',
      summaryLocation: '神奈川県川崎市',
    });
    const queries = candidates.map(
      (candidate) => candidate.query,
    );

    expect(queries).toContain('JR川崎駅');
    expect(
      queries.some((query) =>
        /付近|近辺|周辺|Discord/i.test(query),
      ),
    ).toBe(false);
    expect(
      candidates.some(
        (candidate) =>
          candidate.query === 'JR川崎駅' &&
          candidate.precision === 'area',
      ),
    ).toBe(true);
  });

  it('部屋名以降を切り捨てて施設名だけで検索する', () => {
    const queries = createGeocodeQueries({
      address: '',
      locationText:
        '生涯学習センターけやき 第二会議室',
      summaryLocation: '富山県富山市',
    });

    expect(queries).toContain(
      '生涯学習センターけやき',
    );
    expect(queries).toContain(
      '生涯学習センターけやき 富山県富山市',
    );
    expect(
      queries.some((query) =>
        query.includes('第二会議室'),
      ),
    ).toBe(false);
  });
});
