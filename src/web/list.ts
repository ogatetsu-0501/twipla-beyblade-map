import type { EventData } from './types';

/**
 * 文字列をHTMLへ直接埋め込まず、DOM APIでイベントカードを作成します。
 */
const createEventCard = (event: EventData): HTMLElement => {
  const article = document.createElement('article');
  article.className = 'event-card';

  const source = document.createElement('span');
  source.className =
    `event-source-badge event-source-badge--${event.source}`;
  source.textContent =
    event.source === 'tonamel'
      ? 'Tonamel'
      : 'TwiPla';

  const heading = document.createElement('h3');
  const link = document.createElement('a');
  link.href = event.eventUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = event.title;
  heading.append(link);

  const date = document.createElement('p');
  date.className = 'event-date';
  date.textContent = event.startsAtText;

  const location = document.createElement('p');
  location.textContent = `場所：${event.locationText || '情報なし'}`;

  const note = document.createElement('p');
  note.className = 'event-note';
  note.textContent =
    event.locationNote || '地図表示に必要な座標がありません';

  article.append(source, heading, date, location, note);

  return article;
};

/**
 * 座標を持たないイベントだけを地図外の一覧へ表示します。
 */
export const renderUnmappedEvents = (
  events: EventData[],
): void => {
  const listElement =
    document.querySelector<HTMLElement>('#unmapped-list');
  const countElement =
    document.querySelector<HTMLElement>('#unmapped-count');
  const hasRequiredElements = !!listElement && !!countElement;

  if (!hasRequiredElements) {
    throw new Error('対象外一覧の表示要素が見つかりません');
  }

  const unmappedEvents = events.filter((event) => {
    const hasLatitude = event.latitude !== null;
    const hasLongitude = event.longitude !== null;

    return !hasLatitude || !hasLongitude;
  });

  countElement.textContent = `${unmappedEvents.length}件`;
  listElement.replaceChildren();

  const hasUnmappedEvents = !!unmappedEvents.length;

  if (!hasUnmappedEvents) {
    const message = document.createElement('p');
    message.className = 'empty-message';
    message.textContent =
      '現在、地図に表示できないイベントはありません。';
    listElement.append(message);
    return;
  }

  for (const event of unmappedEvents) {
    listElement.append(createEventCard(event));
  }
};
