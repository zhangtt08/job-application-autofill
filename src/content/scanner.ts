import type { RawField } from "../types/field";
import { IGNORED_INPUT_TYPES, isIgnoredByKeyword } from "../rules/ignoreRules";
import { isCustomSelectElement, isDatePickerElement, isDisabled, isInputElement, isSelectElement, isTextAreaElement, isVisible, queryAllOpenRoots, visibleChoiceProxy } from "./domUtils";
import { buildRawField, detectKind } from "./contextExtractor";
import { LogEvent, logger } from "../utils/logger";

/**
 * 控件选择器：原生控件 + 主流 UI 库（Ant / Element / iView / 自研）的自定义下拉与级联，
 * 以及 contenteditable 富文本框。shadowRoot 与 same-origin iframe 用同一份选择器，
 * 保证三处的过滤口径完全一致（否则 iframe 里的隐藏控件会被当成候选）。
 */
const CONTROL_SELECTOR = [
  "input",
  ".atsx-date-picker-period-month > .atsx-date-picker-period-month-label",
  "textarea",
  "select",
  '[role="combobox"]',
  '[role="listbox"]',
  '[aria-haspopup="listbox"]',
  '[aria-haspopup="dialog"]',
  ".ant-select",
  ".el-select",
  ".ivu-select",
  '[class*="select-selector"]',
  '[class*="select-selection"]',
  '[class*="cascader"]',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[contenteditable="plaintext-only"]',
].join(", ");

/** 扫描结果缓存去重 */
function dedupe(fields: RawField[]): RawField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (seen.has(f.reference)) return false;
    seen.add(f.reference);
    return true;
  });
}

function isReadOnly(el: HTMLElement): boolean {
  return (
    (isInputElement(el) || isTextAreaElement(el)) &&
    el.readOnly &&
    !isCustomSelectElement(el) &&
    !isDatePickerElement(el)
  );
}

/** 与主文档同一套过滤：不可见 / 零尺寸 / aria-hidden / 黑名单关键词 / 已禁用 */
function accepts(el: HTMLElement): boolean {
  if (el.classList.contains("atsx-date-picker-period-hidden-input")) return false;
  if (isInputElement(el) && IGNORED_INPUT_TYPES.has(el.type)) return false;

  const kind = detectKind(el);
  if (kind === "unsupported") return false;

  // 组件容器（.el-select/.ant-select）若内部已有真实 input/combobox，
  // 只保留内部控件，避免同一个字段生成两张卡片、两次写入。
  if (!isInputElement(el) && !isTextAreaElement(el) && !isSelectElement(el) && isCustomSelectElement(el)) {
    const combo = el.closest('[role="combobox"]');
    if (combo && combo !== el) return false;
    const wrapper = el.parentElement?.closest('.ant-select,.el-select,.ivu-select,[role="combobox"]');
    if (wrapper && Array.from(wrapper.querySelectorAll<HTMLElement>('input,[role="combobox"]')).some(control => control !== el && isVisible(control) && control.getBoundingClientRect().width > 0 && control.getBoundingClientRect().height > 0)) return false;
    // 飞书非搜索下拉里的 input 尺寸为零：保留可见触发器，不能整栏一起过滤。
    if (Array.from(el.querySelectorAll<HTMLElement>("input,textarea,select,[role=combobox]")).some((control) =>
      isVisible(control) && control.getBoundingClientRect().width > 0 && control.getBoundingClientRect().height > 0,
    )) return false;
  }
  if (el.isContentEditable === false && kind === "contenteditable") return false;
  if (kind === 'contenteditable') {
    const parentEditor = el.parentElement?.closest('[contenteditable]');
    if (el.closest('[aria-readonly="true"]') || (parentEditor && parentEditor.getAttribute('contenteditable') !== 'false')) return false;
  }

  if (isDisabled(el) || isReadOnly(el)) return false;
  const proxy = visibleChoiceProxy(el);
  if (!isVisible(el) && !proxy) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const box = (proxy ?? el).getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;

  const textProbe = [
    el.getAttribute("name") ?? "",
    el.id ?? "",
    el.getAttribute("placeholder") ?? "",
    el.getAttribute("aria-label") ?? "",
  ].join(" ");
  if (isIgnoredByKeyword(textProbe)) {
    logger.event(LogEvent.FIELD_SKIPPED, `命中忽略规则，跳过: ${textProbe.slice(0, 40)}`);
    return false;
  }
  return true;
}

/**
 * DOM Scanner —— 只读操作，对目标页面零写入（产品红线，e2e/scan-does-not-write.spec.ts 守护）。
 * 收集 input / textarea / select / radio 组 / checkbox 组 / 自定义下拉 / contenteditable，
 * 外加 open shadowRoot 与 same-origin iframe；绝不触碰 submit 类元素。
 */
export function scanPage(): RawField[] {
  logger.event(LogEvent.SCAN_START, "开始扫描页面表单");

  const fields: RawField[] = [];
  const out = queryAllOpenRoots<HTMLElement>(document, CONTROL_SELECTOR);
  for (const el of out) {
    if (!accepts(el)) continue;
    const raw = buildRawField(el);
    if (raw) {
      fields.push(raw);
      logger.event(LogEvent.FIELD_DETECTED, `字段: ${raw.kind} ${raw.reference.slice(0, 60)}`);
    }
  }

  // 不再从父页面递归 same-origin iframe：扩展现在把 content script 注入到每个 frame，
  // 由 Background 逐 frame 扫描后合并（见 background/index.ts 的 SCAN_TARGET）。
  // 两边都收会把同一个 iframe 字段报两遍（两张卡片、两次写入）。

  const result = dedupe(fields);
  // eslint-disable-next-line no-console
  console.info(`[AFA] 扫描完成，共 ${result.length} 个字段`);
  return result;
}

/**
 * 扫描前等页面结构稳定：网申表单大量是 SPA / 异步分步加载，
 * 用户点「开始识别」时字段往往还没渲染出来（这就是「有时候根本识别不了」的另一半原因）。
 * 只观察、不写入；最多等 maxWait，稳定窗口 settleMs 内没有新增控件即认为加载完成。
 */
export async function scanPageSettled(options: { settleMs?: number; maxWait?: number } = {}): Promise<RawField[]> {
  const settleMs = options.settleMs ?? 350;
  const maxWait = options.maxWait ?? 2500;
  const deadline = Date.now() + maxWait;
  const controls = () => queryAllOpenRoots<HTMLElement>(document, CONTROL_SELECTOR);

  let last = controls();
  let stableSince = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, 120));
    if (Date.now() >= deadline) break;
    const current = controls();
    if (current.length !== last.length || current.some((el, index) => el !== last[index])) {
      last = current;
      stableSince = Date.now();
    } else if (current.length > 0 && Date.now() - stableSince >= settleMs) {
      break;
    }
  }
  return scanPage();
}
