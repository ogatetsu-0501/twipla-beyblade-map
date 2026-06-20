import type {
  EventDetail,
  LocationStatus,
} from './types';
import { normalizeText } from './utils';

export type LocationOverride = {
  latitude: number;
  longitude: number;
  locationStatus: LocationStatus;
  locationNote: string;
};

type LocationOverrideDefinition = LocationOverride & {
  aliases: string[];
};

type LocationSearchOverrideDefinition = {
  aliases: string[];
  query: string;
};

const LOCATION_OVERRIDES: LocationOverrideDefinition[] = [
  {
    aliases: [
      'おもちゃのバンビ本郷店',
      'バンビ本郷店',
    ],
    latitude: 36.66833120302214,
    longitude: 137.22910154960238,
    locationStatus: 'venue',
    locationNote:
      'Google Mapsの施設登録地点を表示しています',
  },
];


const LOCATION_SEARCH_OVERRIDES:
  LocationSearchOverrideDefinition[] = [
    {
      aliases: [
        '生涯学習センターけやき',
        '小田原市生涯学習センターけやき',
      ],
      query:
        '小田原市生涯学習センターけやき',
    },
  ];

const normalizeLocationName = (
  value: string,
): string =>
  normalizeText(value.normalize('NFKC'))
    .toLocaleLowerCase('ja-JP')
    .replace(
      /[\s　・･,，、。．.（）()［\][\]【】「」『』]/gu,
      '',
    );

export const findLocationOverride = (
  event: Pick<
    EventDetail,
    'locationText' | 'address' | 'summaryLocation'
  >,
): LocationOverride | null => {
  const locationText = normalizeLocationName(
    [
      event.locationText,
      event.address,
      event.summaryLocation,
    ].join(' '),
  );

  const matchedOverride =
    LOCATION_OVERRIDES.find((definition) =>
      definition.aliases.some((alias) =>
        locationText.includes(
          normalizeLocationName(alias),
        ),
      ),
    );

  if (!matchedOverride) {
    return null;
  }

  return {
    latitude: matchedOverride.latitude,
    longitude: matchedOverride.longitude,
    locationStatus:
      matchedOverride.locationStatus,
    locationNote: matchedOverride.locationNote,
  };
};

export const findLocationSearchOverride = (
  event: Pick<
    EventDetail,
    'locationText' | 'address' | 'summaryLocation'
  >,
): string | null => {
  const locationText = normalizeLocationName(
    [
      event.locationText,
      event.address,
      event.summaryLocation,
    ].join(' '),
  );

  const matchedOverride =
    LOCATION_SEARCH_OVERRIDES.find((definition) =>
      definition.aliases.some((alias) =>
        locationText.includes(
          normalizeLocationName(alias),
        ),
      ),
    );

  return matchedOverride?.query ?? null;
};
