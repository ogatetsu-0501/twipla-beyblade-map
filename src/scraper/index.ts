import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  DEFAULT_FALLBACK_CENTER,
  DEFAULT_FOCUS_ADDRESS,
  DEFAULT_SEARCH_LIMIT,
  OUTPUT_FILE_PATH,
  SEARCH_KEYWORD,
  SEARCH_TARGET,
  TWIPLA_ORIGIN,
} from './constants';
import { parseEventDetail } from './detail-parser';
import {
  geocodeDefaultCenter,
  geocodeEvents,
} from './geocoder';
import { SlowHttpClient } from './http';
import { parseSearchResults } from './search-parser';
import type { EventDetail, PublishedPayload } from './types';
import { readPositiveInteger } from './utils';
import { q } from '../shared/pack';

/**
 * TwiPlaのGET形式検索URLを組み立てます。
 */
const createSearchUrl = (
  page: number,
  limit: number,
  date: string,
): string => {
  const keyword = encodeURIComponent(SEARCH_KEYWORD);

  return `${TWIPLA_ORIGIN}/events/search/page~${page}/limit~${limit}/keyword~${keyword}/target~${SEARCH_TARGET}/date~${date}`;
};

/**
 * 日本時間の年月日を検索URL用のYYYY-MM-DDへ整形します。
 */
const createJapanDate = (): string => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
};

/**
 * 検索結果に100件を超える候補がある場合も、次ページが空になるまで取得します。
 */
const fetchAllSearchEvents = async (
  client: SlowHttpClient,
  limit: number,
): Promise<ReturnType<typeof parseSearchResults>> => {
  const searchDate = createJapanDate();
  const allEvents: ReturnType<typeof parseSearchResults> = [];
  const seenEventIds = new Set<string>();

  for (let page = 1; ; page += 1) {
    const url = createSearchUrl(page, limit, searchDate);
    console.log(`検索結果を取得します: ${url}`);

    const html = await client.getText(url);
    const pageEvents = parseSearchResults(html);

    for (const event of pageEvents) {
      const isNewEvent = !seenEventIds.has(event.eventId);

      if (isNewEvent) {
        seenEventIds.add(event.eventId);
        allEvents.push(event);
      }
    }

    const hasNextPage = pageEvents.length >= limit;

    if (!hasNextPage) {
      break;
    }
  }

  return allEvents;
};

/**
 * 検索候補の詳細ページを1件ずつ取得して、場所情報を抽出します。
 */
const fetchAllDetails = async (
  client: SlowHttpClient,
  searchEvents: Awaited<ReturnType<typeof fetchAllSearchEvents>>,
): Promise<EventDetail[]> => {
  const details: EventDetail[] = [];

  for (const [index, searchEvent] of searchEvents.entries()) {
    console.log(
      `詳細を取得します (${index + 1}/${searchEvents.length}): ${searchEvent.eventUrl}`,
    );

    try {
      const html = await client.getText(searchEvent.eventUrl);
      details.push(parseEventDetail(html, searchEvent));
    } catch (error) {
      console.warn(
        `詳細取得に失敗したため、地図対象外として残します: ${searchEvent.eventUrl}`,
        error,
      );
      details.push({
        ...searchEvent,
        address: '',
        locationText: searchEvent.summaryLocation,
        latitude: null,
        longitude: null,
        locationStatus: 'unknown',
        locationNote: '詳細ページの取得に失敗しました',
      });
    }
  }

  return details;
};

/**
 * スクレイピング、場所補完、公開用ファイル生成を順番に実行します。
 */
const main = async (): Promise<void> => {
  const userAgent =
    process.env.SCRAPER_USER_AGENT ??
    'beyblade-event-map/1.0 (contact: repository-owner)';
  const minimumDelayMilliseconds = readPositiveInteger(
    process.env.REQUEST_DELAY_MIN_MS,
    8000,
  );
  const maximumDelayMilliseconds = readPositiveInteger(
    process.env.REQUEST_DELAY_MAX_MS,
    15000,
  );
  const searchLimit = readPositiveInteger(
    process.env.SEARCH_LIMIT,
    DEFAULT_SEARCH_LIMIT,
  );

  const client = new SlowHttpClient({
    userAgent,
    minimumDelayMilliseconds,
    maximumDelayMilliseconds,
  });

  const searchEvents = await fetchAllSearchEvents(client, searchLimit);
  console.log(`${searchEvents.length}件の候補を取得しました`);

  const rawDetails = await fetchAllDetails(client, searchEvents);
  const events = await geocodeEvents(rawDetails, userAgent);
  const defaultCenter = await geocodeDefaultCenter(
    DEFAULT_FOCUS_ADDRESS,
    userAgent,
    DEFAULT_FALLBACK_CENTER,
  );

  const payload: PublishedPayload = {
    updatedAt: new Date().toISOString(),
    defaultCenter,
    events,
  };
  const output = await q(payload);

  await mkdir(dirname(OUTPUT_FILE_PATH), {
    recursive: true,
  });
  await writeFile(OUTPUT_FILE_PATH, output, 'utf8');

  console.log(`公開用データを生成しました: ${OUTPUT_FILE_PATH}`);
};

await main();
