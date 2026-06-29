const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const japanDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 日本時間で翌日の年月日をYYYY-MM-DD形式で返します。
 */
export const createTomorrowJapanDate = (
  now: Date = new Date(),
): string =>
  japanDateFormatter.format(
    new Date(now.getTime() + MILLISECONDS_PER_DAY),
  );

/**
 * 日本時間で指定日の00:00をUnix秒へ変換します。
 */
export const japanDateToUnixSeconds = (
  dateText: string,
): string => {
  const match = dateText.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`日付形式が不正です: ${dateText}`);
  }

  const utcMilliseconds = Date.UTC(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
    -9,
    0,
    0,
  );

  return String(Math.floor(utcMilliseconds / 1000));
};

/**
 * Unix秒を日本時間のYYYY/MM/DD HH:mmへ変換します。
 */
export const formatUnixSecondsInJapan = (
  unixSeconds: string,
): string => {
  const seconds = Number.parseInt(unixSeconds, 10);

  if (!Number.isFinite(seconds)) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(seconds * 1000));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
};
