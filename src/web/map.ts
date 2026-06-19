import L, { type Map } from 'leaflet';

import 'leaflet/dist/leaflet.css';

import type { EventData, PublishedPayload } from './types';

const DEFAULT_ZOOM = 13;
const JAPAN_ZOOM = 5;
const NEAR_EVENT_DAYS = 7;
const FAR_EVENT_DAYS = 45;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * HTMLとして表示する文字列を安全な文字参照へ変換します。
 */
const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

/**
 * 開催日を日本時間のDateへ変換します。
 */
const parseEventDate = (
  startsAtText: string,
): Date | null => {
  const match = startsAtText.match(
    /^(\d{4})\/(\d{2})\/(\d{2})/,
  );

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  return new Date(
    Date.UTC(year, month - 1, day, -9, 0, 0),
  );
};

/**
 * 開催日が近いほど赤、遠いほど青になる色を作ります。
 */
const createEventMarkerColors = (
  startsAtText: string,
): { fillColor: string; color: string } => {
  const eventDate = parseEventDate(startsAtText);

  if (!eventDate) {
    return {
      fillColor: 'hsl(210 75% 50%)',
      color: 'hsl(210 80% 34%)',
    };
  }

  const daysUntilEvent = Math.max(
    0,
    Math.ceil(
      (eventDate.getTime() - Date.now()) /
        MILLISECONDS_PER_DAY,
    ),
  );
  const normalizedDistance = Math.min(
    1,
    Math.max(
      0,
      (daysUntilEvent - NEAR_EVENT_DAYS) /
        (FAR_EVENT_DAYS - NEAR_EVENT_DAYS),
    ),
  );
  const hue = Math.round(215 * normalizedDistance);

  return {
    fillColor: `hsl(${hue} 82% 52%)`,
    color: `hsl(${hue} 88% 34%)`,
  };
};

/**
 * 現在地へ移動できない場合に表示するメッセージを決めます。
 */
const createGeolocationErrorMessage = (
  error: GeolocationPositionError,
): string => {
  const isPermissionDenied =
    error.code === GeolocationPositionError.PERMISSION_DENIED;
  const isTimeout =
    error.code === GeolocationPositionError.TIMEOUT;

  if (isPermissionDenied) {
    return '現在地の利用が許可されなかったため、既定の場所を表示しています。';
  }

  if (isTimeout) {
    return '現在地を取得できなかったため、既定の場所を表示しています。';
  }

  return '現在地を利用できないため、既定の場所を表示しています。';
};

/**
 * 利用者の現在地を取得し、成功時だけ地図を移動します。
 */
const focusCurrentLocation = (
  map: Map,
  statusElement: HTMLElement,
): void => {
  const canUseGeolocation = !!navigator.geolocation;

  if (!canUseGeolocation) {
    statusElement.textContent =
      'このブラウザでは現在地を利用できません。';
    return;
  }

  statusElement.textContent = '現在地を取得しています。';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const center: L.LatLngExpression = [
        position.coords.latitude,
        position.coords.longitude,
      ];

      map.setView(center, DEFAULT_ZOOM);
      L.circleMarker(center, {
        radius: 7,
        weight: 2,
        fillOpacity: 0.85,
      })
        .addTo(map)
        .bindTooltip('現在地');

      statusElement.textContent =
        '現在地を中心に表示しました。';
    },
    (error) => {
      statusElement.textContent =
        createGeolocationErrorMessage(error);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    },
  );
};

/**
 * 座標を持つイベントを円形マーカーとして追加します。
 */
const addEventMarkers = (
  map: Map,
  events: EventData[],
): number => {
  let markerCount = 0;

  for (const event of events) {
    if (
      event.latitude === null ||
      event.longitude === null
    ) {
      continue;
    }

    const markerColors = createEventMarkerColors(
      event.startsAtText,
    );
    const marker = L.circleMarker(
      [event.latitude, event.longitude],
      {
        radius: 8,
        weight: 2,
        fillOpacity: 0.9,
        fillColor: markerColors.fillColor,
        color: markerColors.color,
      },
    ).addTo(map);
    const tooltipHtml = [
      `<strong>${escapeHtml(event.title)}</strong>`,
      escapeHtml(event.startsAtText),
    ].join('<br>');

    marker.bindTooltip(tooltipHtml, {
      direction: 'top',
      sticky: true,
      className: 'event-tooltip',
    });
    marker.on('click', () => {
      window.open(
        event.eventUrl,
        '_blank',
        'noopener,noreferrer',
      );
    });
    marker.getElement()?.classList.add(
      'event-map-marker',
    );

    markerCount += 1;
  }

  return markerCount;
};

/**
 * 地図、マーカー、現在地ボタンを初期化します。
 */
export const initializeMap = (
  payload: PublishedPayload,
): void => {
  const mapElement =
    document.querySelector<HTMLElement>('#map');
  const statusElement =
    document.querySelector<HTMLElement>('#map-status');
  const currentLocationButton =
    document.querySelector<HTMLButtonElement>(
      '#current-location-button',
    );
  const hasRequiredElements =
    !!mapElement &&
    !!statusElement &&
    !!currentLocationButton;

  if (!hasRequiredElements) {
    throw new Error('地図の表示要素が見つかりません');
  }

  const defaultCenter: L.LatLngExpression = [
    payload.defaultCenter.latitude,
    payload.defaultCenter.longitude,
  ];
  const map = L.map(mapElement).setView(
    defaultCenter,
    DEFAULT_ZOOM,
  );

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors',
    },
  ).addTo(map);

  const markerCount = addEventMarkers(
    map,
    payload.events,
  );

  if (markerCount === 0) {
    map.setView(defaultCenter, JAPAN_ZOOM);
  }

  currentLocationButton.addEventListener(
    'click',
    () => {
      focusCurrentLocation(map, statusElement);
    },
  );

  focusCurrentLocation(map, statusElement);
};
