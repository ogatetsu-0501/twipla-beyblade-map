import { describe, expect, it } from 'vitest';

import { createGeocodeQueries } from '../geocoder';

describe('createGeocodeQueries', () => {
  it('住所だけでなく施設名と地域名の候補も作る', () => {
    const queries = createGeocodeQueries({
      address: '長野県上田市上丸子1488',
      locationText: '丸子文化会館',
      summaryLocation: '長野県上田市',
    });

    expect(queries).toEqual([
      '長野県上田市上丸子1488',
      '丸子文化会館 長野県上田市上丸子1488',
      '丸子文化会館 長野県上田市',
      '丸子文化会館',
      '長野県上田市',
    ]);
  });
});
