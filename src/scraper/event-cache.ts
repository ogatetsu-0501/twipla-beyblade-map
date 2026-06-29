import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  EVENT_CACHE_FILE_PATH,
  EVENT_CACHE_MAX_AGE_DAYS,
  EVENT_CACHE_REFRESH_WINDOW_DAYS,
  EVENT_CACHE_SCHEMA_VERSION,
} from './constants';
import type {
  EventCacheEntry,
  EventCacheFile,
  EventDetail,
  SearchEvent,
} from './types';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 一覧ページで確認できる項目から、変更検知用の文字列を作ります。
 */
export const createEventFingerprint = (
  event: SearchEvent,
): string =>
  [
    event.source,
    event.eventCategory,
    [...event.eventFilterTags].sort().join(','),
    event.eventTypeLabel,
    event.eventId,
    event.title,
    event.startsAtText,
    event.summaryLocation,
  ].join('\u001f');

/**
 * 開催日時の文字列から、開催日の先頭時刻を日本時間として読み取ります。
 */
const parseEventDate = (startsAtText: string): Date | null => {
  const match = startsAtText.match(
    /^(\d{4})\/(\d{2})\/(\d{2})/,
  );

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const utcMilliseconds = Date.UTC(
    year,
    month - 1,
    day,
    -9,
    0,
    0,
  );

  return new Date(utcMilliseconds);
};

/**
 * キャッシュ済みイベントを再取得する必要があるか判定します。
 */
export const shouldRefreshCachedEvent = (
  searchEvent: SearchEvent,
  cacheEntry: EventCacheEntry | undefined,
  now: Date,
): boolean => {
  if (!cacheEntry) {
    return true;
  }

  const fingerprint = createEventFingerprint(searchEvent);

  if (cacheEntry.fingerprint !== fingerprint) {
    return true;
  }

  const fetchedAt = new Date(cacheEntry.fetchedAt);

  if (Number.isNaN(fetchedAt.getTime())) {
    return true;
  }

  const ageDays =
    (now.getTime() - fetchedAt.getTime()) /
    MILLISECONDS_PER_DAY;

  if (ageDays >= EVENT_CACHE_MAX_AGE_DAYS) {
    return true;
  }

  const eventDate = parseEventDate(searchEvent.startsAtText);

  if (!eventDate) {
    return false;
  }

  const daysUntilEvent =
    (eventDate.getTime() - now.getTime()) /
    MILLISECONDS_PER_DAY;
  const isFinished = daysUntilEvent < -1;

  if (isFinished) {
    return false;
  }

  const isNearEvent =
    daysUntilEvent <= EVENT_CACHE_REFRESH_WINDOW_DAYS;

  return isNearEvent;
};

/**
 * キャッシュファイルを読み込みます。形式が古い場合は空として扱います。
 */
export const loadEventCache = async (): Promise<EventCacheFile> => {
  try {
    const text = await readFile(EVENT_CACHE_FILE_PATH, 'utf8');
    const cache = JSON.parse(text) as EventCacheFile;
    const isSupported =
      cache.schemaVersion === EVENT_CACHE_SCHEMA_VERSION &&
      !!cache.events;

    if (!isSupported) {
      return {
        schemaVersion: EVENT_CACHE_SCHEMA_VERSION,
        events: {},
      };
    }

    return cache;
  } catch {
    return {
      schemaVersion: EVENT_CACHE_SCHEMA_VERSION,
      events: {},
    };
  }
};

/**
 * 現在の検索結果だけを残してイベントキャッシュを保存します。
 */
export const saveEventCache = async (
  entries: EventCacheEntry[],
): Promise<void> => {
  const events = Object.fromEntries(
    entries.map((entry) => [
      entry.event.eventId,
      entry,
    ]),
  );
  const cache: EventCacheFile = {
    schemaVersion: EVENT_CACHE_SCHEMA_VERSION,
    events,
  };

  await mkdir(dirname(EVENT_CACHE_FILE_PATH), {
    recursive: true,
  });
  await writeFile(
    EVENT_CACHE_FILE_PATH,
    `${JSON.stringify(cache, null, 2)}\n`,
    'utf8',
  );
};

/**
 * キャッシュ済み詳細に、最新の一覧情報を上書きして返します。
 */
export const mergeCachedEvent = (
  cachedEvent: EventDetail,
  searchEvent: SearchEvent,
): EventDetail => ({
  ...cachedEvent,
  ...searchEvent,
});
