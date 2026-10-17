import type { RawFieldContext } from "../types/field";
import { htmlForLabel, isDatePickerElement, isInputElement, isSelectElement, isVisible, structuralPathOf } from "./domUtils";
import { datePartFromHint } from "../utils/dateChoice";

type DatePart = NonNullable<RawFieldContext["datePart"]>;
const DATE_LABEL = /开始|结束|入学|毕业|入职|离职|出生|起始|截止|\b(?:start|end|birth|graduation|enrollment)\b/i;

function partOf(el: HTMLElement): DatePart | undefined {
  if (!isInputElement(el) && !isSelectElement(el)) return undefined;
  if (isInputElement(el) && isDatePickerElement(el)) return undefined;
  if (isInputElement(el) && ["date", "month", "hidden"].includes(el.type)) return undefined;
  const part = datePartFromHint(htmlForLabel(el), el.getAttribute('placeholder') ?? '', el.getAttribute('name') ?? '', el.id);
  if (part) return part;
  if (isSelectElement(el)) {
    const texts = Array.from(el.options).filter(o => o.value !== '').map(o => o.textContent?.trim() ?? '');
    if (texts.length && (texts.length >= 2 || texts[0]!.endsWith('年')) && texts.every(t => /^\d{4}\s*年?$/.test(t))) return 'year';
    if (texts.length && (texts.length >= 2 || texts[0]!.endsWith('月')) && texts.every(t => /^\d{1,2}\s*月?$/.test(t) && Number.parseInt(t) >= 1 && Number.parseInt(t) <= 12)) return 'month';
    if (texts.length && (texts.length >= 2 || texts[0]!.endsWith('日')) && texts.every(t => /^\d{1,2}\s*日?$/.test(t) && Number.parseInt(t) >= 1 && Number.parseInt(t) <= 31)) return 'day';
  }
  return undefined;
}

/** 年/月/日是一个日期的组成部分，不能被多条经历轮转计数拆开。 */
export function dateControlContext(el: HTMLElement): Partial<RawFieldContext> {
  const part = partOf(el);
  if (part) {
    let scope = el.parentElement;
    let group: HTMLElement = el;
    let precision: DatePart = part;
    let label = htmlForLabel(el);
    for (let depth = 0; scope && depth < 5 && !/^(FORM|BODY|HTML|SECTION)$/.test(scope.tagName); depth++, scope = scope.parentElement) {
      const controls = Array.from(scope.querySelectorAll<HTMLElement>('input:not([type=hidden]),select')).filter(isVisible);
      if (controls.length > 3) break;
      const parts = controls.map(partOf);
      if (parts.length > 1 && parts.every(Boolean) && new Set(parts).size === parts.length) {
        group = scope;
        precision = parts.includes('day') ? 'day' : parts.includes('month') ? 'month' : 'year';
      }
      const text = htmlForLabel(scope);
      if (DATE_LABEL.test(text)) { label = text; break; }
    }
    if (DATE_LABEL.test(label)) return { labelText: label, datePart: part, datePrecision: precision, dateGroup: JSON.stringify(structuralPathOf(group)) };
  }
  if (isDatePickerElement(el)) {
    let scope = el.parentElement;
    for (let depth = 0; scope && depth < 4 && !/^(FORM|BODY|HTML|SECTION)$/.test(scope.tagName); depth++, scope = scope.parentElement) {
      const inputs = Array.from(scope.querySelectorAll<HTMLElement>('input')).filter(node => isDatePickerElement(node) && isVisible(node));
      if (inputs.length > 2) break;
      if (inputs.length === 2 && /range|period/i.test(scope.className)) {
        return { labelText: inputs.indexOf(el) === 0 ? '开始时间' : '结束时间' };
      }
    }
  }
  return {};
}
