import {
  classifyEventCategory,
  classifyEventFilterTags,
} from './event-type';
import type {
  EventDetail,
} from './types';

const OFFICIAL_ORIGIN =
  'https://beyblade.takaratomy.co.jp';
const OFFICIAL_EVENT_LIST_URL =
  `${OFFICIAL_ORIGIN}/beyblade-x/shop_event/manage/open_list_all.html`;
const OFFICIAL_EVENT_DETAIL_URL =
  `${OFFICIAL_ORIGIN}/beyblade-x/shop_event/manage/open_detail_all.html`;
const OFFICIAL_EVENT_API_URL =
  `${OFFICIAL_ORIGIN}/beyblade-x/shop_event/event_manage/public/api/open_all_event`;

type NullableText =
  | string
  | null
  | undefined;

type OfficialApiEvent = {
  id: number | string | null;
  event_type_id: number | null;
  event_type_other: NullableText;
  detail_link_url: NullableText;
  state: number | string | null;
  start_date: NullableText;
  shop_name: NullableText;
  address1: NullableText;
  address2: NullableText;
  event_type_name: NullableText;
  event_type_open_name: NullableText;
  name: NullableText;
  place_name: NullableText;
  place_address1: NullableText;
  place_address2: NullableText;
  place_address: NullableText;
};

type OfficialApiResponse = {
  state?: string;
  events?: Array<
    OfficialApiEvent | null
  >;
};

const normalizeNullableText = (
  value: unknown,
): string =>
  typeof value === 'string'
    ? value.trim()
    : '';

const normalizeIdentifier = (
  value: unknown,
): string => {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(value).trim();
  }

  return '';
};

const formatOfficialUtcDateInJapan = (
  rawValue: unknown,
): string => {
  const value =
    normalizeNullableText(rawValue);
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  );

  if (
    !match?.[1] ||
    !match[2] ||
    !match[3] ||
    !match[4] ||
    !match[5]
  ) {
    return '';
  }

  const date = new Date(Date.UTC(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
    Number.parseInt(match[4], 10),
    Number.parseInt(match[5], 10),
  ));

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ]),
  );

  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
};

const normalizeAddress = (
  ...values: unknown[]
): string =>
  values
    .map(normalizeNullableText)
    .filter(Boolean)
    .join('');

const createOfficialEventTitle = (
  event: OfficialApiEvent,
): string =>
  normalizeNullableText(event.name) ||
  [
    normalizeNullableText(
      event.event_type_open_name,
    ),
    normalizeNullableText(
      event.shop_name,
    ),
  ]
    .filter(Boolean)
    .join('｜') ||
  'ベイブレードX公式イベント';

const isPublishedOfficialEvent = (
  value: unknown,
): boolean =>
  String(value ?? '') === '4';

export const convertOfficialEvents = (
  apiEvents: Array<
    OfficialApiEvent | null
  >,
  searchStartDate: string,
): EventDetail[] => {
  const events: EventDetail[] = [];

  for (const apiEvent of apiEvents) {
    if (
      !apiEvent ||
      !isPublishedOfficialEvent(
        apiEvent.state,
      )
    ) {
      continue;
    }

    const officialEventId =
      normalizeIdentifier(
        apiEvent.id,
      );

    if (!officialEventId) {
      continue;
    }

    const startsAtText =
      formatOfficialUtcDateInJapan(
        apiEvent.start_date,
      );

    if (
      !startsAtText ||
      startsAtText
        .slice(0, 10)
        .replaceAll('/', '-') <
        searchStartDate
    ) {
      continue;
    }

    const eventTypeLabel =
      normalizeNullableText(
        apiEvent.event_type_open_name,
      ) ||
      normalizeNullableText(
        apiEvent.event_type_name,
      ) ||
      normalizeNullableText(
        apiEvent.event_type_other,
      ) ||
      'その他';
    const title =
      createOfficialEventTitle(
        apiEvent,
      );
    const locationText =
      normalizeNullableText(
        apiEvent.place_name,
      ) ||
      normalizeNullableText(
        apiEvent.shop_name,
      );
    const address =
      normalizeNullableText(
        apiEvent.place_address,
      ) ||
      normalizeAddress(
        apiEvent.place_address1,
        apiEvent.place_address2,
      ) ||
      normalizeAddress(
        apiEvent.address1,
        apiEvent.address2,
      );
    const detailPageUrl =
      new URL(
        OFFICIAL_EVENT_DETAIL_URL,
      );
    detailPageUrl.searchParams.set(
      'id',
      officialEventId,
    );

    events.push({
      source: 'official',
      eventCategory:
        classifyEventCategory(
          eventTypeLabel,
          title,
        ),
      eventFilterTags:
        classifyEventFilterTags(
          eventTypeLabel,
          title,
        ),
      eventTypeLabel,
      eventId:
        `official:${officialEventId}`,
      eventUrl:
        detailPageUrl.toString(),
      title,
      startsAtText,
      summaryLocation:
        normalizeNullableText(
          apiEvent.place_address1,
        ) ||
        normalizeNullableText(
          apiEvent.address1,
        ),
      address,
      locationText,
      latitude: null,
      longitude: null,
      locationStatus: 'unknown',
      locationNote:
        'ベイブレードX公式イベント一覧から取得しました',
    });
  }

  return events;
};

/**
 * ベイブレードX公式サイトの公開イベント一覧を取得します。
 * Cookieやログイン情報は使用しません。
 */
export const fetchOfficialEvents = async (
  searchStartDate: string,
  userAgent: string,
): Promise<EventDetail[]> => {
  const url = new URL(
    OFFICIAL_EVENT_API_URL,
  );
  const now = String(Date.now());

  url.searchParams.set('t', now);

  for (let type = 0; type <= 8; type += 1) {
    url.searchParams.append(
      'types[]',
      String(type),
    );
  }

  url.searchParams.set('_', now);

  const response = await fetch(url, {
    headers: {
      Accept:
        'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'ja',
      Referer: OFFICIAL_EVENT_LIST_URL,
      'User-Agent': userAgent,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    throw new Error(
      `公式イベントAPIの取得に失敗しました: HTTP ${response.status}`,
    );
  }

  const result =
    (await response.json()) as OfficialApiResponse;

  if (
    result.state !== 'success' ||
    !Array.isArray(result.events)
  ) {
    throw new Error(
      '公式イベントAPIのレスポンス形式が不正です',
    );
  }

  return convertOfficialEvents(
    result.events,
    searchStartDate,
  );
};
