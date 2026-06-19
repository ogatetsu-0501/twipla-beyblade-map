import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  GEOCODE_CACHE_FILE_PATH,
  LOCATION_PRIVATE_WORDS,
} from './constants';
import type {
  EventDetail,
  GeocodeCache,
  GeocodeResult,
} from './types';
import { normalizeText, waitRandomDelay } from './utils';

/**
 * 前回までのジオコーディング結果をファイルから読み込みます。
 */
const loadCache = async (): Promise<GeocodeCache> => {
  try {
    const cacheText = await readFile(
      GEOCODE_CACHE_FILE_PATH,
      'utf8',
    );

    return JSON.parse(cacheText) as GeocodeCache;
  } catch {
    return {};
  }
};

/**
 * ジオコーディング結果を次回のActions実行で再利用できるよう保存します。
 */
const saveCache = async (cache: GeocodeCache): Promise<void> => {
  await mkdir(dirname(GEOCODE_CACHE_FILE_PATH), {
    recursive: true,
  });
  await writeFile(
    GEOCODE_CACHE_FILE_PATH,
    `${JSON.stringify(cache, null, 2)}\n`,
    'utf8',
  );
};

/**
 * Nominatimへ1件ずつ問い合わせ、住所または施設名を座標へ変換します。
 */
const requestCoordinates = async (
  query: string,
  userAgent: string,
): Promise<GeocodeResult | null> => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'jp');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ja',
      'User-Agent': userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(
      `住所検索に失敗しました: HTTP ${response.status} ${query}`,
    );
  }

  const results = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
  }>;
  const firstResult = results[0];
  const latitude = Number.parseFloat(firstResult?.lat ?? '');
  const longitude = Number.parseFloat(firstResult?.lon ?? '');
  const hasCoordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude);

  return hasCoordinates ? { latitude, longitude } : null;
};

/**
 * 座標がないイベントだけを低速でジオコーディングします。
 */
export const geocodeEvents = async (
  events: EventDetail[],
  userAgent: string,
): Promise<EventDetail[]> => {
  const cache = await loadCache();
  const resolvedEvents: EventDetail[] = [];

  for (const event of events) {
    const hasCoordinates =
      event.latitude !== null && event.longitude !== null;
    const normalizedLocation = `${event.locationText} ${event.address}`.toLowerCase();
    const isPrivateLocation = LOCATION_PRIVATE_WORDS.some((word) =>
      normalizedLocation.includes(word),
    );
    const canGeocode = !hasCoordinates && !isPrivateLocation;

    if (!canGeocode) {
      resolvedEvents.push(event);
      continue;
    }

    const query = normalizeText(event.address || event.locationText);
    const hasQuery = !!query;

    if (!hasQuery) {
      resolvedEvents.push(event);
      continue;
    }

    const hasCachedQuery = Object.prototype.hasOwnProperty.call(
      cache,
      query,
    );
    let result = hasCachedQuery ? cache[query] ?? null : null;

    if (!hasCachedQuery) {
      await waitRandomDelay(1200, 1800);

      try {
        result = await requestCoordinates(query, userAgent);
      } catch (error) {
        console.warn(
          `住所検索をスキップしました: ${query}`,
          error,
        );
        result = null;
      }

      cache[query] = result;
      await saveCache(cache);
    }

    if (!result) {
      resolvedEvents.push(event);
      continue;
    }

    resolvedEvents.push({
      ...event,
      latitude: result.latitude,
      longitude: result.longitude,
      locationStatus: 'exact',
      locationNote: '',
    });
  }

  return resolvedEvents;
};

/**
 * 初期表示用住所を座標へ変換し、失敗時は指定された代替座標を返します。
 */
export const geocodeDefaultCenter = async (
  address: string,
  userAgent: string,
  fallback: GeocodeResult,
): Promise<GeocodeResult> => {
  const cache = await loadCache();
  const hasCachedAddress = Object.prototype.hasOwnProperty.call(
    cache,
    address,
  );
  let result = hasCachedAddress ? cache[address] ?? null : null;

  if (!hasCachedAddress) {
    await waitRandomDelay(1200, 1800);

    try {
      result = await requestCoordinates(address, userAgent);
    } catch (error) {
      console.warn('初期表示住所の座標取得に失敗しました', error);
      result = null;
    }

    cache[address] = result;
    await saveCache(cache);
  }

  return result ?? fallback;
};
