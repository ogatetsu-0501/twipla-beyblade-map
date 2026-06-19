export type LocationStatus =
  | 'exact'
  | 'venue'
  | 'area'
  | 'private'
  | 'unknown';

export type SearchEvent = {
  eventId: string;
  eventUrl: string;
  title: string;
  startsAtText: string;
  summaryLocation: string;
};

export type EventDetail = SearchEvent & {
  address: string;
  locationText: string;
  latitude: number | null;
  longitude: number | null;
  locationStatus: LocationStatus;
  locationNote: string;
};

export type PublishedPayload = {
  updatedAt: string;
  defaultCenter: {
    latitude: number;
    longitude: number;
  };
  events: EventDetail[];
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
};

export type GeocodeCache = Record<string, GeocodeResult | null>;
