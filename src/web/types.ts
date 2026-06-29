export type EventSource =
  | 'twipla'
  | 'tonamel'
  | 'official';

export type EventCategory =
  | 'experience'
  | 'winning'
  | 'g3'
  | 's1'
  | 'casual'
  | 'ambassador'
  | 'g2'
  | 'g1gp'
  | 'other';

export type EventFilterTag =
  | 'experience'
  | 'winning'
  | 'open'
  | 'regular'
  | 'ambassador'
  | 's1'
  | 'ranked'
  | 'b4'
  | 'other';

export type LocationStatus =
  | 'exact'
  | 'venue'
  | 'area'
  | 'private'
  | 'unknown';

export type EventData = {
  source: EventSource;
  eventCategory: EventCategory;
  eventFilterTags: EventFilterTag[];
  eventTypeLabel: string;
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
