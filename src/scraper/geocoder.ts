import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  GEOCODE_CACHE_FILE_PATH,
  LOCATION_PRIVATE_WORDS,
} from './constants';
import { findLocationOverride } from './location-overrides';
import type {
  EventDetail,
  GeocodeCache,
  GeocodeResult,
} from './types';
import { normalizeText, waitRandomDelay } from './utils';

const CACHE_KEY_VERSION = 'v5';

type GeocodePrecision = 'exact' | 'area';

type GeocodeCandidate = {
  query: string;
  precision: GeocodePrecision;
};

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
 * 国土地理院の住所検索から座標を取得します。
 */
const requestGsiCoordinates = async (
  query: string,
  userAgent: string,
): Promise<GeocodeResult | null> => {
  const url = new URL(
    'https://msearch.gsi.go.jp/address-search/AddressSearch',
  );
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
      `地理院住所検索に失敗しました: HTTP ${response.status} ${query}`,
    );
  }

  const features = (await response.json()) as Array<{
    geometry?: {
      coordinates?: [number, number];
    };
  }>;
  const coordinates = features[0]?.geometry?.coordinates;
  const longitude = coordinates?.[0] ?? Number.NaN;
  const latitude = coordinates?.[1] ?? Number.NaN;
  const hasCoordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude);

  return hasCoordinates ? { latitude, longitude } : null;
};

/**
 * OpenStreetMapのNominatimから座標を取得します。
 */
const requestNominatimCoordinates = async (
  query: string,
  userAgent: string,
): Promise<GeocodeResult | null> => {
  const url = new URL(
    'https://nominatim.openstreetmap.org/search',
  );
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '3');
  url.searchParams.set('countrycodes', 'jp');
  url.searchParams.set('addressdetails', '1');
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
      `Nominatim検索に失敗しました: HTTP ${response.status} ${query}`,
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
 * 注釈やURLを除去し、住所検索へ渡しやすい文字列へ整えます。
 */
const cleanGeocodeText = (value: string): string =>
  normalizeText(value.normalize('NFKC'))
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/〒\s*\d{3}-?\d{4}/g, '')
    .replace(/[（(][^（）()]*[）)]/gu, ' ')
    .replace(/(?:※|⚠️?).*$/u, '')
    .replace(/(?:■|●|◆)(?:住所|駐車場|参加費|定員|注意).*$/u, '')
    .replace(/[「」『』【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);

const APPROXIMATE_LOCATION_WORD_PATTERN =
  /(?:付近|近辺|周辺|周り|近く)/gu;

const hasApproximateLocationWord = (
  value: string,
): boolean =>
  /(?:付近|近辺|周辺|周り|近く)/u.test(
    cleanGeocodeText(value),
  );

const cleanVenueSearchText = (
  value: string,
): string =>
  cleanGeocodeText(value)
    .replace(APPROXIMATE_LOCATION_WORD_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 部屋名や階数を外した施設名候補を作ります。
 */
const VENUE_DETAIL_SUFFIX_PATTERN =
  /\s+(?:(?:第)?(?:\d+|[一二三四五六七八九十百]+))?(?:階|F|会議室|研修室|展示室|多目的室|和室|洋室|実習室|講義室|視聴覚室|集会室|セミナールーム|マルチルーム|セレスホール|大ホール|小ホール|ホール|ルーム).*$/iu;

const simplifyVenue = (value: string): string =>
  cleanVenueSearchText(value)
    .replace(VENUE_DETAIL_SUFFIX_PATTERN, '')
    .trim();

/**
 * 住所や本文の場所文字列から都道府県・市区町村を抽出します。
 */
const extractAdministrativeAreas = (
  values: string[],
): string[] => {
  const areas: string[] = [];

  for (const rawValue of values) {
    const value = cleanGeocodeText(rawValue);
    const prefectureMatches = value.match(
      /(?:北海道|東京都|大阪府|京都府|[^\s,、]{2,3}県)(?:[^\s,、0-9]{1,18}?(?:市|区|町|村))?/gu,
    ) ?? [];
    const municipalityMatches = value.match(
      /[^\s,、0-9]{2,18}?(?:市|区|町|村)/gu,
    ) ?? [];

    areas.push(...prefectureMatches, ...municipalityMatches);
  }

  return [...new Set(
    areas
      .map(cleanGeocodeText)
      .filter((value) => value.length >= 2),
  )];
};

/**
 * 地域名だけの文字列かを判定します。
 */
const isAreaOnlyText = (value: string): boolean =>
  /(?:都|道|府|県|市|区|町|村)$/.test(
    cleanGeocodeText(value),
  );

/**
 * 住所、施設名、一覧の地域情報から検索候補を優先順に作ります。
 */
export const createGeocodeCandidates = (
  event: Pick<
    EventDetail,
    'address' | 'locationText' | 'summaryLocation'
  >,
): GeocodeCandidate[] => {
  const address = cleanGeocodeText(event.address);
  const rawVenue = cleanVenueSearchText(event.locationText);
  const simpleVenue = simplifyVenue(event.locationText);
  const venue = simpleVenue || rawVenue;
  const summary = cleanGeocodeText(event.summaryLocation);
  const venueIsApproximate =
    hasApproximateLocationWord(event.locationText);
  const venuePrecision: GeocodePrecision =
    venueIsApproximate ? 'area' : 'exact';
  const exactCandidates: GeocodeCandidate[] = [
    { query: address, precision: 'exact' },
    {
      query:
        venue && address ? `${venue} ${address}` : '',
      precision: 'exact',
    },
    {
      query:
        venue && summary && venue !== summary
          ? `${venue} ${summary}`
          : '',
      precision: venuePrecision,
    },
    {
      query: venue,
      precision:
        venueIsApproximate || isAreaOnlyText(venue)
          ? 'area'
          : 'exact',
    },
    {
      query: summary,
      precision: isAreaOnlyText(summary)
        ? 'area'
        : 'exact',
    },
  ];
  const areaCandidates = extractAdministrativeAreas([
    address,
    venue,
    summary,
  ]).map((query) => ({
    query,
    precision: 'area' as const,
  }));
  const candidates = [...exactCandidates, ...areaCandidates]
    .filter((candidate) => !!candidate.query);
  const uniqueCandidates = new Map<string, GeocodeCandidate>();

  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.query)) {
      uniqueCandidates.set(candidate.query, candidate);
    }
  }

  return [...uniqueCandidates.values()];
};

