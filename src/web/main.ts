import './style.css';

import { renderUnmappedEvents } from './list';
import { initializeMap } from './map';
import type { PublishedPayload } from './types';
import { q } from './unpack';

/**
 * 最終更新日時を日本時間の表示へ整形します。
 */
const formatUpdatedAt = (value: string): string => {
  const date = new Date(value);
  const isValidDate = !Number.isNaN(date.getTime());

  if (!isValidDate) {
    return '更新日時不明';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

/**
 * 暗号化済みデータを取得し、地図と対象外一覧を表示します。
 */
const main = async (): Promise<void> => {
  const updatedAtElement =
    document.querySelector<HTMLElement>('#updated-at');

  try {
    const response = await fetch('./data/events.bin', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(
        `イベントデータを取得できませんでした: HTTP ${response.status}`,
      );
    }

    const payload = await q<PublishedPayload>(
      await response.text(),
    );

    initializeMap(payload);
    renderUnmappedEvents(payload.events);

    if (!!updatedAtElement) {
      updatedAtElement.textContent = `最終更新：${formatUpdatedAt(payload.updatedAt)}`;
    }
  } catch (error) {
    console.error(error);

    if (!!updatedAtElement) {
      updatedAtElement.textContent =
        'イベントデータの読み込みに失敗しました';
    }

    const mapStatusElement =
      document.querySelector<HTMLElement>('#map-status');

    if (!!mapStatusElement) {
      mapStatusElement.textContent =
        '時間を置いてページを再読み込みしてください。';
    }
  }
};

void main();
