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
const OFFICIAL_EVENT_API_URL =
  `${OFFICIAL_ORIGIN}/beyblade-x/shop_event/event_manage/public/api/open_all_event`;

type OfficialApiEvent = {
  id: number;
  event_type_id: number;
  event_type_other: string | null;
  detail_link_url: string | null;
  state: number;
  start_date: string;
  shop_name: string;
  address1: string;
  address2: string;
  event_type_name: string;
  event_type_open_name: string;
  name: string;
  place_name: string;
  place_address1: string;
  place_address2: string;
  place_address: string;
};

type OfficialApiResponse = {
  state?: string;
  events?: OfficialApiEvent[];
};

const formatOfficialUtcDateInJapan = (
  value: string,
): string => {
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
  ...values: string[]
): string =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .join('');

const createOfficialEventTitle = (
  event: OfficialApiEvent,
): string =>
  event.name.trim() ||
  [
    event.event_type_open_name.trim(),
    event.shop_name.trim(),
  ]
    .filter(Boolean)
    .join('｜') ||
  'ベイブレードX公式イベント';

export const convertOfficialEvents = (
  apiEvents: OfficialApiEvent[],
  searchStartDate: string,
): EventDetail[] => {
  const events: EventDetail[] = [];

  for (const apiEvent of apiEvents) {
    if (apiEvent.state !== 4) {
      continue;
    }

    const startsAtText =
      formatOfficialUtcDateInJapan(
        apiEvent.start_date,
      );

    if (
      !startsAtText ||
      startsAtText.slice(0, 10).replaceAll('/', '-') <
        searchStartDate
    ) {
      continue;
    }

    const eventTypeLabel =
      apiEvent.event_type_open_name.trim() ||
      apiEvent.event_type_name.trim() ||
      apiEvent.event_type_other?.trim() ||
      'その他';
    const title =
      createOfficialEventTitle(apiEvent);
    const locationText =
      apiEvent.place_name.trim() ||
      apiEvent.shop_name.trim();
    const address =
      apiEvent.place_address.trim() ||
      normalizeAddress(
        apiEvent.place_address1,
        apiEvent.place_address2,
      ) ||
      normalizeAddress(
        apiEvent.address1,
        apiEvent.address2,
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
      eventId: `official:${apiEvent.id}`,
      eventUrl:
        apiEvent.detail_link_url?.trim() ||
        OFFICIAL_EVENT_LIST_URL,
      title,
      startsAtText,
      summaryLocation:
        apiEvent.place_address1.trim() ||
        apiEvent.address1.trim(),
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
