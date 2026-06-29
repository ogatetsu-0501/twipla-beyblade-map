import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  areDuplicateEvents,
  deduplicateEvents,
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
  eventFilterTags: ['ranked', 'open'],
  eventTypeLabel:
    'G3大会（オープン/6歳以上）',
  eventId: `${source}:1`,
  eventUrl: `https://example.com/${source}`,
  title:
    '秋葉原ベイブレードX G3大会',
  startsAtText:
    '2026/07/05 13:00',
  summaryLocation: '東京都千代田区',
  address:
    '東京都千代田区外神田1-1-1',
  locationText:
    '秋葉原イベントホール',
  latitude: null,
  longitude: null,
  locationStatus: 'unknown',
  locationNote: '',
  ...overrides,
});

describe('cross-source event deduplication', () => {
  it('同日同会場のイベントはTwiPlaを優先する', () => {
    const twipla = createEvent(
      'twipla',
      {
        eventId: 'twipla:1',
      },
    );
    const tonamel = createEvent(
      'tonamel',
      {
        eventId: 'tonamel:1',
        title:
          '秋葉原 G3 ベイブレード大会',
        startsAtText:
          '2026/07/05 13:30',
      },
    );
    const official = createEvent(
      'official',
      {
        eventId: 'official:1',
        title: 'G3大会',
      },
    );

    const result = deduplicateEvents([
      official,
      tonamel,
      twipla,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe(
      'twipla',
    );
  });

  it('同じ会場でも大会種別が異なれば残す', () => {
    const g3 = createEvent('twipla');
    const experience = createEvent(
      'official',
      {
        eventCategory: 'experience',
        eventFilterTags: ['experience'],
        eventTypeLabel: '体験会',
        title: 'ベイブレード体験会',
      },
    );

    expect(
      areDuplicateEvents(
        g3,
        experience,
      ),
    ).toBe(false);
  });

  it('レギュラーとオープンを誤って統合しない', () => {
    const regular = createEvent(
      'twipla',
      {
        eventTypeLabel:
          'G3大会（レギュラー/6～12歳限定）',
        title:
          'G3 レギュラー大会',
      },
    );
    const open = createEvent(
      'official',
      {
        eventTypeLabel:
          'G3大会（オープン/6歳以上）',
        title:
          'G3 オープン大会',
      },
    );

    expect(
      areDuplicateEvents(
        regular,
        open,
      ),
    ).toBe(false);
  });
});
