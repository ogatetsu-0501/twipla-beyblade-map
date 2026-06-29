import { describe, expect, it } from 'vitest';

import {
  createEventFingerprint,
  mergeCachedEvent,
  shouldRefreshCachedEvent,
} from '../event-cache';
import type {
  EventCacheEntry,
  EventDetail,
  SearchEvent,
} from '../types';

const baseSearchEvent: SearchEvent = {
  source: 'twipla',
  eventId: '728922',
  eventUrl: 'https://twipla.jp/events/728922',
  title: 'ベイブレード交流会',
  startsAtText: '2026/08/20 13:00',
  summaryLocation: '愛知県稲沢市',
};

const baseDetail: EventDetail = {
  ...baseSearchEvent,
  address: '愛知県稲沢市祖父江町',
  locationText: '祖父江町体育館',
  latitude: 35.2,
  longitude: 136.7,
  locationStatus: 'exact',
  locationNote: '',
};

const createEntry = (
  event: SearchEvent,
  fetchedAt: string,
): EventCacheEntry => ({
  fingerprint: createEventFingerprint(event),
  fetchedAt,
  detailSocialLinks: [],
  organizerTwiplaUserId: '',
  isExcluded: false,
  event: {
    ...baseDetail,
    ...event,
  },
});

describe('event cache', () => {
  it('変更がなく開催日が遠いイベントは詳細取得を省略する', () => {
    const now = new Date('2026-06-19T00:00:00.000Z');
    const entry = createEntry(
      baseSearchEvent,
      '2026-06-18T00:00:00.000Z',
    );

    expect(
      shouldRefreshCachedEvent(baseSearchEvent, entry, now),
    ).toBe(false);
  });

  it('一覧情報が変わったイベントは再取得する', () => {
    const now = new Date('2026-06-19T00:00:00.000Z');
    const entry = createEntry(
      baseSearchEvent,
      '2026-06-18T00:00:00.000Z',
    );
    const changedEvent = {
      ...baseSearchEvent,
      summaryLocation: '会場変更',
    };

    expect(
      shouldRefreshCachedEvent(changedEvent, entry, now),
    ).toBe(true);
  });

  it('開催14日以内のイベントは再取得する', () => {
    const now = new Date('2026-06-19T00:00:00.000Z');
    const nearEvent = {
      ...baseSearchEvent,
      startsAtText: '2026/06/25 13:00',
    };
    const entry = createEntry(
      nearEvent,
      '2026-06-18T00:00:00.000Z',
    );

    expect(
      shouldRefreshCachedEvent(nearEvent, entry, now),
    ).toBe(true);
  });

  it('28日以上前のキャッシュは再取得する', () => {
    const now = new Date('2026-06-19T00:00:00.000Z');
    const entry = createEntry(
      baseSearchEvent,
      '2026-05-01T00:00:00.000Z',
    );

    expect(
      shouldRefreshCachedEvent(baseSearchEvent, entry, now),
    ).toBe(true);
  });

  it('キャッシュ詳細へ最新の一覧情報を反映する', () => {
    const changedSearch = {
      ...baseSearchEvent,
      title: '更新後タイトル',
    };

    const merged = mergeCachedEvent(
      baseDetail,
      changedSearch,
    );

    expect(merged.title).toBe('更新後タイトル');
    expect(merged.address).toBe(baseDetail.address);
  });
});
