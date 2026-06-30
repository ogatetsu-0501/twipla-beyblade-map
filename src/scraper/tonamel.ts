import {
  randomUUID,
} from 'node:crypto';

import {
  formatUnixSecondsInJapan,
  japanDateToUnixSeconds,
} from './date-utils';
import {
  classifyEventCategory,
  classifyEventFilterTags,
  createInferredEventTypeLabel,
} from './event-type';
import type { EventDetail } from './types';

const TONAMEL_GRAPHQL_URL =
  'https://tonamel.com/graphql/competition_management';
const TONAMEL_ORIGIN = 'https://tonamel.com';
const TONAMEL_PAGE_SIZE = 32;
const TONAMEL_CSRF_ENDPOINTS = [
  `${TONAMEL_ORIGIN}/csrf_token`,
  `${TONAMEL_ORIGIN}/api/csrf_token`,
  `${TONAMEL_ORIGIN}/api/v1/csrf_token`,
];

const PUBLIC_COMPETITIONS_QUERY = `
query getPublicCompetitions($condition: PublicCompetitionsCondition!, $filter: PublicCompetitionsFilter!) {
  publicCompetitions(condition: $condition, filter: $filter) {
    edges {
      cursor
      node {
        id
        title
        game { id }
        status
        publicStatus
        region
        tournaments {
          id
          displayStartAt
          isOnline
          location {
            venueName
            address { input }
          }
        }
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}`;

type TonamelTournament = {
  id: string;
  displayStartAt: string;
  isOnline: boolean;
  location: {
    venueName: string;
    address: { input: string } | null;
  } | null;
};

type TonamelCompetition = {
  id: string;
  title: string;
  game: { id: string } | null;
  status: string;
  publicStatus: string;
  region: string;
  tournaments: TonamelTournament[];
};

