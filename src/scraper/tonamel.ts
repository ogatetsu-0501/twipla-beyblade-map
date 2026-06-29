import {
  formatUnixSecondsInJapan,
  japanDateToUnixSeconds,
} from './date-utils';
import type { EventDetail } from './types';

const TONAMEL_GRAPHQL_URL =
  'https://tonamel.com/graphql/competition_management';
const TONAMEL_ORIGIN = 'https://tonamel.com';
const TONAMEL_PAGE_SIZE = 32;

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
        eventId: `tonamel:${competition.id}:${tournament.id}`,
        eventUrl: `${TONAMEL_ORIGIN}/competition/${competition.id}`,
        title: competition.title,
        startsAtText,
        summaryLocation: address,
        source: 'tonamel',
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

const requestPage = async (
  startAfter: string,
  after: string,
  userAgent: string,
): Promise<TonamelGraphqlResponse> => {
  const referer = `${TONAMEL_ORIGIN}/competitions?game=beyblade_x&region=JP&date=${startAfter}`;
  const response = await fetch(TONAMEL_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ja',
      'Content-Type': 'application/json',
      Origin: TONAMEL_ORIGIN,
      Referer: referer,
      'User-Agent': userAgent,
      'X-Page-View-Location': referer,
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
 * セッションCookieやCSRFトークンは使用しません。
 */
export const fetchTonamelEvents = async (
  searchStartDate: string,
  userAgent: string,
): Promise<EventDetail[]> => {
  const startAfter = japanDateToUnixSeconds(
    searchStartDate,
  );
  const competitions: TonamelCompetition[] = [];
  let after = '';

  for (;;) {
    const result = await requestPage(
      startAfter,
      after,
      userAgent,
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
