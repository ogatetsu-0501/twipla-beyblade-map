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
      eventUrl:
        'https://beyblade.takaratomy.co.jp/beyblade-x/shop_event/manage/open_detail_all.html?id=48922',
      title:
        'マン族CUP 《神のシュート》6000',
      startsAtText:
        '2026/06/28 10:45',
      locationText:
        '西部ふれあいセンター別館',
      address: '岐阜県関市千疋196',
    });
  });


  it('公式イベントはID付き詳細ページへリンクする', () => {
    const events = convertOfficialEvents(
      [
        {
          id: 48584,
          event_type_id: 4,
          event_type_other: null,
          detail_link_url:
            'https://example.com/external',
          state: 4,
          start_date:
            '2026-07-01 01:00',
          shop_name: 'テスト店舗',
          address1: '東京都',
          address2: '千代田区',
          event_type_name: 'S1大会',
          event_type_open_name:
            'S1イベント',
          name: 'テスト大会',
          place_name: 'テスト会場',
          place_address1: '東京都',
          place_address2: '千代田区',
          place_address:
            '東京都千代田区',
        },
      ],
      '2026-07-01',
    );

    expect(events[0]?.eventUrl).toBe(
      'https://beyblade.takaratomy.co.jp/beyblade-x/shop_event/manage/open_detail_all.html?id=48584',
    );
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

  it('nullを含む公式イベントでも例外にせず代替タイトルを作る', () => {
    const events = convertOfficialEvents(
      [
        {
          id: 50000,
          event_type_id: 4,
          event_type_other: null,
          detail_link_url: null,
          state: 4,
          start_date:
            '2026-07-01 01:00',
          shop_name: 'テスト店舗',
          address1: '東京都',
          address2: '千代田区1-1',
          event_type_name: 'S1大会',
          event_type_open_name: 'S1イベント',
          name: null,
          place_name: null,
          place_address1: null,
          place_address2: null,
          place_address: null,
        },
        null,
      ],
      '2026-06-30',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: 'official:50000',
      title: 'S1イベント｜テスト店舗',
      locationText: 'テスト店舗',
      address: '東京都千代田区1-1',
    });
  });

});
