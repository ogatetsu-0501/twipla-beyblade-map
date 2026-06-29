import L, { type Map, type Marker } from 'leaflet';

import 'leaflet/dist/leaflet.css';

import type {
  EventData,
  EventSource,
  PublishedPayload,
} from './types';

const DEFAULT_ZOOM = 13;
const JAPAN_ZOOM = 5;
const NEAR_EVENT_DAYS = 7;
const FAR_EVENT_DAYS = 45;
const MILLISECONDS_PER_DAY =
  24 * 60 * 60 * 1000;
const GROUP_DISTANCE_METERS = 25;

type EventMarkerGroup = {
  latitude: number;
  longitude: number;
  events: EventData[];
};

type MarkerDateParts = {
  month: string;
  day: string;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

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

const createMarkerDateParts = (
  startsAtText: string,
): MarkerDateParts => {
  const match = startsAtText.match(
    /^\d{4}\/(\d{2})\/(\d{2})/,
  );

  if (!match?.[1] || !match[2]) {
    return {
      month: '?月',
      day: '?',
    };
  }

  return {
    month: `${Number.parseInt(match[1], 10)}月`,
    day: String(
      Number.parseInt(match[2], 10),
    ),
  };
};

const createEventMarkerColors = (
  startsAtText: string,
): { fillColor: string; color: string } => {
  const eventDate =
    parseEventDate(startsAtText);

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
        (FAR_EVENT_DAYS -
          NEAR_EVENT_DAYS),
    ),
  );
  const hue = Math.round(
    215 * normalizedDistance,
  );

  return {
    fillColor: `hsl(${hue} 82% 52%)`,
    color: `hsl(${hue} 88% 34%)`,
  };
};

const toRadians = (degrees: number): number =>
  (degrees * Math.PI) / 180;

const calculateDistanceMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number => {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(
    latitudeB - latitudeA,
  );
  const longitudeDelta = toRadians(
    longitudeB - longitudeA,
  );
  const startLatitude =
    toRadians(latitudeA);
  const endLatitude =
    toRadians(latitudeB);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusMeters *
    Math.asin(Math.sqrt(haversine))
  );
};

const createTooltipLocation = (
  event: EventData,
): string =>
  event.locationText ||
  event.address ||
  event.summaryLocation ||
  '場所情報なし';

const sortEventsByDate = (
  events: EventData[],
): EventData[] =>
  [...events].sort((eventA, eventB) =>
    eventA.startsAtText.localeCompare(
      eventB.startsAtText,
      'ja',
    ),
  );

const groupEventsByLocation = (
  events: EventData[],
): EventMarkerGroup[] => {
  const groups: EventMarkerGroup[] = [];

  for (const event of sortEventsByDate(events)) {
    if (
      event.latitude === null ||
      event.longitude === null
    ) {
      continue;
    }

    const matchedGroup = groups.find(
      (group) =>
        calculateDistanceMeters(
          event.latitude as number,
          event.longitude as number,
          group.latitude,
          group.longitude,
        ) <= GROUP_DISTANCE_METERS,
    );

    if (matchedGroup) {
      matchedGroup.events.push(event);
      continue;
    }

    groups.push({
      latitude: event.latitude,
      longitude: event.longitude,
      events: [event],
    });
  }

  return groups;
};

const createGroupLocationLabel = (
  events: EventData[],
): string => {
  const locations = [
    ...new Set(
      events.map(createTooltipLocation),
    ),
  ];

  if (locations.length <= 1) {
    return locations[0] ?? '場所情報なし';
  }

  return `${locations[0]} ほか${
    locations.length - 1
  }会場`;
};

const createSourceLabel = (
  source: EventSource,
): string =>
  source === 'tonamel'
    ? 'Tonamel'
    : 'TwiPla';

const createSourceClass = (
  events: EventData[],
): string => {
  const sources = new Set(
    events.map((event) => event.source),
  );

  if (sources.size >= 2) {
    return 'mixed';
  }

  return sources.has('tonamel')
    ? 'tonamel'
    : 'twipla';
};

const createEventBlockHtml = (
  event: EventData,
  showLocation: boolean,
): string => {
  const locationLine = showLocation
    ? `<span class="event-popup-location">場所：${escapeHtml(
        createTooltipLocation(event),
      )}</span>`
    : '';

  return [
    `<a class="event-popup-block event-popup-block--${event.source}"`,
    ` href="${escapeHtml(event.eventUrl)}"`,
    ' target="_blank" rel="noopener noreferrer">',
    '<span class="event-popup-block-heading">',
    `<span class="event-source-badge event-source-badge--${event.source}">${createSourceLabel(
      event.source,
    )}</span>`,
    `<strong>${escapeHtml(event.title)}</strong>`,
    '</span>',
    `<span class="event-popup-date">${escapeHtml(
      event.startsAtText,
    )}</span>`,
    locationLine,
    '</a>',
  ].join('');
};

