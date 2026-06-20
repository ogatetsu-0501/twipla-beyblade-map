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
const NEARBY_MARKER_DISTANCE_METERS = 60;
const MARKER_HORIZONTAL_OFFSET_PIXELS = 18;

type MarkerPlacementGroup = {
  latitude: number;
  longitude: number;
  markerCount: number;
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

const takeMarkerHorizontalOffset = (
  latitude: number,
  longitude: number,
  groups: MarkerPlacementGroup[],
): number => {
  const nearbyGroup = groups.find(
    (group) =>
      calculateDistanceMeters(
        latitude,
        longitude,
        group.latitude,
        group.longitude,
      ) <= NEARBY_MARKER_DISTANCE_METERS,
  );

  if (!nearbyGroup) {
    groups.push({
      latitude,
      longitude,
      markerCount: 1,
    });

    return 0;
  }

  const offset =
    nearbyGroup.markerCount *
    MARKER_HORIZONTAL_OFFSET_PIXELS;
  nearbyGroup.markerCount += 1;

  return offset;
};

const createTooltipLocation = (
  event: EventData,
): string =>
  event.locationText ||
  event.address ||
  event.summaryLocation ||
  '場所情報なし';

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
  let markerCount = 0;
  const placementGroups:
    MarkerPlacementGroup[] = [];

  for (const event of events) {
    if (
      event.latitude === null ||
      event.longitude === null
    ) {
      continue;
    }

    const horizontalOffset =
      takeMarkerHorizontalOffset(
        event.latitude,
        event.longitude,
        placementGroups,
      );
    const markerColors =
      createEventMarkerColors(
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
      `<span class="event-tooltip-location">場所：${escapeHtml(
        createTooltipLocation(event),
      )}</span>`,
    ].join('<br>');

    marker.bindTooltip(tooltipHtml, {
      direction: 'top',
      sticky: true,
      offset: L.point(horizontalOffset, 0),
      className: 'event-tooltip',
    });
    marker.on('click', () => {
      window.open(
        event.eventUrl,
        '_blank',
        'noopener,noreferrer',
      );
    });

    const markerElement =
      marker.getElement() as SVGElement | null;

    if (markerElement) {
      markerElement.classList.add(
        'event-map-marker',
      );

      if (horizontalOffset > 0) {
        markerElement.style.transform =
          `translateX(${horizontalOffset}px)`;
      }
    }

    markerCount += 1;
  }

  return markerCount;
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