/**
 * テストや確認用に検索文字列だけを返します。
 */
export const createGeocodeQueries = (
  event: Pick<
    EventDetail,
    'address' | 'locationText' | 'summaryLocation'
  >,
): string[] =>
  createGeocodeCandidates(event).map(
    (candidate) => candidate.query,
  );

/**
 * 1つの候補を国土地理院、Nominatimの順に検索します。
 */
const geocodeCandidate = async (
  candidate: GeocodeCandidate,
  userAgent: string,
  cache: GeocodeCache,
): Promise<GeocodeResult | null> => {
  const cacheKey = `${CACHE_KEY_VERSION}:${candidate.query}`;
  const hasCachedQuery = Object.prototype.hasOwnProperty.call(
    cache,
    cacheKey,
  );

  if (hasCachedQuery) {
    return cache[cacheKey] ?? null;
  }

  let result: GeocodeResult | null = null;

  await waitRandomDelay(1100, 1600);

  try {
    result = await requestGsiCoordinates(
      candidate.query,
      userAgent,
    );
  } catch (error) {
    console.warn(
      `地理院住所検索をスキップしました: ${candidate.query}`,
      error,
    );
  }

  if (!result) {
    await waitRandomDelay(1100, 1600);

    try {
      result = await requestNominatimCoordinates(
        candidate.query,
        userAgent,
      );
    } catch (error) {
      console.warn(
        `Nominatim検索をスキップしました: ${candidate.query}`,
        error,
      );
    }
  }

  cache[cacheKey] = result;
  await saveCache(cache);

  return result;
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
    const locationOverride =
      findLocationOverride(event);

    if (locationOverride) {
      resolvedEvents.push({
        ...event,
        ...locationOverride,
      });
      console.log(
        `固定座標を適用しました: ${event.locationText}`,
      );
      continue;
    }

    const hasCoordinates =
      event.latitude !== null && event.longitude !== null;
    const normalizedLocation =
      `${event.locationText} ${event.address}`.toLowerCase();
    const isPrivateLocation = LOCATION_PRIVATE_WORDS.some(
      (word) => normalizedLocation.includes(word),
    );
    const isApproximateLocation =
      hasApproximateLocationWord(event.locationText);
    const publicVenueSearchText =
      cleanVenueSearchText(event.locationText);
    const hasPublicApproximateVenue =
      isApproximateLocation &&
      publicVenueSearchText.length >= 2;
    const canGeocode =
      !hasCoordinates &&
      (!isPrivateLocation || hasPublicApproximateVenue);

    if (!canGeocode) {
      resolvedEvents.push(event);
      continue;
    }

    const candidates = createGeocodeCandidates(event);
    let matchedCandidate: GeocodeCandidate | null = null;
    let result: GeocodeResult | null = null;

    for (const candidate of candidates) {
      result = await geocodeCandidate(
        candidate,
        userAgent,
        cache,
      );

      if (result) {
        matchedCandidate = candidate;
        console.log(
          `座標を補完しました (${candidate.precision}): ${candidate.query}`,
        );
        break;
      }
    }

    if (!result || !matchedCandidate) {
      resolvedEvents.push(event);
      continue;
    }

    const isRepresentativePoint =
      matchedCandidate.precision === 'area';

    resolvedEvents.push({
      ...event,
      latitude: result.latitude,
      longitude: result.longitude,
      locationStatus: isRepresentativePoint
        ? 'area'
        : 'exact',
      locationNote: isRepresentativePoint
        ? isApproximateLocation
          ? '「付近・近辺・周辺」などを除いた施設名や駅名の代表地点を表示しています'
          : '施設の正確な座標を取得できなかったため、地域の代表地点を表示しています'
        : '',
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
  const candidate: GeocodeCandidate = {
    query: cleanGeocodeText(address),
    precision: 'exact',
  };
  const result = await geocodeCandidate(
    candidate,
    userAgent,
    cache,
  );

  return result ?? fallback;
};
