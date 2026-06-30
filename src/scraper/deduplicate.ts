import type {
  EventDetail,
  EventSource,
} from './types';

const SOURCE_PRIORITY: Record<
  EventSource,
  number
> = {
  twipla: 3,
  tonamel: 2,
  official: 1,
};

/**
 * 掲載元ごとの表記揺れだけを吸収します。
 *
 * 午前/午後、第1部/第2部、①/②などの区別に使われる文字は
 * 削除しないため、同時刻でも別イベントとして残ります。
 */
export const normalizeEventName = (
  value: string,
): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(
      /[\s　・･,，、。．.（）()［\][\]【】「」『』"'`!?！？:：;；/_\\\-]+/gu,
      '',
    );

/**
 * 会場名・住所の比較用に表記を揃えます。
 */
export const normalizeEventLocation = (
  value: string,
): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(
      /〒\s*\d{3}-?\d{4}/gu,
      '',
    )
    .replace(
      /(?:丁目|番地|番|号)/gu,
      '',
    )
    .replace(
      /[\s　・･,，、。．.（）()［\][\]【】「」『』"'`!?！？:：;；/_\\\-]+/gu,
      '',
    );

/**
 * 開催日時を分単位の比較キーへ変換します。
 * 時刻がないイベントは安全のため重複判定しません。
 */
export const createEventDateTimeKey = (
  value: string,
): string => {
  const match = value.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+|T)(\d{1,2}):(\d{2})/,
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

  const year = Number.parseInt(
    match[1],
    10,
  );
  const month = Number.parseInt(
    match[2],
    10,
  );
  const day = Number.parseInt(
    match[3],
    10,
  );
  const hour = Number.parseInt(
    match[4],
    10,
  );
  const minute = Number.parseInt(
    match[5],
    10,
  );
  const isValid =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31 &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59;

  if (!isValid) {
    return '';
  }

  return [
    String(year).padStart(
      4,
      '0',
    ),
    String(month).padStart(
      2,
      '0',
    ),
    String(day).padStart(
      2,
      '0',
    ),
    String(hour).padStart(
      2,
      '0',
    ),
    String(minute).padStart(
      2,
      '0',
    ),
  ].join('');
};

const createLocationCandidates = (
  event: EventDetail,
): string[] =>
  [
    event.locationText,
    event.address,
    event.summaryLocation,
  ]
    .map(normalizeEventLocation)
    .filter(
      (value) =>
        value.length >= 4,
    );

/**
 * 会場名・住所のいずれかが同じ、または片方がもう片方を含む場合に
 * 同じ開催場所として扱います。
 */
export const areSameEventLocations = (
  eventA: EventDetail,
  eventB: EventDetail,
): boolean => {
  const candidatesA =
    createLocationCandidates(
      eventA,
    );
  const candidatesB =
    createLocationCandidates(
      eventB,
    );

  return candidatesA.some(
    (candidateA) =>
      candidatesB.some(
        (candidateB) =>
          candidateA ===
            candidateB ||
          candidateA.includes(
            candidateB,
          ) ||
          candidateB.includes(
            candidateA,
          ),
      ),
  );
};

/**
 * 異なる掲載元で、イベント名・開催日時・開催場所が同じ場合だけ
 * 重複とします。
 */
export const areDuplicateEvents = (
  eventA: EventDetail,
  eventB: EventDetail,
): boolean => {
  if (
    eventA.source ===
    eventB.source
  ) {
    return false;
  }

  const nameA =
    normalizeEventName(
      eventA.title,
    );
  const nameB =
    normalizeEventName(
      eventB.title,
    );
  const dateTimeA =
    createEventDateTimeKey(
      eventA.startsAtText,
    );
  const dateTimeB =
    createEventDateTimeKey(
      eventB.startsAtText,
    );

  return (
    !!nameA &&
    nameA === nameB &&
    !!dateTimeA &&
    dateTimeA === dateTimeB &&
    areSameEventLocations(
      eventA,
      eventB,
    )
  );
};

const mergeEventFilterTags = (
  preferred: EventDetail,
  secondary: EventDetail,
): EventDetail['eventFilterTags'] => {
  const specificTags = new Set(
    [
      ...preferred.eventFilterTags,
      ...secondary.eventFilterTags,
    ].filter(
      (tag) =>
        tag !== 'other',
    ),
  );

  return specificTags.size > 0
    ? [...specificTags]
    : ['other'];
};

/**
 * 表示する掲載元・タイトル・URLは優先順位の高いイベントを維持し、
 * 欠けている場所情報などだけ下位掲載元から補完します。
 */
const mergeMissingDetails = (
  preferred: EventDetail,
  secondary: EventDetail,
): EventDetail => ({
  ...preferred,
  eventFilterTags:
    mergeEventFilterTags(
      preferred,
      secondary,
    ),
  eventCategory:
    preferred.eventCategory ===
    'other'
      ? secondary.eventCategory
      : preferred.eventCategory,
  eventTypeLabel:
    preferred.eventTypeLabel ===
    'その他'
      ? secondary.eventTypeLabel
      : preferred.eventTypeLabel,
  summaryLocation:
    preferred.summaryLocation ||
    secondary.summaryLocation,
  address:
    preferred.address ||
    secondary.address,
  locationText:
    preferred.locationText ||
    secondary.locationText,
});

/**
 * 同一イベントが複数掲載元にある場合は、
 * TwiPla > Tonamel > 公式サイトの順に1件だけ残します。
 */
export const deduplicateEvents = (
  events: EventDetail[],
): EventDetail[] => {
  const sortedEvents = [
    ...events,
  ].sort(
    (eventA, eventB) =>
      SOURCE_PRIORITY[
        eventB.source
      ] -
        SOURCE_PRIORITY[
          eventA.source
        ] ||
      eventA.startsAtText
        .localeCompare(
          eventB.startsAtText,
          'ja',
        ),
  );
  const selectedEvents:
    EventDetail[] = [];

  for (
    const event
      of sortedEvents
  ) {
    const duplicateIndex =
      selectedEvents.findIndex(
        (selectedEvent) =>
          areDuplicateEvents(
            selectedEvent,
            event,
          ),
      );

    if (
      duplicateIndex < 0
    ) {
      selectedEvents.push(
        event,
      );
      continue;
    }

    const preferred =
      selectedEvents[
        duplicateIndex
      ];

    if (!preferred) {
      continue;
    }

    selectedEvents[
      duplicateIndex
    ] =
      mergeMissingDetails(
        preferred,
        event,
      );
  }

  return selectedEvents.sort(
    (eventA, eventB) =>
      eventA.startsAtText
        .localeCompare(
          eventB.startsAtText,
          'ja',
        ),
  );
};
