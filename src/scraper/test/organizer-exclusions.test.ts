import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  extractOrganizerTwiplaUserId,
  extractTwiplaUserIdFromHref,
  isExcludedByOrganizerTwiplaUserId,
} from '../exclusions';

describe('organizer TwiPla exclusions', () => {
  it('主催者プロフィールリンクからユーザーIDを取得する', () => {
    const html = `
      <section class="event-owner">
        <a
          href="/users/Takashi_cos09"
          title="Takashi_cos09"
          target="_self"
        >
          <img
            src="/img/egg.png"
            class="circle"
            alt=""
          >
          𝑻𝒂𝒌𝒂𝒔𝒉𝒊
        </a>
      </section>
    `;

    expect(
      extractOrganizerTwiplaUserId(html),
    ).toBe('takashi_cos09');
  });

  it('大文字小文字を区別せず完全一致で除外する', () => {
    expect(
      isExcludedByOrganizerTwiplaUserId(
        'Takashi_cos09',
      ),
    ).toBe(true);
    expect(
      isExcludedByOrganizerTwiplaUserId(
        'takashi_cos090',
      ),
    ).toBe(false);
  });

  it('参加者リンクより主催者欄を優先する', () => {
    const html = `
      <section class="participants">
        <a href="/users/participant_user">
          <img class="circle" alt="">
          Participant
        </a>
      </section>
      <section class="organizer">
        <h2>主催者</h2>
        <a href="/users/Takashi_cos09">
          <img class="circle" alt="">
          Organizer
        </a>
      </section>
    `;

    expect(
      extractOrganizerTwiplaUserId(html),
    ).toBe('takashi_cos09');
  });

  it('TwiPla以外のリンクはユーザーIDとして扱わない', () => {
    expect(
      extractTwiplaUserIdFromHref(
        'https://x.com/Takashi_cos09',
      ),
    ).toBe('');
  });
});
