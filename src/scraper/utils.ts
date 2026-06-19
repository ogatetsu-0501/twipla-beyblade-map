import { setTimeout as sleep } from 'node:timers/promises';

/**
 * HTML内の連続する空白や改行を、表示に使いやすい1つの空白へまとめます。
 */
export const normalizeText = (value: string): string =>
  value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 指定された範囲からランダムな待機時間を作り、アクセス間隔を空けます。
 */
export const waitRandomDelay = async (
  minimumMilliseconds: number,
  maximumMilliseconds: number,
): Promise<void> => {
  const delayRange = maximumMilliseconds - minimumMilliseconds;
  const hasDelayRange = delayRange > 0;
  const randomDelay = hasDelayRange
    ? Math.floor(Math.random() * delayRange)
    : 0;
  const delayMilliseconds = minimumMilliseconds + randomDelay;

  await sleep(delayMilliseconds);
};

/**
 * 環境変数を正の整数として読み、無効な場合は既定値を返します。
 */
export const readPositiveInteger = (
  value: string | undefined,
  fallbackValue: number,
): number => {
  const parsedValue = Number.parseInt(value ?? '', 10);
  const isValidValue = Number.isFinite(parsedValue) && parsedValue > 0;

  return isValidValue ? parsedValue : fallbackValue;
};
