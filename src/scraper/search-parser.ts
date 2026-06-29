import { load, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';

import { TWIPLA_ORIGIN } from './constants';
import type { SearchEvent } from './types';
import { normalizeText } from './utils';

/**
 * 検索結果のstatus-bodyから、最初と2番目のbrに挟まれたタイトルを抽出します。
 */
const extractTitle = (statusBody: Cheerio<Element>): string => {
  const contents = statusBody.contents().toArray();
  let hasPassedFirstBreak = false;
  const titleParts: string[] = [];

  for (const node of contents) {
    const isBreak =
      node.type === 'tag' && node.name === 'br';

    if (isBreak && !hasPassedFirstBreak) {
      hasPassedFirstBreak = true;
      continue;
    }

    if (isBreak && hasPassedFirstBreak) {
      break;
    }

    if (!hasPassedFirstBreak) {
      continue;
    }

    if (node.type === 'text') {
      titleParts.push(node.data);
    }
  }

  return normalizeText(titleParts.join(' '));
};

/**
 * TwiPlaの検索結果HTMLから、詳細ページ取得に必要な最小情報を抽出します。
 */
export const parseSearchResults = (
  html: string,
): SearchEvent[] => {
  const $ = load(html);
  const events: SearchEvent[] = [];

  $('td.left_col > ol.links > li').each(
    (_, listItem) => {
      const anchor = $(listItem)
        .children('a[href^="/events/"]')
        .first();
      const href = anchor.attr('href') ?? '';
      const eventIdMatch =
        href.match(/^\/events\/(\d+)$/);
      const eventId = eventIdMatch?.[1] ?? '';

      if (!eventId) {
        return;
      }

      const statusBody =
        anchor.find('.status-body').first();
      const title = extractTitle(statusBody);
      const startsAtText = normalizeText(
        statusBody
          .children('strong.black')
          .first()
          .text(),
      );
      const summaryLocation = normalizeText(
        statusBody
          .children('span.black')
          .first()
          .text(),
      );

      if (!title || !startsAtText) {
        return;
      }

      events.push({
        source: 'twipla',
        eventId,
        eventUrl: new URL(
          href,
          TWIPLA_ORIGIN,
        ).toString(),
        title,
        startsAtText,
        summaryLocation,
      });
    },
  );

  return events;
};
