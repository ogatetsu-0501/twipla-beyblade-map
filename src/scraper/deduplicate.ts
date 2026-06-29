import type {
  EventCategory,
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

const normalizeMatchText = (
  value: string,
): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/〒\s*\d{3}-?\d{4}/gu, '')
    .replace(
      /(?:ベイブレードx?|beyblade\s*x?|公認|公式|イベント|大会|交流会|開催|参加者用)/giu,
      '',
    )
    .replace(
      /[\s　・･,，、。．.（）()［\][\]【】「」『』\-ー_\/\\]/gu,
      '',
    );

const createBigrams = (
  value: string,
): Set<string> => {
  const normalized =
    normalizeMatchText(value);
  const grams = new Set<string>();

  if (normalized.length <= 1) {
    if (normalized) {
      grams.add(normalized);
    }

    return grams;
  }

  for (
    let index = 0;
    index < normalized.length - 1;
    index += 1
  ) {
    grams.add(
      normalized.slice(index, index + 2),
    );
  }

  return grams;
};

const calculateTextSimilarity = (
  valueA: string,
  valueB: string,
): number => {
  const normalizedA =
    normalizeMatchText(valueA);
  const normalizedB =
    normalizeMatchText(valueB);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (
    normalizedA.includes(normalizedB) ||
    normalizedB.includes(normalizedA)
  ) {
    return Math.min(
      normalizedA.length,
      normalizedB.length,
    ) /
      Math.max(
        normalizedA.length,
        normalizedB.length,
      );
  }

  const gramsA = createBigrams(valueA);
  const gramsB = createBigrams(valueB);
  const intersection = [
    ...gramsA,
  ].filter((gram) => gramsB.has(gram))
    .length;
  const union = new Set([
    ...gramsA,
    ...gramsB,
  ]).size;

  return union > 0
    ? intersection / union
    : 0;
};

const parseEventDateTime = (
  value: string,
): {
  date: string;
  minutes: number | null;
} => {
  const match = value.match(
    /^(\d{4}\/\d{2}\/\d{2})(?:\s+(\d{2}):(\d{2}))?/,
  );

  if (!match?.[1]) {
    return {
      date: value.slice(0, 10),
      minutes: null,
    };
  }

  const hours = match[2]
    ? Number.parseInt(match[2], 10)
    : null;
  const minutes = match[3]
    ? Number.parseInt(match[3], 10)
    : null;

  return {
    date: match[1],
    minutes:
      hours !== null && minutes !== null
        ? hours * 60 + minutes
        : null,
  };
};

const hasStrongTextMatch = (
  valueA: string,
  valueB: string,
  minimumLength: number,
): boolean => {
  const normalizedA =
    normalizeMatchText(valueA);
  const normalizedB =
    normalizeMatchText(valueB);

  if (
    normalizedA.length < minimumLength ||
    normalizedB.length < minimumLength
  ) {
    return false;
  }

  return (
    normalizedA === normalizedB ||
    normalizedA.includes(normalizedB) ||
    normalizedB.includes(normalizedA)
  );
};

type EventFormat = {
  age: 'regular' | 'open' | null;
  team: 'team' | 'tag' | null;
};

const extractEventFormat = (
  event: EventDetail,
): EventFormat => {
  const text = [
    event.title,
    event.eventTypeLabel,
  ]
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP');

  return {
    age: /レギュラー|6\s*[～〜~-]\s*12歳/u.test(
      text,
    )
      ? 'regular'
      : /オープン|6歳以上/u.test(text)
        ? 'open'
        : null,
    team: /チーム戦/u.test(text)
      ? 'team'
      : /タッグ戦/u.test(text)
        ? 'tag'
        : null,
  };
};

const hasConflictingFormat = (
  eventA: EventDetail,
  eventB: EventDetail,
): boolean => {
  const formatA = extractEventFormat(eventA);
  const formatB = extractEventFormat(eventB);

  return (
    !!formatA.age &&
    !!formatB.age &&
    formatA.age !== formatB.age
  ) || (
    !!formatA.team &&
    !!formatB.team &&
    formatA.team !== formatB.team
  );
};

const categoriesAreCompatible = (
  categoryA: EventCategory,
  categoryB: EventCategory,
): boolean =>
  categoryA === categoryB ||
  categoryA === 'other' ||
  categoryB === 'other';

export const areDuplicateEvents = (
  eventA: EventDetail,
  eventB: EventDetail,
): boolean => {
  if (eventA.source === eventB.source) {
    return false;
  }

  const dateTimeA =
    parseEventDateTime(
      eventA.startsAtText,
    );
  const dateTimeB =
    parseEventDateTime(
      eventB.startsAtText,
    );

  if (
    dateTimeA.date !== dateTimeB.date ||
    !categoriesAreCompatible(
      eventA.eventCategory,
      eventB.eventCategory,
    ) ||
    hasConflictingFormat(
      eventA,
      eventB,
    )
  ) {
    return false;
  }

  const timeDifference =
    dateTimeA.minutes !== null &&
    dateTimeB.minutes !== null
      ? Math.abs(
          dateTimeA.minutes -
          dateTimeB.minutes,
        )
      : null;

  if (
    timeDifference !== null &&
    timeDifference > 180
  ) {
    return false;
  }

  const addressMatch =
    hasStrongTextMatch(
      eventA.address ||
        eventA.summaryLocation,
      eventB.address ||
        eventB.summaryLocation,
      7,
    );
  const venueMatch =
    hasStrongTextMatch(
      eventA.locationText,
      eventB.locationText,
      4,
    );
  const titleSimilarity =
    calculateTextSimilarity(
      eventA.title,
      eventB.title,
    );

  if (
    addressMatch &&
    (
      timeDifference === null ||
      timeDifference <= 120
    )
  ) {
    return true;
  }

  if (
    venueMatch &&
    (
      timeDifference === null ||
      timeDifference <= 120
    ) &&
    titleSimilarity >= 0.15
  ) {
    return true;
  }

  return (
    titleSimilarity >= 0.72 &&
    (addressMatch || venueMatch)
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
    ].filter((tag) => tag !== 'other'),
  );

  return specificTags.size > 0
    ? [...specificTags]
    : ['other'];
};

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
    preferred.eventCategory === 'other'
      ? secondary.eventCategory
      : preferred.eventCategory,
  eventTypeLabel:
    preferred.eventTypeLabel === 'その他'
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

export const deduplicateEvents = (
  events: EventDetail[],
): EventDetail[] => {
  const sortedEvents = [...events].sort(
    (eventA, eventB) =>
      SOURCE_PRIORITY[eventB.source] -
        SOURCE_PRIORITY[eventA.source] ||
      eventA.startsAtText.localeCompare(
        eventB.startsAtText,
        'ja',
      ),
  );
  const selectedEvents: EventDetail[] = [];

  for (const event of sortedEvents) {
    const duplicateIndex =
      selectedEvents.findIndex(
        (selectedEvent) =>
          areDuplicateEvents(
            selectedEvent,
            event,
          ),
      );

    if (duplicateIndex < 0) {
      selectedEvents.push(event);
      continue;
    }

    const preferred =
      selectedEvents[duplicateIndex];

    if (!preferred) {
      continue;
    }

    selectedEvents[duplicateIndex] =
      mergeMissingDetails(
        preferred,
        event,
      );
  }

  return selectedEvents.sort(
    (eventA, eventB) =>
      eventA.startsAtText.localeCompare(
        eventB.startsAtText,
        'ja',
      ),
  );
};
