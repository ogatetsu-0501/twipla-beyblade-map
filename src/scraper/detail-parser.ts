import { load } from 'cheerio';

import {
  LOCATION_PRIVATE_WORDS,
  LOCATION_UNKNOWN_WORDS,
} from './constants';
import type {
  EventDetail,
  LocationStatus,
  SearchEvent,
} from './types';
import { normalizeText } from './utils';

type Coordinates = {
  latitude: number;
  longitude: number;
};

/**
 * URL内の緯度・経度候補を、有限数値であることを確認して返します。
 */
const createCoordinates = (
  latitudeText: string | undefined,
  longitudeText: string | undefined,
): Coordinates | null => {
  const latitude = Number.parseFloat(latitudeText ?? '');
  const longitude = Number.parseFloat(longitudeText ?? '');
  const hasCoordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude);

  return hasCoordinates ? { latitude, longitude } : null;
};

/**
 * Google Mapsの埋め込みURLからq=緯度,経度を取得します。
 */
const parseIframeCoordinates = (source: string): Coordinates | null => {
  try {
    const url = new URL(source);
    const coordinateText = url.searchParams.get('q') ?? '';
    const [latitudeText, longitudeText] = coordinateText.split(',');

    return createCoordinates(latitudeText, longitudeText);
  } catch {
    return null;
  }
};

/**
 * 道順リンクのdaddrから緯度・経度を取得します。
 */
const parseDirectionCoordinates = (href: string): Coordinates | null => {
  try {
    const url = new URL(href);
    const destination = url.searchParams.get('daddr') ?? '';
    const coordinateMatch = destination.match(
      /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    );

    return createCoordinates(coordinateMatch?.[1], coordinateMatch?.[2]);
  } catch {
    return null;
  }
};

/**
 * 詳細本文から「住所」ラベルの直後にある日本語住所を探します。
 */
const extractAddressFromDescription = (descriptionText: string): string => {
  const patterns = [
    /(?:■|●|【)?住所(?:】)?\s*[:：]?\s*([^\n]{5,100})/i,
    /(?:■|●|【)?開催場所(?:】)?\s*[:：]?\s*[^\n]*?\s((?:北海道|東京都|大阪府|京都府|.{2,3}県)[^\n]{3,100})/i,
    /((?:北海道|東京都|大阪府|京都府|.{2,3}県)[^\n]{5,100})/,
  ];

  for (const pattern of patterns) {
    const match = descriptionText.match(pattern);
    const address = normalizeText(match?.[1] ?? '');

    if (!!address) {
      return address;
    }
  }

  return '';
};

/**
 * 本文から開催場所ラベルの直後にある施設名や地域名を探します。
 */
const extractLocationFromDescription = (
  descriptionText: string,
): string => {
  const patterns = [
    /(?:■|●|【)?開催場所(?:】)?\s*[:：]?\s*([^\n]{2,100})/i,
    /(?:■|●|【)?場所(?:】)?\s*[:：]?\s*([^\n]{2,100})/i,
  ];

  for (const pattern of patterns) {
    const match = descriptionText.match(pattern);
    const locationText = normalizeText(match?.[1] ?? '');

    if (!!locationText) {
      return locationText;
    }
  }

  return '';
};

/**
 * 場所の文字列から、非公開・地域のみ・施設名などの状態を分類します。
 */
const classifyLocation = (
  locationText: string,
  address: string,
  coordinates: Coordinates | null,
): {
  status: LocationStatus;
  note: string;
} => {
  const normalizedLocation = `${locationText} ${address}`.toLowerCase();
  const hasPrivateWord = LOCATION_PRIVATE_WORDS.some((word) =>
    normalizedLocation.includes(word),
  );
  const hasUnknownWord = LOCATION_UNKNOWN_WORDS.some((word) =>
    normalizedLocation.includes(word),
  );

  if (hasPrivateWord) {
    return {
      status: 'private',
      note: '詳細な開催場所は主催者から案内されます',
    };
  }

  if (hasUnknownWord) {
    return {
      status: 'unknown',
      note: '開催場所が未確定です',
    };
  }

  if (!!coordinates || !!address) {
    return {
      status: 'exact',
      note: '',
    };
  }

  const hasAreaExpression =
    /駅近辺|駅周辺|市内|区内|周辺|近辺/.test(locationText);

  if (hasAreaExpression) {
    return {
      status: 'area',
      note: '大まかな地域のみ掲載されています',
    };
  }

  if (!!locationText) {
    return {
      status: 'venue',
      note: '施設名のみ掲載されています',
    };
  }

  return {
    status: 'unknown',
    note: '開催場所の情報がありません',
  };
};

/**
 * 詳細ページHTMLから住所・施設名・座標を抽出します。
 */
export const parseEventDetail = (
  html: string,
  searchEvent: SearchEvent,
): EventDetail => {
  const $ = load(html);

  const iframeSource =
    $('.event_view_map iframe[src*="maps"]').first().attr('src') ?? '';
  const iframeCoordinates = parseIframeCoordinates(iframeSource);

  const directionHref =
    $('.bluetext')
      .filter((_, element) => normalizeText($(element).text()) === '場所')
      .first()
      .next('.content_width')
      .find('a[href*="maps"]')
      .first()
      .attr('href') ?? '';
  const directionCoordinates = parseDirectionCoordinates(directionHref);
  const coordinates = iframeCoordinates ?? directionCoordinates;

  const locationSection = $('.bluetext')
    .filter((_, element) => normalizeText($(element).text()) === '場所')
    .first()
    .next('.content_width')
    .clone();
  locationSection.find('a').remove();
  const dedicatedLocation = normalizeText(locationSection.text());

  const calendarHref =
    $('a[href*="google.com/calendar/event"]').first().attr('href') ?? '';
  let calendarLocation = '';

  try {
    calendarLocation = normalizeText(
      new URL(calendarHref).searchParams.get('location') ?? '',
    );
  } catch {
    calendarLocation = '';
  }

  const descriptionText = $('#desc')
    .text()
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n');
  const descriptionAddress = extractAddressFromDescription(descriptionText);
  const descriptionLocation =
    extractLocationFromDescription(descriptionText);

  const address =
    dedicatedLocation.match(
      /(?:北海道|東京都|大阪府|京都府|.{2,3}県).+/,
    )?.[0] ??
    descriptionAddress ??
    '';
  const locationText =
    dedicatedLocation ||
    calendarLocation ||
    descriptionLocation ||
    searchEvent.summaryLocation;
  const classification = classifyLocation(
    locationText,
    address,
    coordinates,
  );

  return {
    ...searchEvent,
    address: normalizeText(address),
    locationText: normalizeText(locationText),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    locationStatus: classification.status,
    locationNote: classification.note,
  };
};
