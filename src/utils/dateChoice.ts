import { deCamelize } from './normalizeText';

export type DatePart = 'year' | 'month' | 'day';

export function datePartFromHint(...hints: string[]): DatePart | undefined {
  for (const hint of hints) {
    const text = deCamelize(hint);
    const parts: DatePart[] = [];
    if (/年份|\byear\b|yyyy|(?:^|\s)年(?:$|\s)/i.test(text)) parts.push('year');
    if (/月份|\bmonth\b|\bmm\b|(?:^|\s)月(?:$|\s)/i.test(text)) parts.push('month');
    if (/\bday\b|\bdd\b|(?:^|\s)日(?:$|\s)/i.test(text)) parts.push('day');
    if (parts.length === 1) return parts[0];
  }
  return undefined;
}

/** 只比较明确日期组成部分的数字，不将普通下拉的同号文本当作日期。 */
export function dateChoiceNumber(text: string, part: DatePart): number | undefined {
  const normalized = text.trim().toLowerCase().replace(/\.$/, '');
  const match = /^(\d{1,4})\s*([年月日])?$/.exec(normalized);
  if (match) {
    const number = Number(match[1]);
    const unit = part === 'year' ? '年' : part === 'month' ? '月' : '日';
    const maximum = part === 'year' ? 9999 : part === 'month' ? 12 : 31;
    return (!match[2] || match[2] === unit) && number >= 1 && number <= maximum ? number : undefined;
  }
  if (part === 'month') {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const index = months.findIndex(month => normalized === month || normalized === month.slice(0,3));
    return index < 0 ? undefined : index + 1;
  }
  return undefined;
}