const createPopupHtml = (
  events: EventData[],
): string => {
  const sortedEvents = sortEventsByDate(events);
  const groupLocation =
    createGroupLocationLabel(sortedEvents);
  const uniqueLocationCount = new Set(
    sortedEvents.map(createTooltipLocation),
  ).size;
  const showLocation = uniqueLocationCount > 1;
  const eventBlocks = sortedEvents
    .map((event) =>
      createEventBlockHtml(
        event,
        showLocation,
      ),
    )
    .join('');

  return [
    '<div class="event-popup">',
    `<div class="event-popup-header"><strong>${escapeHtml(
      groupLocation,
    )}</strong>`,
    `<span>${sortedEvents.length}件</span></div>`,
    '<div class="event-popup-help">',
    'マーカーをホバー、または1回クリックで表示します。イベントをクリックすると詳細ページを開きます。',
    '</div>',
    `<div class="event-popup-list">${eventBlocks}</div>`,
    '</div>',
  ].join('');
};

const createDateMarkerIcon = (
  events: EventData[],
): L.DivIcon => {
  const sortedEvents = sortEventsByDate(events);
  const firstEvent = sortedEvents[0];
  const dateParts = createMarkerDateParts(
    firstEvent?.startsAtText ?? '',
  );
  const markerColors =
    createEventMarkerColors(
      firstEvent?.startsAtText ?? '',
    );
  const sourceClass =
    createSourceClass(sortedEvents);
  const countBadge =
    sortedEvents.length > 1
      ? `<span class="event-date-marker-count">${
          sortedEvents.length > 99
            ? '99+'
            : sortedEvents.length
        }</span>`
      : '';

  return L.divIcon({
    className: 'event-date-marker-wrapper',
    html: [
      '<span',
      ` class="event-date-marker event-date-marker--${sourceClass}"`,
      ` style="--event-marker-fill:${markerColors.fillColor};--event-marker-border:${markerColors.color}"`,
      '>',
      `<span class="event-date-marker-month">${dateParts.month}</span>`,
      `<span class="event-date-marker-day">${dateParts.day}</span>`,
      countBadge,
      '<span class="event-date-marker-tail"></span>',
      '</span>',
    ].join(''),
    iconSize: [48, 58],
    iconAnchor: [24, 56],
    popupAnchor: [0, -52],
  });
};

const bindMarkerInteraction = (
  marker: Marker,
  events: EventData[],
): void => {
  marker.bindPopup(
    createPopupHtml(events),
    {
      maxWidth: 410,
      minWidth: 290,
      autoPanPadding: L.point(30, 70),
      closeButton: true,
    },
  );

  // PCではホバー、スマホでは最初のタップでイベント一覧を表示します。
  marker.on('mouseover', () => {
    marker.openPopup();
  });
};

const addEventMarker = (
  map: Map,
  group: EventMarkerGroup,
): void => {
  const sortedEvents =
    sortEventsByDate(group.events);
  const firstEvent = sortedEvents[0];

  if (!firstEvent) {
    return;
  }

  const dateParts = createMarkerDateParts(
    firstEvent.startsAtText,
  );
  const marker = L.marker(
    [group.latitude, group.longitude],
    {
      icon: createDateMarkerIcon(
        sortedEvents,
      ),
      keyboard: true,
      title: `${dateParts.month}${dateParts.day}日・${sortedEvents.length}件`,
      riseOnHover: true,
    },
  ).addTo(map);

  bindMarkerInteraction(
    marker,
    sortedEvents,
  );
};

const createGeolocationErrorMessage = (
  error: GeolocationPositionError,
): string => {
  const isPermissionDenied =
    error.code ===
    GeolocationPositionError.PERMISSION_DENIED;
  const isTimeout =
    error.code ===
    GeolocationPositionError.TIMEOUT;

  if (isPermissionDenied) {
    return '現在地の利用が許可されなかったため、既定の場所を表示しています。';
  }

  if (isTimeout) {
    return '現在地を取得できなかったため、既定の場所を表示しています。';
  }

  return '現在地を利用できないため、既定の場所を表示しています。';
};

const focusCurrentLocation = (
  map: Map,
  statusElement: HTMLElement,
): void => {
  const canUseGeolocation =
    !!navigator.geolocation;

  if (!canUseGeolocation) {
    statusElement.textContent =
      'このブラウザでは現在地を利用できません。';
    return;
  }

  statusElement.textContent =
    '現在地を取得しています。';

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

const addEventMarkers = (
  map: Map,
  events: EventData[],
): number => {
  const groups =
    groupEventsByLocation(events);

  for (const group of groups) {
    addEventMarker(map, group);
  }

  return groups.length;
};

export const initializeMap = (
  payload: PublishedPayload,
): void => {
  const mapElement =
    document.querySelector<HTMLElement>(
      '#map',
    );
  const statusElement =
    document.querySelector<HTMLElement>(
      '#map-status',
    );
  const currentLocationButton =
    document.querySelector<HTMLButtonElement>(
      '#current-location-button',
    );
  const hasRequiredElements =
    !!mapElement &&
    !!statusElement &&
    !!currentLocationButton;

  if (!hasRequiredElements) {
    throw new Error(
      '地図の表示要素が見つかりません',
    );
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
    map.setView(
      defaultCenter,
      JAPAN_ZOOM,
    );
  }

  currentLocationButton.addEventListener(
    'click',
    () => {
      focusCurrentLocation(
        map,
        statusElement,
      );
    },
  );

  focusCurrentLocation(
    map,
    statusElement,
  );
};
