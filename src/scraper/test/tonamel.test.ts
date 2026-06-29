import { describe, expect, it } from 'vitest';

import {
  convertTonamelCompetitions,
} from '../tonamel';

describe('Tonamel competition conversion', () => {
  it('公開されたオフライン大会を地図イベントへ変換する', () => {
    const events = convertTonamelCompetitions([
      {
        id: 'f0wtZ',
        title: '第6回VG-X交流会',
        game: {
          id: 'beyblade_x',
        },
        status: 'OPENED',
        publicStatus: 'PUBLIC',
        region: 'JP',
        tournaments: [
          {
            id: 'tournament-1',
            displayStartAt: '1783141200',
            isOnline: false,
            location: {
              venueName:
                '足立区勤労福祉会館 第2洋室',
              address: {
                input:
                  '〒120-0005 東京都足立区綾瀬1丁目34-7',
              },
            },
          },
        ],
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'tonamel',
      eventFilterTags: ['other'],
      eventId:
        'tonamel:f0wtZ:tournament-1',
      eventUrl:
        'https://tonamel.com/competition/f0wtZ',
      title: '第6回VG-X交流会',
      locationText:
        '足立区勤労福祉会館 第2洋室',
    });
    expect(events[0]?.startsAtText).toMatch(
      /^2026\/07\/04 /,
    );
  });

  it('オンライン大会と同日時同会場の重複を除外する', () => {
    const baseTournament = {
      id: 'tournament-1',
      displayStartAt: '1783224000',
      isOnline: false,
      location: {
        venueName: '竜泉福祉センター',
        address: {
          input: '東京都台東区竜泉2丁目10-5',
        },
      },
    };
    const events = convertTonamelCompetitions([
      {
        id: 'ikN6G',
        title: 'ゆるゆるフリバ会',
        game: {
          id: 'beyblade_x',
        },
        status: 'OPENED',
        publicStatus: 'PUBLIC',
        region: 'JP',
        tournaments: [
          baseTournament,
          {
            ...baseTournament,
            id: 'tournament-2',
          },
          {
            ...baseTournament,
            id: 'online',
            isOnline: true,
          },
        ],
      },
    ]);

    expect(events).toHaveLength(1);
  });
});
