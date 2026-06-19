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

  it('本文の場所と住所が同じ行に連結していても分離する', () => {
    const html = `
      <div class="bluetext">詳細</div>
      <div id="desc">
        <p>■場所</p>
        <p>田村公民館　※要上履き</p>
        <p>■住所</p>
        <p>福島県郡山市田村町岩作穂多礼40-3</p>
        <p>■駐車場</p>
        <p>敷地内に無料駐車場有り</p>
      </div>
    `;

    const detail = parseEventDetail(html, searchEvent);

    expect(detail.locationText).toBe('田村公民館 ※要上履き');
    expect(detail.address).toBe('福島県郡山市田村町岩作穂多礼40-3');
  });

  it('Discordで共有される場所はprivateとして扱う', () => {
    const html = `
      <div class="bluetext">詳細</div>
      <div id="desc">
        <div>【場所】</div>
        <div>JR川崎駅近辺（Discordで確認）</div>
        <div>【Discordサーバー】</div>
        <div>連絡や開催場所の共有を行うため、参加をお願いします。</div>
      </div>
    `;

    const detail = parseEventDetail(html, searchEvent);

    expect(detail.locationText).toBe('JR川崎駅近辺（Discordで確認）');
    expect(detail.locationStatus).toBe('private');
    expect(detail.latitude).toBeNull();
    expect(detail.longitude).toBeNull();
  });
});
