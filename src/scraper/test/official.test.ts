import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  convertOfficialEvents,
} from '../official';

describe('official event conversion', () => {
  it('公式APIのイベントを地図イベントへ変換する', () => {
    const events = convertOfficialEvents(
      [
        {
          id: 48922,
          event_type_id: 21,
          event_type_other: null,
          detail_link_url: null,
          state: 4,
          start_date:
            '2026-06-28 01:45',
          shop_name: 'BEYEA1040',
          address1: '岐阜県',
          address2: '関市千疋196',
          event_type_name:
            'アンバサダーイベント',
          event_type_open_name:
            'アンバサダーイベント',
          name:
            'マン族CUP 《神のシュート》6000',
          place_name:
            '西部ふれあいセンター別館',
          place_address1: '岐阜県',
          place_address2: '関市千疋196',
          place_address:
            '岐阜県関市千疋196',
        },
      ],
      '2026-06-28',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'official',
      eventCategory: 'ambassador',
      eventFilterTags: ['ambassador'],
      eventTypeLabel:
        'アンバサダーイベント',
      eventId: 'official:48922',
      title:
        'マン族CUP 《神のシュート》6000',
      startsAtText:
        '2026/06/28 10:45',
      locationText:
        '西部ふれあいセンター別館',
      address: '岐阜県関市千疋196',
    });
  });

  it('検索開始日より前のイベントを除外する', () => {
    const events = convertOfficialEvents(
      [
        {
          id: 1,
          event_type_id: 1,
          event_type_other: null,
          detail_link_url: null,
          state: 4,
          start_date:
            '2026-06-27 00:00',
          shop_name: '店舗',
          address1: '東京都',
          address2: '千代田区',
          event_type_name: '体験会',
          event_type_open_name: '体験会',
          name: '',
          place_name: '',
          place_address1: '',
          place_address2: '',
          place_address: '',
        },
      ],
      '2026-06-28',
    );

    expect(events).toHaveLength(0);
  });
});
