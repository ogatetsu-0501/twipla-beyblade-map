import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  EVENT_FILTER_OPTIONS,
  WEEKDAY_OPTIONS,
  filterEvents,
  filterEventsByTags,
  parseEventDateInfo,
} from './filters';
import type {
  EventFilterState,
  EventWeekday,
} from './filters';
import type {
  EventData,
  EventFilterTag,
} from './types';

const createEvent = (
  id: string,
  eventFilterTags:
    EventFilterTag[],
  startsAtText =
    '2026/07/01 13:00',
): EventData => ({
  source: 'official',
  eventCategory: 'other',
  eventFilterTags,
  eventTypeLabel: 'テスト',
  eventId: id,
  eventUrl:
    `https://example.com/${id}`,
  title: id,
  startsAtText,
  summaryLocation: '東京都',
  address: '東京都千代田区',
  locationText: 'テスト会場',
  latitude: 35.68,
  longitude: 139.76,
  locationStatus: 'exact',
  locationNote: '',
});

const allTags = ():
  Set<EventFilterTag> =>
    new Set(
      EVENT_FILTER_OPTIONS.map(
        (option) => option.value,
      ),
    );

const allWeekdays = ():
  Set<EventWeekday> =>
    new Set(
      WEEKDAY_OPTIONS.map(
        (option) => option.value,
      ),
    );

const createState = (
  overrides:
    Partial<EventFilterState> = {},
): EventFilterState => ({
  selectedTags: allTags(),
  selectedWeekdays:
    allWeekdays(),
  dateFrom: '',
  dateTo: '',
  ...overrides,
});

describe('event type filters', () => {
  it('初期状態相当の全選択では全件表示する', () => {
    const events = [
      createEvent(
        'g3-open',
        ['ranked', 'open'],
      ),
      createEvent(
        'b4-regular',
        ['b4', 'regular'],
      ),
      createEvent(
        'other',
        ['other'],
      ),
    ];

    expect(
      filterEventsByTags(
        events,
        allTags(),
      ),
    ).toHaveLength(3);
  });

  it('オープンを外すとランクに関係なくオープン大会を除外する', () => {
    const selected = allTags();
    selected.delete('open');
    const events = [
      createEvent(
        'g3-open',
        ['ranked', 'open'],
      ),
      createEvent(
        'g3-regular',
        ['ranked', 'regular'],
      ),
    ];

    expect(
      filterEventsByTags(
        events,
        selected,
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual(['g3-regular']);
  });

  it('B4とG1・G2・G3・GPを別々に除外できる', () => {
    const events = [
      createEvent(
        'b4',
        ['b4', 'open'],
      ),
      createEvent(
        'g3',
        ['ranked', 'open'],
      ),
    ];
    const withoutRanked =
      allTags();
    withoutRanked.delete(
      'ranked',
    );

    expect(
      filterEventsByTags(
        events,
        withoutRanked,
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual(['b4']);

    const withoutB4 =
      allTags();
    withoutB4.delete('b4');

    expect(
      filterEventsByTags(
        events,
        withoutB4,
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual(['g3']);
  });
});

describe('event date parsing', () => {
  it('開催日と曜日を取得する', () => {
    expect(
      parseEventDateInfo(
        '2026/07/01 13:00',
      ),
    ).toEqual({
      dateKey: '2026-07-01',
      weekday: 3,
    });
  });

  it('不正な日付は解析しない', () => {
    expect(
      parseEventDateInfo(
        '2026/02/31 13:00',
      ),
    ).toBeNull();
  });
});

describe('date and weekday filters', () => {
  const events = [
    createEvent(
      'monday',
      ['other'],
      '2026/06/29 13:00',
    ),
    createEvent(
      'wednesday',
      ['other'],
      '2026/07/01 13:00',
    ),
    createEvent(
      'saturday',
      ['other'],
      '2026/07/04 13:00',
    ),
    createEvent(
      'sunday',
      ['other'],
      '2026/07/05 13:00',
    ),
  ];

  it('日付・曜日とも初期状態では全件表示する', () => {
    expect(
      filterEvents(
        events,
        createState(),
      ),
    ).toHaveLength(4);
  });

  it('開始日と終了日を両端含みで絞り込む', () => {
    expect(
      filterEvents(
        events,
        createState({
          dateFrom:
            '2026-07-01',
          dateTo:
            '2026-07-04',
        }),
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual([
      'wednesday',
      'saturday',
    ]);
  });

  it('開始日だけでも絞り込める', () => {
    expect(
      filterEvents(
        events,
        createState({
          dateFrom:
            '2026-07-04',
        }),
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual([
      'saturday',
      'sunday',
    ]);
  });

  it('曜日を外すと該当曜日を除外する', () => {
    const selectedWeekdays =
      allWeekdays();
    selectedWeekdays.delete(6);
    selectedWeekdays.delete(0);

    expect(
      filterEvents(
        events,
        createState({
          selectedWeekdays,
        }),
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual([
      'monday',
      'wednesday',
    ]);
  });

  it('大会種別・日付・曜日を同時に適用する', () => {
    const selectedTags =
      allTags();
    selectedTags.delete('open');

    expect(
      filterEvents(
        [
          createEvent(
            'regular-saturday',
            ['ranked', 'regular'],
            '2026/07/04 13:00',
          ),
          createEvent(
            'open-saturday',
            ['ranked', 'open'],
            '2026/07/04 14:00',
          ),
          createEvent(
            'regular-sunday',
            ['ranked', 'regular'],
            '2026/07/05 13:00',
          ),
        ],
        createState({
          selectedTags,
          selectedWeekdays:
            new Set([6]),
          dateFrom:
            '2026-07-04',
          dateTo:
            '2026-07-05',
        }),
      ).map(
        (event) =>
          event.eventId,
      ),
    ).toEqual([
      'regular-saturday',
    ]);
  });
});
