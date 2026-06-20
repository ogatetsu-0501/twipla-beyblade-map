import L, { type Map } from 'leaflet';

import 'leaflet/dist/leaflet.css';

import type {
  EventData,
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

const createEventTooltipHtml = (
  event: EventData,
): string =>
  [
    `<strong>${escapeHtml(event.title)}</strong>`,
    escapeHtml(event.startsAtText),
    `<span class="event-tooltip-location">場所：${escapeHtml(
      createTooltipLocation(event),
    )}</span>`,
  ].join('<br>');

const createGroupTooltipHtml = (
  events: EventData[],
): string => {
  const sortedEvents = sortEventsByDate(events);
  const firstEvent = sortedEvents[0];
  const firstDate =
    firstEvent?.startsAtText ?? '';

  return [
    `<strong>${escapeHtml(
      createGroupLocationLabel(sortedEvents),
    )}</strong>`,
    `${sortedEvents.length}件のイベント`,
    firstDate
      ? `直近：${escapeHtml(firstDate)}`
      : '',
    'クリックで一覧を表示',
  ]
    .filter(Boolean)
    .join('<br>');
};

const createGroupPopupHtml = (
  events: EventData[],
): string => {
  const sortedEvents = sortEventsByDate(events);
  const groupLocation =
    createGroupLocationLabel(sortedEvents);
  const uniqueLocationCount = new Set(
    sortedEvents.map(createTooltipLocation),
  ).size;
  const listItems = sortedEvents
    .map((event) => {
      const locationLine =
        uniqueLocationCount > 1
          ? `<div class="event-group-popup-location">場所：${escapeHtml(
              createTooltipLocation(event),
            )}</div>`
          : '';

      return [
        '<li>',
        `<a href="${escapeHtml(
          event.eventUrl,
        )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          event.title,
        )}</a>`,
        `<div class="event-group-popup-date">${escapeHtml(
          event.startsAtText,
        )}</div>`,
        locationLine,
        '</li>',
      ].join('');
    })
    .join('');

  return [
    '<div class="event-group-popup">',
    `<strong>${escapeHtml(
      groupLocation,
    )}</strong>`,
    `<div class="event-group-popup-count">${sortedEvents.length}件のイベント</div>`,
    `<ul>${listItems}</ul>`,
    '</div>',
  ].join('');
};

const addSingleEventMarker = (
  map: Map,
  event: EventData,
  latitude: number,
  longitude: number,
): void => {
  const markerColors =
    createEventMarkerColors(
      event.startsAtText,
    );
  const marker = L.circleMarker(
    [latitude, longitude],
    {
      radius: 8,
      weight: 2,
      fillOpacity: 0.9,
      fillColor: markerColors.fillColor,
      color: markerColors.color,
    },
  ).addTo(map);

  marker.bindTooltip(
    createEventTooltipHtml(event),
    {
      direction: 'top',
      sticky: true,
      className: 'event-tooltip',
    },
  );
  marker.on('click', () => {
    window.open(
      event.eventUrl,
      '_blank',
      'noopener,noreferrer',
    );
  });
  marker
    .getElement()
    ?.classList.add('event-map-marker');
};

const addGroupedEventMarker = (
  map: Map,
  group: EventMarkerGroup,
): void => {
  const sortedEvents =
    sortEventsByDate(group.events);
  const firstEvent = sortedEvents[0];

  if (!firstEvent) {
    return;
  }

  const markerColors =
    createEventMarkerColors(
      firstEvent.startsAtText,
    );
  const countText =
    sortedEvents.length > 99
      ? '99+'
      : String(sortedEvents.length);
  const marker = L.marker(
    [group.latitude, group.longitude],
    {
      icon: L.divIcon({
        className:
          'event-group-marker-wrapper',
        html: [
          '<span',
          ' class="event-group-marker"',
          ` style="--event-marker-fill:${markerColors.fillColor};--event-marker-border:${markerColors.color}"`,
          `>${countText}</span>`,
        ].join(''),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
      keyboard: true,
      title: `${sortedEvents.length}件のイベント`,
    },
  ).addTo(map);

  marker.bindTooltip(
    createGroupTooltipHtml(sortedEvents),
    {
      direction: 'top',
      sticky: true,
      className: 'event-tooltip',
    },
  );
  marker.bindPopup(
    createGroupPopupHtml(sortedEvents),
    {
      maxWidth: 380,
      minWidth: 280,
    },
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
    if (group.events.length === 1) {
      const event = group.events[0];

      if (event) {
        addSingleEventMarker(
          map,
          event,
          group.latitude,
          group.longitude,
        );
      }

      continue;
    }

    addGroupedEventMarker(map, group);
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