type TonamelGraphqlResponse = {
  data?: {
    publicCompetitions?: {
      edges?: Array<{
        cursor: string;
        node: TonamelCompetition;
      }>;
      pageInfo?: {
        endCursor?: string | null;
        hasNextPage?: boolean;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type TonamelSession = {
  cookieHeader: string;
  csrfToken: string;
  pageViewId: string;
  referer: string;
};

const normalizeKeyText = (value: string): string =>
  value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const createTournamentKey = (
  competitionId: string,
  tournament: TonamelTournament,
): string =>
  [
    competitionId,
    tournament.displayStartAt,
    normalizeKeyText(tournament.location?.venueName ?? ''),
    normalizeKeyText(
      tournament.location?.address?.input ?? '',
    ),
  ].join('\u001f');

export const convertTonamelCompetitions = (
  competitions: TonamelCompetition[],
): EventDetail[] => {
  const events: EventDetail[] = [];
  const seenTournamentKeys = new Set<string>();

  for (const competition of competitions) {
    if (
      competition.game?.id !== 'beyblade_x' ||
      competition.publicStatus !== 'PUBLIC' ||
      competition.region !== 'JP'
    ) {
      continue;
    }

    for (const tournament of competition.tournaments) {
      if (
        tournament.isOnline ||
        !tournament.displayStartAt
      ) {
        continue;
      }

      const key = createTournamentKey(
        competition.id,
        tournament,
      );

      if (seenTournamentKeys.has(key)) {
        continue;
      }

      seenTournamentKeys.add(key);

      const locationText =
        tournament.location?.venueName?.trim() ?? '';
      const address =
        tournament.location?.address?.input?.trim() ?? '';
      const startsAtText = formatUnixSecondsInJapan(
        tournament.displayStartAt,
      );

      if (!startsAtText) {
        continue;
      }

      events.push({
        source: 'tonamel',
        eventCategory:
          classifyEventCategory(competition.title),
        eventFilterTags:
          classifyEventFilterTags(
            competition.title,
          ),
        eventTypeLabel:
          createInferredEventTypeLabel(
            competition.title,
          ),
        eventId: `tonamel:${competition.id}:${tournament.id}`,
        eventUrl: `${TONAMEL_ORIGIN}/competition/${competition.id}`,
        title: competition.title,
        startsAtText,
        summaryLocation: address,
        address,
        locationText,
        latitude: null,
        longitude: null,
        locationStatus: 'unknown',
        locationNote: 'Tonamelから取得しました',
      });
    }
  }

  return events;
};

const splitCombinedSetCookie = (
  value: string,
): string[] =>
  value.split(
    /,(?=\s*[^;,=\s]+=[^;,]*)/u,
  );

const readSetCookieHeaders = (
  headers: Headers,
): string[] => {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const nativeValues =
    extendedHeaders.getSetCookie?.() ?? [];

  if (nativeValues.length > 0) {
    return nativeValues;
  }

  const combined = headers.get('set-cookie');

  return combined
    ? splitCombinedSetCookie(combined)
    : [];
};

const updateCookieJar = (
  cookieJar: Map<string, string>,
  response: Response,
): void => {
  for (
    const setCookie
      of readSetCookieHeaders(
        response.headers,
      )
  ) {
    const pair =
      setCookie.split(';', 1)[0]?.trim() ?? '';
    const separatorIndex =
      pair.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const name = pair
      .slice(0, separatorIndex)
      .trim();
    const value = pair
      .slice(separatorIndex + 1)
      .trim();

    if (name && value) {
      cookieJar.set(name, value);
    }
  }
};

const createCookieHeader = (
  cookieJar: Map<string, string>,
): string =>
  [...cookieJar.entries()]
    .map(
      ([name, value]) =>
        `${name}=${value}`,
    )
    .join('; ');

const findCsrfTokenInValue = (
  value: unknown,
): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (
    !value ||
    typeof value !== 'object'
  ) {
    return '';
  }

  for (
    const [key, nestedValue]
      of Object.entries(value)
  ) {
    if (
      /csrf/i.test(key) &&
      typeof nestedValue === 'string'
    ) {
      return nestedValue.trim();
    }
  }

  for (
    const nestedValue
      of Object.values(value)
  ) {
    const token =
      findCsrfTokenInValue(
        nestedValue,
      );

    if (token) {
      return token;
    }
  }

  return '';
};

const extractCsrfToken = (
  text: string,
): string => {
  const trimmed = text.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const json = JSON.parse(trimmed) as unknown;
    const token =
      findCsrfTokenInValue(json);

    if (token) {
      return token;
    }
  } catch {
    // JSON以外の応答も後続の正規表現で確認します。
  }

  const metaMatch = trimmed.match(
    /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/iu,
  );
  const propertyMatch = trimmed.match(
    /csrf[_-]?token["']?\s*[:=]\s*["']([^"']+)["']/iu,
  );

  if (metaMatch?.[1]) {
    return metaMatch[1].trim();
  }

  if (propertyMatch?.[1]) {
    return propertyMatch[1].trim();
  }

  if (
    !/[<>\s]/u.test(trimmed) &&
    trimmed.length >= 16 &&
    trimmed.length <= 512
  ) {
    return trimmed.replace(
      /^['"]|['"]$/gu,
      '',
    );
  }

  return '';
};

const createReferer = (
  startAfter: string,
): string =>
  `${TONAMEL_ORIGIN}/competitions?game=beyblade_x&region=JP&date=${startAfter}`;

const createTonamelSession = async (
  startAfter: string,
  userAgent: string,
): Promise<TonamelSession> => {
  const referer =
    createReferer(startAfter);
  const configuredCookie =
    process.env.TONAMEL_COOKIE?.trim() ?? '';
  const configuredCsrfToken =
    process.env.TONAMEL_CSRF_TOKEN?.trim() ?? '';

  if (
    configuredCookie &&
    configuredCsrfToken
  ) {
    return {
      cookieHeader: configuredCookie,
      csrfToken: configuredCsrfToken,
      pageViewId: randomUUID(),
      referer,
    };
  }

  const cookieJar =
    new Map<string, string>();
  let csrfToken = '';

  const pageResponse = await fetch(
    referer,
    {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja',
        'User-Agent': userAgent,
      },
      redirect: 'follow',
    },
  );

  updateCookieJar(
    cookieJar,
    pageResponse,
  );

  if (pageResponse.ok) {
    csrfToken = extractCsrfToken(
      await pageResponse.text(),
    );
  } else {
    await pageResponse.body?.cancel();
  }

  for (
    const csrfEndpoint
      of TONAMEL_CSRF_ENDPOINTS
  ) {
    if (csrfToken) {
      break;
    }

    const cookieHeader =
      createCookieHeader(cookieJar);
    const csrfResponse = await fetch(
      csrfEndpoint,
      {
        headers: {
          Accept:
            'application/json, text/plain, */*',
          'Accept-Language': 'ja',
          Referer: referer,
          'User-Agent': userAgent,
          ...(cookieHeader
            ? { Cookie: cookieHeader }
            : {}),
        },
        redirect: 'follow',
      },
    );

    updateCookieJar(
      cookieJar,
      csrfResponse,
    );

    if (!csrfResponse.ok) {
      await csrfResponse.body?.cancel();
      continue;
    }

    csrfToken = extractCsrfToken(
      await csrfResponse.text(),
    );
  }

  const cookieHeader =
    createCookieHeader(cookieJar);

  if (!csrfToken || !cookieHeader) {
    throw new Error(
      'Tonamelの公開セッションまたはCSRFトークンを取得できませんでした',
    );
  }

  return {
    cookieHeader,
    csrfToken,
    pageViewId: randomUUID(),
    referer,
  };
};

const requestPage = async (
  startAfter: string,
  after: string,
  userAgent: string,
  session: TonamelSession,
): Promise<TonamelGraphqlResponse> => {
  const response = await fetch(TONAMEL_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'ja',
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: TONAMEL_ORIGIN,
      Referer: session.referer,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': userAgent,
      'X-CSRF-Token': session.csrfToken,
      'X-Page-View-Id': session.pageViewId,
      'X-Page-View-Location': session.referer,
    },
    body: JSON.stringify({
      operationName: 'getPublicCompetitions',
      variables: {
        condition: {
          gameId: 'beyblade_x',
          startAfter,
          statuses: [],
          region: 'JP',
          regionPrefectureIds: [],
        },
        filter: {
          first: TONAMEL_PAGE_SIZE,
          last: 0,
          before: '',
          after,
        },
      },
      query: PUBLIC_COMPETITIONS_QUERY,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Tonamel GraphQLの取得に失敗しました: HTTP ${response.status}`,
    );
  }

  const result =
    (await response.json()) as TonamelGraphqlResponse;

  if (result.errors?.length) {
    const messages = result.errors
      .map((error) => error.message ?? '不明なエラー')
      .join(', ');
    throw new Error(`Tonamel GraphQLエラー: ${messages}`);
  }

  return result;
};

/**
 * 指定日以降の公開BEYBLADE Xイベントを全ページ取得します。
 * まず公開ページとcsrf_tokenエンドポイントから一時セッションを取得し、
 * CookieやCSRFトークンを保存せず、その実行中だけ使用します。
 */
export const fetchTonamelEvents = async (
  searchStartDate: string,
  userAgent: string,
): Promise<EventDetail[]> => {
  const startAfter = japanDateToUnixSeconds(
    searchStartDate,
  );
  const session =
    await createTonamelSession(
      startAfter,
      userAgent,
    );
  const competitions: TonamelCompetition[] = [];
  let after = '';

  for (;;) {
    const result = await requestPage(
      startAfter,
      after,
      userAgent,
      session,
    );
    const connection =
      result.data?.publicCompetitions;
    const edges = connection?.edges ?? [];

    competitions.push(
      ...edges.map((edge) => edge.node),
    );

    const hasNextPage =
      connection?.pageInfo?.hasNextPage === true;
    const endCursor =
      connection?.pageInfo?.endCursor ?? '';

    if (!hasNextPage || !endCursor) {
      break;
    }

    after = endCursor;
  }

  return convertTonamelCompetitions(competitions);
};
