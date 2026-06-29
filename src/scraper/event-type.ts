import type {
  EventCategory,
  EventFilterTag,
} from './types';

const normalizeEventTypeText = (
  value: string,
): string =>
  value
    .normalize('NFKC')
    .toLocaleUpperCase('ja-JP')
    .replace(/\s+/g, '');

export const classifyEventCategory = (
  ...values: string[]
): EventCategory => {
  const text = normalizeEventTypeText(
    values.filter(Boolean).join(' '),
  );

  if (/体験会/u.test(text)) {
    return 'experience';
  }

  if (/連勝バトル/u.test(text)) {
    return 'winning';
  }

  if (/CASUALBATTLEDAY/u.test(text)) {
    return 'casual';
  }

  if (/アンバサダー/u.test(text)) {
    return 'ambassador';
  }

  if (/(?:B4|G2)/u.test(text)) {
    return 'g2';
  }

  if (/(?:G1|GP)/u.test(text)) {
    return 'g1gp';
  }

  if (/G3/u.test(text)) {
    return 'g3';
  }

  if (/S1/u.test(text)) {
    return 's1';
  }

  return 'other';
};

/**
 * 絞り込み用の属性を複数付与します。
 *
 * 例:
 * G3オープン大会 -> ranked, open
 * B4レギュラー大会 -> b4, regular
 * S1タッグ戦（オープン） -> s1, open
 */
export const classifyEventFilterTags = (
  ...values: string[]
): EventFilterTag[] => {
  const text = normalizeEventTypeText(
    values.filter(Boolean).join(' '),
  );
  const tags =
    new Set<EventFilterTag>();
  let hasBaseCategory = false;

  if (/体験会/u.test(text)) {
    tags.add('experience');
    hasBaseCategory = true;
  }

  if (/連勝バトル/u.test(text)) {
    tags.add('winning');
    hasBaseCategory = true;
  }

  if (
    /レギュラー/u.test(text) ||
    /6(?:歳)?[～〜~\-－ー]12歳/u.test(text)
  ) {
    tags.add('regular');
  }

  if (
    /オープン/u.test(text) ||
    /6歳以上/u.test(text)
  ) {
    tags.add('open');
  }

  if (/アンバサダー/u.test(text)) {
    tags.add('ambassador');
    hasBaseCategory = true;
  }

  if (/S1/u.test(text)) {
    tags.add('s1');
    hasBaseCategory = true;
  }

  const isB4 = /B4/u.test(text);

  if (isB4) {
    tags.add('b4');
    hasBaseCategory = true;
  } else if (/(?:G1|G2|G3|GP)/u.test(text)) {
    tags.add('ranked');
    hasBaseCategory = true;
  }

  if (
    !hasBaseCategory ||
    /CASUALBATTLEDAY|その他/u.test(text)
  ) {
    tags.add('other');
  }

  return [...tags];
};

export const createInferredEventTypeLabel = (
  title: string,
): string => {
  const category =
    classifyEventCategory(title);

  switch (category) {
    case 'experience':
      return '体験会';
    case 'winning':
      return '連勝バトル';
    case 'g3':
      return 'G3';
    case 's1':
      return 'S1';
    case 'casual':
      return 'CASUAL BATTLE DAY';
    case 'ambassador':
      return 'アンバサダーイベント';
    case 'g2':
      return 'G2/B4';
    case 'g1gp':
      return 'G1/GP';
    default:
      return 'その他';
  }
};
