export type EventSource = 'twipla' | 'tonamel';

export type LocationStatus =
  | 'exact'
  | 'venue'
  | 'area'
  | 'private'
  | 'unknown';

export type EventData = {
  source: EventSource;
  eventId: string;
  eventUrl: string;
  title: string;
  startsAtText: string;
  summaryLocation: string;
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
  events: EventData[];
};
