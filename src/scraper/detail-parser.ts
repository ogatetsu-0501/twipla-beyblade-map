import { load, type CheerioAPI } from 'cheerio';

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

const ADDRESS_PATTERN =
  /(?:〒\s*\d{3}-?\d{4}\s*)?(?:北海道|東京都|大阪府|京都府|.{2,3}県)[^\n]{3,100}/;

const LABEL_PATTERN =
  /(?:■|●|◆|【)?(?:開催場所|会場|場所|住所|駐車場|参加費|定員|募集人数|開催日時|日時|日付|時間|注意|その他)(?:】)?\s*[:：]?/g;

const LOCATION_LABELS = ['開催場所', '会場', '場所'];
const ADDRESS_LABELS = ['住所'];

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
 * 本文HTMLのブロック境界を改行へ変換し、ラベル単位で解析できる行配列を作ります。
 */
const createDescriptionLines = ($: CheerioAPI): string[] => {
  const description = $('#desc').clone();

  description.find('br').replaceWith('\n');
  description
    .find('div, p, li, section, article, h1, h2, h3, h4, h5, h6')
    .each((_, element) => {
      $(element).prepend('\n').append('\n');
    });

  const text = description
    .text()
    .replace(/\r/g, '')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(LABEL_PATTERN, (label) => `\n${label}`)
    .replace(/\n{2,}/g, '\n');

  return text
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
};

/**
 * 同じ行に後続項目が連結している場合、次のラベルより前だけを値として残します。
 */
const trimFollowingLabel = (value: string): string => {
  const match = value.match(
    /^(.*?)(?=(?:■|●|◆|【)?(?:住所|駐車場|参加費|定員|募集人数|開催日時|日時|日付|時間|注意|その他)(?:】)?\s*[:：]?|$)/,
  );

  return normalizeText(match?.[1] ?? value);
};

/**
 * 指定したラベルの行、または直後の行から値を取り出します。
 */
const extractLabeledValue = (
  lines: string[],
  labels: string[],
): string => {
  for (const [index, line] of lines.entries()) {
    for (const label of labels) {
      const pattern = new RegExp(
        `^(?:■|●|◆|【)?${label}(?:】)?\\s*[:：]?\\s*(.*)$`,
        'i',
      );
      const match = line.match(pattern);

      if (!match) {
        continue;
      }

      const inlineValue = trimFollowingLabel(match[1] ?? '');

      if (inlineValue) {
        return inlineValue;
      }

      const nextLine = lines[index + 1] ?? '';
      const nextLineIsLabel = LABEL_PATTERN.test(nextLine);
      LABEL_PATTERN.lastIndex = 0;

      if (nextLine && !nextLineIsLabel) {
        return trimFollowingLabel(nextLine);
      }
    }
  }

  return '';
};

/**
 * 本文から日本の住所らしい文字列を探します。
 */
const extractAddressFromDescription = (lines: string[]): string => {
  const labeledAddress = extractLabeledValue(lines, ADDRESS_LABELS);
  const labeledMatch = labeledAddress.match(ADDRESS_PATTERN);

  if (labeledMatch?.[0]) {
    return normalizeText(labeledMatch[0]);
  }

  for (const line of lines) {
    const addressMatch = line.match(ADDRESS_PATTERN);

    if (addressMatch?.[0]) {
      return normalizeText(addressMatch[0]);
    }
  }

  return '';
};

/**
 * 専用の場所欄から、リンク文言を除いた表示行を取得します。
 */
const extractDedicatedLocationLines = ($: CheerioAPI): string[] => {
  const locationSection = $('.bluetext')
    .filter((_, element) => normalizeText($(element).text()) === '場所')
    .first()
    .next('.content_width')
    .clone();

  locationSection.find('a').remove();
  locationSection.find('br').replaceWith('\n');

  return locationSection
    .text()
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
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

  if (coordinates || address) {
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

  if (locationText) {
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

  const dedicatedLocationLines = extractDedicatedLocationLines($);
  const dedicatedAddress = dedicatedLocationLines
    .map((line) => line.match(ADDRESS_PATTERN)?.[0] ?? '')
    .find(Boolean) ?? '';
  const dedicatedVenue = dedicatedLocationLines
    .find((line) => !ADDRESS_PATTERN.test(line)) ?? '';

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

  const descriptionLines = createDescriptionLines($);
  const descriptionAddress =
    extractAddressFromDescription(descriptionLines);
  const descriptionLocation = extractLabeledValue(
    descriptionLines,
    LOCATION_LABELS,
  );

  const address = normalizeText(
    dedicatedAddress || descriptionAddress,
  );
  const locationText = normalizeText(
    dedicatedVenue ||
      calendarLocation ||
      descriptionLocation ||
      searchEvent.summaryLocation ||
      address,
  );
  const classification = classifyLocation(
    locationText,
    address,
    coordinates,
  );

  return {
    ...searchEvent,
    address,
    locationText,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    locationStatus: classification.status,
    locationNote: classification.note,
  };
};
