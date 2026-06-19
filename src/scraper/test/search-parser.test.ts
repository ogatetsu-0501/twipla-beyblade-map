import { describe, expect, it } from 'vitest';

import { parseSearchResults } from '../search-parser';

describe('parseSearchResults', () => {
  it('左カラムの検索結果だけを抽出する', () => {
    const html = `
      <table><tr><td class="left_col">
        <ol class="links">
          <li>
            <a href="/events/728922">
              <span class="status-body">
                <strong class="black">2026/06/19 19:00</strong>
                <span class="black">愛知県稲沢市</span>
                <br />ベイブレード交流会<br />
                <span style="color:#666">説明文</span>
              </span>
            </a>
          </li>
        </ol>
      </td>
      <td class="right_col">
        <ol class="links">
          <li><a href="/events/999999">近日開催</a></li>
        </ol>
      </td></tr></table>
    `;

    const events = parseSearchResults(html);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      eventId: '728922',
      eventUrl: 'https://twipla.jp/events/728922',
      title: 'ベイブレード交流会',
      startsAtText: '2026/06/19 19:00',
      summaryLocation: '愛知県稲沢市',
    });
  });
});
