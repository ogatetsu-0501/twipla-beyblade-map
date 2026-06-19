import { describe, expect, it } from 'vitest';

import { parseEventDetail } from '../detail-parser';
import type { SearchEvent } from '../types';

const searchEvent: SearchEvent = {
  eventId: '728922',
  eventUrl: 'https://twipla.jp/events/728922',
  title: 'ベイブレード交流会',
  startsAtText: '2026/06/19 19:00',
  summaryLocation: '愛知県稲沢市',
};

describe('parseEventDetail', () => {
  it('専用場所欄と埋め込み地図から住所と座標を取得する', () => {
    const html = `
      <div class="bluetext">詳細</div>
      <div id="desc">本文</div>
      <div class="bluetext">場所</div>
      <div class="content_width">
        愛知県稲沢市祖父江町山崎下枇486-1<br />
        <a href="https://www.google.co.jp/maps?daddr=35.252670%2C136.725037">道順</a>
      </div>
      <div class="event_view_map">
        <iframe src="https://www.google.com/maps/embed/v1/place?q=35.252670,136.725037"></iframe>
      </div>
    `;

    const detail = parseEventDetail(html, searchEvent);

    expect(detail.address).toContain('愛知県稲沢市');
    expect(detail.latitude).toBe(35.25267);
    expect(detail.longitude).toBe(136.725037);
    expect(detail.locationStatus).toBe('exact');
  });

  it('Discordで共有される場所はprivateとして扱う', () => {
    const html = `
      <div class="bluetext">詳細</div>
      <div id="desc">
        【場所】
        JR川崎駅近辺（Discordで確認）
      </div>
    `;

    const detail = parseEventDetail(html, searchEvent);

    expect(detail.locationStatus).toBe('private');
    expect(detail.latitude).toBeNull();
    expect(detail.longitude).toBeNull();
  });
});
