import { load } from 'cheerio';

import {
  EXCLUDED_DETAIL_SOCIAL_LINK_PATTERNS,
} from './constants';

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
    .map((element) => $(element).attr('href') ?? '')
    .filter((href) => /^https?:\/\//i.test(href))
    .filter((href) =>
      /(?:^|\/\/)(?:www\.)?(?:x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be)\//i.test(
        href,
      ),
    );

  return [...new Set(links.map(normalizeSocialLink))];
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
