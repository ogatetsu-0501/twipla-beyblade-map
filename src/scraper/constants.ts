export const TWIPLA_ORIGIN = 'https://twipla.jp';
export const SEARCH_KEYWORD = 'ベイブレード';
export const SEARCH_TARGET = '0';
export const DEFAULT_SEARCH_LIMIT = 1000;

export const DEFAULT_FOCUS_ADDRESS =
  '東京都世田谷区北沢2丁目4−5 mosia 4F';

export const DEFAULT_FALLBACK_CENTER = {
  latitude: 35.6616,
  longitude: 139.668,
};

export const OUTPUT_FILE_PATH = 'public/data/events.bin';
export const GEOCODE_CACHE_FILE_PATH = '.cache/geocode.json';
export const EVENT_CACHE_FILE_PATH = '.cache/events.json';

export const EVENT_CACHE_SCHEMA_VERSION = 3;
export const EVENT_CACHE_MAX_AGE_DAYS = 28;
export const EVENT_CACHE_REFRESH_WINDOW_DAYS = 14;


/**
 * 主催者のTwiPlaユーザーIDで除外する場合に追加します。
 * 大文字小文字は区別せず、/users/より後ろのIDだけを比較します。
 */
export const EXCLUDED_TWIPLA_USER_IDS = [
  'Takashi_cos09',
];

/**
 * 詳細本文内のSNSリンクでも除外したい場合に追加します。
 * URLは小文字化し、twitter.comはx.comとして比較します。
 */
export const EXCLUDED_DETAIL_SOCIAL_LINK_PATTERNS: string[] = [];

export const LOCATION_PRIVATE_WORDS = [
  'discord',
  'dmで',
  '参加者に',
  '非公開',
  '個別連絡',
  '後日連絡',
];

export const LOCATION_UNKNOWN_WORDS = [
  '未定',
  '調整中',
  '後日発表',
  '未確定',
];
