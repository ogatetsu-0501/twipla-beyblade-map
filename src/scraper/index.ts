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
  extractDetailSocialLinks,
  extractOrganizerTwiplaUserId,
  isExcludedByDetailSocialLinks,
  isExcludedByOrganizerTwiplaUserId,
} from './exclusions';
import {
  createEventFingerprint,
  loadEventCache,
  mergeCachedEvent,
  saveEventCache,
  shouldRefreshCachedEvent,
} from './event-cache';
import {
  geocodeDefaultCenter,
  geocodeEvents,
} from './geocoder';
import { SlowHttpClient } from './http';
import { parseSearchResults } from './search-parser';
import type {
  EventCacheEntry,
  EventDetail,
  PublishedPayload,
  SearchEvent,
} from './types';
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
): Promise<SearchEvent[]> => {
  const searchDate = createJapanDate();
  const allEvents: SearchEvent[] = [];
  const seenEventIds = new Set<string>();

  for (let page = 1; ; page += 1) {
    const url = createSearchUrl(page, limit, searchDate);
    console.log(`検索結果を取得します: ${url}`);

    const html = await client.getText(url);
    const pageEvents = parseSearchResults(html);

    for (const event of pageEvents) {
      const isNewEvent =
        !seenEventIds.has(event.eventId);

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

type ResolvedDetail = {
  event: EventDetail;
  fetchedAt: string;
  detailSocialLinks: string[];
  organizerTwiplaUserId: string;
  isExcluded: boolean;
};

/**
 * 新規、一覧情報変更、期限切れ、開催直前のイベントだけ詳細を再取得します。
 * 詳細本文のSNSリンクが除外設定に一致したイベントは公開対象に含めません。
 */
const resolveAllDetails = async (
  client: SlowHttpClient,
  searchEvents: SearchEvent[],
): Promise<ResolvedDetail[]> => {
  const cache = await loadEventCache();
  const resolvedDetails: ResolvedDetail[] = [];
  const now = new Date();
  let fetchedCount = 0;
  let skippedCount = 0;
  let excludedCount = 0;

  for (
    const [index, searchEvent]
      of searchEvents.entries()
  ) {
    const cacheEntry =
      cache.events[searchEvent.eventId];
    const shouldRefresh =
      shouldRefreshCachedEvent(
        searchEvent,
        cacheEntry,
        now,
      );

    if (!shouldRefresh && cacheEntry) {
      const organizerExcluded =
        isExcludedByOrganizerTwiplaUserId(
          cacheEntry.organizerTwiplaUserId,
        );
      const socialLinkExcluded =
        isExcludedByDetailSocialLinks(
          cacheEntry.detailSocialLinks,
        );
      const isExcluded =
        cacheEntry.isExcluded ||
        organizerExcluded ||
        socialLinkExcluded;

      resolvedDetails.push({
        event: mergeCachedEvent(
          cacheEntry.event,
          searchEvent,
        ),
        fetchedAt: cacheEntry.fetchedAt,
        detailSocialLinks:
          cacheEntry.detailSocialLinks,
        organizerTwiplaUserId:
          cacheEntry.organizerTwiplaUserId,
        isExcluded,
      });
      skippedCount += 1;

      if (isExcluded) {
        excludedCount += 1;
        console.log(
          `キャッシュ済みの除外イベントをスキップします: ${searchEvent.eventUrl} organizer=${cacheEntry.organizerTwiplaUserId}`,
        );
      } else {
        console.log(
          `詳細取得をスキップします (${index + 1}/${searchEvents.length}): ${searchEvent.eventUrl}`,
        );
      }

      continue;
    }

    console.log(
      `詳細を取得します (${index + 1}/${searchEvents.length}): ${searchEvent.eventUrl}`,
    );

    try {
      const html = await client.getText(
        searchEvent.eventUrl,
      );
      const detailSocialLinks =
        extractDetailSocialLinks(html);
      const organizerTwiplaUserId =
        extractOrganizerTwiplaUserId(html);
      const organizerExcluded =
        isExcludedByOrganizerTwiplaUserId(
          organizerTwiplaUserId,
        );
      const socialLinkExcluded =
        isExcludedByDetailSocialLinks(
          detailSocialLinks,
        );
      const isExcluded =
        organizerExcluded ||
        socialLinkExcluded;

      resolvedDetails.push({
        event: parseEventDetail(
          html,
          searchEvent,
        ),
        fetchedAt: new Date().toISOString(),
        detailSocialLinks,
        organizerTwiplaUserId,
        isExcluded,
      });
      fetchedCount += 1;

      if (isExcluded) {
        excludedCount += 1;
        console.log(
          `主催者または詳細SNSの除外設定により非表示にします: ${searchEvent.eventUrl} organizer=${organizerTwiplaUserId} links=${detailSocialLinks.join(',')}`,
        );
      }
    } catch (error) {
      console.warn(
        `詳細取得に失敗したため、キャッシュまたは地図対象外情報を利用します: ${searchEvent.eventUrl}`,
        error,
      );

      if (cacheEntry) {
        const isExcluded =
          cacheEntry.isExcluded ||
          isExcludedByOrganizerTwiplaUserId(
            cacheEntry.organizerTwiplaUserId,
          ) ||
          isExcludedByDetailSocialLinks(
            cacheEntry.detailSocialLinks,
          );

        resolvedDetails.push({
          event: mergeCachedEvent(
            cacheEntry.event,
            searchEvent,
          ),
          fetchedAt: cacheEntry.fetchedAt,
          detailSocialLinks:
            cacheEntry.detailSocialLinks,
          organizerTwiplaUserId:
            cacheEntry.organizerTwiplaUserId,
          isExcluded,
        });

        if (isExcluded) {
          excludedCount += 1;
        }
      } else {
        resolvedDetails.push({
          event: {
            ...searchEvent,
            address: '',
            locationText:
              searchEvent.summaryLocation,
            latitude: null,
            longitude: null,
            locationStatus: 'unknown',
            locationNote:
              '詳細ページの取得に失敗しました',
          },
          fetchedAt:
            new Date().toISOString(),
          detailSocialLinks: [],
          organizerTwiplaUserId: '',
          isExcluded: false,
        });
      }
    }
  }

  console.log(
    `詳細取得: ${fetchedCount}件、キャッシュ利用: ${skippedCount}件、除外: ${excludedCount}件`,
  );

  return resolvedDetails;
};
/**
 * 最新イベントだけをイベントキャッシュへ保存します。
 */
const persistEventCache = async (
  resolvedDetails: ResolvedDetail[],
): Promise<void> => {
  const entries: EventCacheEntry[] =
    resolvedDetails.map((resolved) => ({
      fingerprint: createEventFingerprint(
        resolved.event,
      ),
      fetchedAt: resolved.fetchedAt,
      detailSocialLinks:
        resolved.detailSocialLinks,
      organizerTwiplaUserId:
        resolved.organizerTwiplaUserId,
      isExcluded: resolved.isExcluded,
      event: resolved.event,
    }));

  await saveEventCache(entries);
};

/**
 * スクレイピング、場所補完、キャッシュ更新、公開用ファイル生成を順番に実行します。
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

  const searchEvents = await fetchAllSearchEvents(
    client,
    searchLimit,
  );
  console.log(`${searchEvents.length}件の候補を取得しました`);

  const resolvedDetails = await resolveAllDetails(
    client,
    searchEvents,
  );
  const publishableResolvedDetails =
    resolvedDetails.filter(
      (resolved) => !resolved.isExcluded,
    );
  const rawEvents =
    publishableResolvedDetails.map(
      (resolved) => resolved.event,
    );
  const events = await geocodeEvents(
    rawEvents,
    userAgent,
  );
  const eventsById = new Map(
    events.map((event) => [
      event.eventId,
      event,
    ]),
  );
  const geocodedResolvedDetails =
    resolvedDetails.map((resolved) => ({
      ...resolved,
      event: resolved.isExcluded
        ? resolved.event
        : eventsById.get(
            resolved.event.eventId,
          ) ?? resolved.event,
    }));

  await persistEventCache(
    geocodedResolvedDetails,
  );

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
