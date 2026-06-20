import { load } from 'cheerio';

import {
  EXCLUDED_DETAIL_SOCIAL_LINK_PATTERNS,
  EXCLUDED_TWIPLA_USER_IDS,
} from './constants';

const ORGANIZER_TEXT_PATTERN =
  /(?:主催者?|作成者|幹事|オーナー)/u;
const NON_ORGANIZER_CONTAINER_PATTERN =
  /(?:participant|attendee|member|guest|comment|reply|join|desc)/i;

const normalizeTwiplaUserId = (
  value: string,
): string =>
  value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?twipla\.jp\/users\//i, '')
    .replace(/^\/?users\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();

const normalizedExcludedTwiplaUserIds =
  new Set(
    EXCLUDED_TWIPLA_USER_IDS
      .map(normalizeTwiplaUserId)
      .filter(Boolean),
  );

/**
 * TwiPlaのユーザーリンクからユーザーIDを取得します。
 */
export const extractTwiplaUserIdFromHref = (
  href: string,
): string => {
  const isTwiplaUserPath =
    /^\/users\/[^/?#]+/i.test(href);
  const isTwiplaUserUrl =
    /^https?:\/\/(?:www\.)?twipla\.jp\/users\/[^/?#]+/i.test(
      href,
    );

  if (!isTwiplaUserPath && !isTwiplaUserUrl) {
    return '';
  }

  return normalizeTwiplaUserId(href);
};

/**
 * イベント詳細ページの主催者欄からTwiPlaユーザーIDを抽出します。
 *
 * 主催者を示すID・class・周辺文言を優先し、参加者・コメント欄などの
 * ユーザーリンクは候補から除外します。
 */
export const extractOrganizerTwiplaUserId = (
  html: string,
): string => {
  const $ = load(html);
  const candidates = $('a[href]')
    .toArray()
    .map((element, index) => {
      const anchor = $(element);
      const href = anchor.attr('href') ?? '';
      const userId =
        extractTwiplaUserIdFromHref(href);

      if (!userId) {
        return null;
      }

      const ancestors = anchor
        .parents()
        .slice(0, 5);
      const containerSignature = ancestors
        .toArray()
        .map((ancestor) => {
          const item = $(ancestor);
          return [
            item.attr('id') ?? '',
            item.attr('class') ?? '',
          ].join(' ');
        })
        .join(' ');
      const surroundingText = ancestors
        .toArray()
        .map((ancestor) =>
          $(ancestor).text().trim(),
        )
        .join(' ')
        .slice(0, 600);
      const isNonOrganizerArea =
        NON_ORGANIZER_CONTAINER_PATTERN.test(
          containerSignature,
        );
      const hasOrganizerClassOrId =
        /(?:organizer|owner|host|event[_-]?user|event[_-]?owner)/i.test(
          containerSignature,
        );
      const hasOrganizerText =
        ORGANIZER_TEXT_PATTERN.test(
          surroundingText,
        );
      const hasProfileImage =
        anchor.find('img.circle').length > 0;

      let score = 0;

      if (hasOrganizerClassOrId) {
        score += 120;
      }

      if (hasOrganizerText) {
        score += 80;
      }

      if (hasProfileImage) {
        score += 20;
      }

      if (isNonOrganizerArea) {
        score -= 200;
      }

      return {
        index,
        score,
        userId,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        index: number;
        score: number;
        userId: string;
      } => candidate !== null,
    )
    .filter((candidate) => candidate.score > -100)
    .sort(
      (candidateA, candidateB) =>
        candidateB.score - candidateA.score ||
        candidateA.index - candidateB.index,
    );

  return candidates[0]?.userId ?? '';
};

/**
 * 主催者のTwiPlaユーザーIDが除外設定に一致するか判定します。
 */
export const isExcludedByOrganizerTwiplaUserId = (
  organizerTwiplaUserId: string,
): boolean =>
  normalizedExcludedTwiplaUserIds.has(
    normalizeTwiplaUserId(
      organizerTwiplaUserId,
    ),
  );

/**
 * SNSリンクを比較しやすい形式へ揃えます。
 */
export const normalizeSocialLink = (
  value: string,
): string => {
  try {
    const url = new URL(value);
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/^twitter\.com$/, 'x.com');
    const path = url.pathname
      .replace(/\/+$/, '')
      .toLowerCase();

    return `${host}${path}`;
  } catch {
    return value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/^twitter\.com/, 'x.com')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
  }
};

const normalizedPatterns =
  EXCLUDED_DETAIL_SOCIAL_LINK_PATTERNS.map(
    normalizeSocialLink,
  );

/**
 * 詳細本文に掲載されたSNSリンクだけを抽出します。
 */
export const extractDetailSocialLinks = (
  html: string,
): string[] => {
  const $ = load(html);
  const links = $('#desc a[href]')
    .toArray()
    .map(
      (element) =>
        $(element).attr('href') ?? '',
    )
    .filter((href) =>
      /^https?:\/\//i.test(href),
    )
    .filter((href) =>
      /(?:^|\/\/)(?:www\.)?(?:x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be)\//i.test(
        href,
      ),
    );

  return [
    ...new Set(
      links.map(normalizeSocialLink),
    ),
  ];
};

/**
 * 設定されたSNSリンクに一致するか判定します。
 */
export const isExcludedByDetailSocialLinks = (
  socialLinks: string[],
): boolean =>
  socialLinks.some((link) =>
    normalizedPatterns.some((pattern) =>
      link.includes(pattern),
    ),
  );
