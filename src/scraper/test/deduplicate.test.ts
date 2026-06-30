import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  areDuplicateEvents,
  areSameEventLocations,
  createEventDateTimeKey,
  deduplicateEvents,
  normalizeEventLocation,
  normalizeEventName,
} from '../deduplicate';
import type {
  EventDetail,
  EventSource,
} from '../types';

const createEvent = (
  source: EventSource,
  overrides:
    Partial<EventDetail> = {},
): EventDetail => ({
  source,
  eventCategory: 'g3',
  eventFilterTags: [
    'ranked',
    'open',
  ],
  eventTypeLabel:
    'G3大会（オープン/6歳以上）',
  eventId: `${source}:1`,
  eventUrl:
    `https://example.com/${source}`,
  title:
    '秋葉原ベイブレードX G3大会',
  startsAtText:
    '2026/07/05 13:00',
  summaryLocation:
    '東京都千代田区',
  address:
    '東京都千代田区外神田1-1-1',
  locationText:
    '秋葉原イベントホール',
  latitude: null,
  longitude: null,
  locationStatus:
    'unknown',
  locationNote: '',
  ...overrides,
});

describe(
  'cross-source event deduplication',
  () => {
    it('同じ名前・開催時間・開催場所ならTwiPlaだけを残す', () => {
      const twipla =
        createEvent(
          'twipla',
          {
            eventId:
              'twipla:1',
          },
        );
      const tonamel =
        createEvent(
          'tonamel',
          {
            eventId:
              'tonamel:1',
            address: '',
          },
        );
      const official =
        createEvent(
          'official',
          {
            eventId:
              'official:1',
          },
        );

      const result =
        deduplicateEvents([
          official,
          tonamel,
          twipla,
        ]);

      expect(
        result,
      ).toHaveLength(1);
      expect(
        result[0]?.source,
      ).toBe('twipla');
      expect(
        result[0]?.eventUrl,
      ).toBe(
        twipla.eventUrl,
      );
    });

    it('同じ名前と時間でも開催場所が違えば残す', () => {
      const tokyo =
        createEvent(
          'twipla',
        );
      const osaka =
        createEvent(
          'official',
          {
            summaryLocation:
              '大阪府大阪市',
            address:
              '大阪府大阪市北区梅田1-1-1',
            locationText:
              '梅田イベントホール',
          },
        );

      expect(
        areDuplicateEvents(
          tokyo,
          osaka,
        ),
      ).toBe(false);
    });

    it('会場名が同じなら住所の有無が違っても重複扱いにする', () => {
      const first =
        createEvent(
          'twipla',
          {
            address: '',
          },
        );
      const second =
        createEvent(
          'official',
        );

      expect(
        areSameEventLocations(
          first,
          second,
        ),
      ).toBe(true);
    });

    it('住所の表記揺れを吸収する', () => {
      const first =
        createEvent(
          'twipla',
          {
            locationText: '',
            address:
              '〒101-0021 東京都千代田区外神田1丁目1番1号',
          },
        );
      const second =
        createEvent(
          'official',
          {
            locationText: '',
            address:
              '千代田区外神田1-1-1',
          },
        );

      expect(
        areSameEventLocations(
          first,
          second,
        ),
      ).toBe(true);
    });

    it('同じ名前でも開催時間が違えば残す', () => {
      const morning =
        createEvent(
          'twipla',
          {
            startsAtText:
              '2026/07/05 10:00',
          },
        );
      const afternoon =
        createEvent(
          'official',
          {
            startsAtText:
              '2026/07/05 14:00',
          },
        );

      expect(
        deduplicateEvents([
          morning,
          afternoon,
        ]),
      ).toHaveLength(2);
    });

    it('同時刻でも午前の部と午後の部は別扱いにする', () => {
      const morning =
        createEvent(
          'twipla',
          {
            title:
              'G3大会 午前の部',
          },
        );
      const afternoon =
        createEvent(
          'official',
          {
            title:
              'G3大会 午後の部',
          },
        );

      expect(
        areDuplicateEvents(
          morning,
          afternoon,
        ),
      ).toBe(false);
    });

    it('同時刻でも①と②は別扱いにする', () => {
      const first =
        createEvent(
          'twipla',
          {
            title:
              'ベイブレード交流会①',
          },
        );
      const second =
        createEvent(
          'tonamel',
          {
            title:
              'ベイブレード交流会②',
          },
        );

      expect(
        areDuplicateEvents(
          first,
          second,
        ),
      ).toBe(false);
    });

    it('空白や全角記号だけの表記揺れは同じ名前として扱う', () => {
      const first =
        createEvent(
          'twipla',
          {
            title:
              '第1回 G3大会',
          },
        );
      const second =
        createEvent(
          'official',
          {
            title:
              '第１回・G3大会',
          },
        );

      expect(
        areDuplicateEvents(
          first,
          second,
        ),
      ).toBe(true);
    });

    it('時刻がない場合は自動で重複扱いにしない', () => {
      const first =
        createEvent(
          'twipla',
          {
            startsAtText:
              '2026/07/05',
          },
        );
      const second =
        createEvent(
          'official',
          {
            startsAtText:
              '2026/07/05',
          },
        );

      expect(
        areDuplicateEvents(
          first,
          second,
        ),
      ).toBe(false);
    });
  },
);

describe(
  'deduplication normalization',
  () => {
    it('①と②は正規化後も異なる', () => {
      expect(
        normalizeEventName(
          '交流会①',
        ),
      ).not.toBe(
        normalizeEventName(
          '交流会②',
        ),
      );
    });

    it('住所表記を比較しやすくする', () => {
      expect(
        normalizeEventLocation(
          '〒101-0021 東京都千代田区外神田1丁目1番1号',
        ),
      ).toBe(
        '東京都千代田区外神田111',
      );
    });

    it('開催日時を分単位で比較する', () => {
      expect(
        createEventDateTimeKey(
          '2026/7/5 9:05',
        ),
      ).toBe(
        '202607050905',
      );
    });
  },
);
