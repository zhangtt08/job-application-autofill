import { classifyApplicationContext } from "../context/applicationContext";
import { matchField } from "../matching/matcher";
import type { EnsureInternshipsResult, ExperienceGroup } from "../types/message";
import { findElementByFingerprint, isDisabled, isVisible, queryAllOpenRoots, sectionHeadingText, structuralPathOf, waitFor } from "./domUtils";
import { extractContext } from "./contextExtractor";
import { scanPage } from "./scanner";

const ADD_TEXT = /^(?:[+＋]\s*)?(?:(?:添加|新增|增加)(?:一[条段])?(?:(?:实习|工作|教育|项目|校园)(?:经历|经验)?|经历|记录)?|add(?:\s+(?:another|new))?(?:\s+(?:(?:education|work|project|campus)(?:\s+experience)?|internship|employment|experience))?)(?:\s*[（(](?:最多|上限|max(?:imum)?\.?)[^）)]*[）)])?(?:\s*[+＋])?$/i;
const EDIT_TEXT = /^(?:编辑|修改|edit)(?:\s*(?:(?:教育|实习|工作|项目|校园)(?:经历)?|基本信息|个人信息|个人资料)|\s+(?:education|experience|employment|project|personal information|basic information))?$/i;
export const EXPERIENCE_GROUPS = ["basic", "education", "internship", "campus", "project"] as const;
const TITLES: Record<ExperienceGroup, RegExp> = {
  basic: /基本信息|个人信息|个人资料|联系信息|联系方式|basic information|personal information|contact information/i,
  education: /教育|学历|education/i,
  internship: /实习|工作经历|工作经验|internship|employment|work experience/i,
  campus: /校园|社团|学生工作|campus/i,
  project: /项目|project/i,
};
export const EXPERIENCE_LABELS: Record<ExperienceGroup, string> = { basic: "个人信息", education: "教育", internship: "实习/工作", campus: "校园", project: "项目" };

function sectionFor(button: HTMLElement, group: ExperienceGroup): HTMLElement | null {
  let node = button.parentElement;
  for (let depth = 0; node && depth < 16 && !/^(BODY|HTML|FORM)$/.test(node.tagName); depth++, node = node.parentElement) {
    const heading = sectionHeadingText(node);
    if (!heading) continue;
    const matched = EXPERIENCE_GROUPS.filter((candidate) => TITLES[candidate].test(heading));
    if (!matched.length) continue;
    if (matched.length !== 1) return null;
    if (!TITLES[group].test(heading)) return null;
    return node;
  }
  return null;
}

function actionTargets(group: ExperienceGroup, action: "add" | "edit" = "add"): { button: HTMLElement; section: HTMLElement }[] {
  const seen = new Set<HTMLElement>();
  const targets: { button: HTMLElement; section: HTMLElement }[] = [];
  for (const el of queryAllOpenRoots<HTMLElement>(document, "button,a,[role=button],[class*=add i],[class*=edit i]")) {
    const button = el.closest<HTMLElement>("button,a,[role=button]") ?? el;
    if (seen.has(button)) continue;
    seen.add(button);
    const text = (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim();
    if (!(action === 'add' ? ADD_TEXT : EDIT_TEXT).test(text) || !isVisible(button)) continue;
    if (button.tagName === "BUTTON" && (button as HTMLButtonElement).type === "submit" && (button as HTMLButtonElement).form) continue;
    if (button.tagName === "A" && !/^(?:#.*|javascript:\s*(?:void\s*\(0\)|;?)\s*;?)?$/i.test(button.getAttribute("href") ?? "")) continue;
    const section = sectionFor(button, group);
    if (section) targets.push({ button, section });
  }
  return targets.filter((target) => !targets.some((other) => target.button !== other.button && target.button.contains(other.button)));
}

export function canAddInternships(): boolean {
  return expandableExperienceGroups().includes("internship");
}

export function expandableExperienceGroups(): ExperienceGroup[] {
  return EXPERIENCE_GROUPS.filter((group) => (group !== 'basic' && actionTargets(group).length === 1) || actionTargets(group, 'edit').length > 0);
}

/** 解析简历常先展示卡片；选库后才打开明确的编辑入口，扫描阶段保持只读。 */
async function openExperienceEditors(group: ExperienceGroup, count: number): Promise<{ opened: number; exclusive: boolean }> {
  const tried = new Set<string>();
  let opened = 0;
  const cardSelector = '.entry,[data-entry],[class*="experience-item"],[class*="resume-item"],[class*="work-item"]';
  const writable = (card: Element) => Array.from(card.querySelectorAll<HTMLElement>('input:not([type=hidden]),textarea,select,[contenteditable=true]'))
    .some(control => isVisible(control) && !isDisabled(control) && !control.hasAttribute('readonly'));
  const initial = actionTargets(group, 'edit');
  if (initial.some(({button,section}) => !writable(button.closest(cardSelector) ?? section) &&
    Array.from(section.querySelectorAll(cardSelector)).some(writable))) return { opened, exclusive: true };
  // shortcut: 最多打开20段；单段编辑切换会关闭前段时停止，不自动保存未核对的简历。
  while (tried.size < Math.min(count, 20)) {
    if (queryAllOpenRoots<HTMLElement>(document, '[role="dialog"],dialog[open]').some(isVisible)) break;
    const target = actionTargets(group, 'edit').find(({button, section}) => {
      if (isDisabled(button) || !classifyApplicationContext(extractContext(button)).eligible) return false;
      const card = button.closest<HTMLElement>(cardSelector) ?? section;
      if (writable(card)) return false;
      return !tried.has(JSON.stringify(structuralPathOf(card)));
    });
    if (!target) break;
    const card = target.button.closest<HTMLElement>(cardSelector) ?? target.section;
    tried.add(JSON.stringify(structuralPathOf(card)));
    const previous = scanPage().map(field => ({ reference: field.reference, element: findElementByFingerprint(field.reference) }))
      .filter(item => item.element && target.section.contains(item.element));
    const before = new Set(previous.map(item => item.reference));
    target.button.click();
    const changed = await waitFor(() => {
      const fields = scanPage();
      return fields.some(field => !before.has(field.reference)) ? fields : null;
    }, 1800, 100);
    if (!changed) break;
    opened++;
    const after = new Set(changed.map(field => field.reference));
    if (previous.some(item => item.element!.isConnected ? !isVisible(item.element!) : !after.has(item.reference))) return { opened, exclusive: true };
  }
  return { opened, exclusive: false };
}

function entryCount(section: HTMLElement, group: ExperienceGroup): number {
  const counts = new Map<string, number>();
  const groups = new Set<string>();
  for (const raw of scanPage()) {
    const element = findElementByFingerprint(raw.reference);
    if (!element || !section.contains(element) || !classifyApplicationContext(raw.context).eligible) continue;
    const id = matchField(raw).fieldId;
    if (!id.startsWith(`${group}.`) || id.endsWith(".hasExperience")) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (raw.context.entryGroup) groups.add(raw.context.entryGroup);
  }
  return Math.max(groups.size, 0, ...counts.values());
}

export async function ensureInternshipEntries(count: number, group: ExperienceGroup = "internship"): Promise<EnsureInternshipsResult> {
  if (!EXPERIENCE_GROUPS.includes(group) || !Number.isSafeInteger(count) || count < 0) throw new Error("实习条数无效");
  const label = EXPERIENCE_LABELS[group];
  let added = 0;
  const editing = count > 0 ? await openExperienceEditors(group, count) : { opened: 0, exclusive: false };
  if (editing.exclusive) return { ok: true, added, detail: `本次仅处理当前可编辑的${label}段落，按原卡片顺序填写；其余请逐段编辑后重新识别。` };
  if (group === 'basic') return { ok: true, added };
  let targets = actionTargets(group);
  if (targets.length !== 1) return { ok: true, added, ...(!editing.opened ? { detail: `未找到唯一的${label}添加入口，请手动补齐。` } : {}) };
  let { button, section } = targets[0]!;
  let current = entryCount(section, group);
  while (current < count) {
    const text = button.getAttribute("aria-label") || button.textContent || "";
    const maximum = text.match(/(?:最多|上限|max(?:imum)?\.?)\s*(\d+)/i)?.[1];
    if ((maximum && current >= Number(maximum)) || isDisabled(button) || button.matches(".disabled,[class*=disabled]")) break;
    const before = current;
    const root = section.getRootNode() as Document | ShadowRoot;
    const sectionId = section.id;
    button.click();
    const grew = await waitFor(() => {
      if (!section.isConnected) {
        const live = actionTargets(group);
        if (live.length === 1) ({ button, section } = live[0]!);
        else {
          const replacement = sectionId ? root.getElementById(sectionId) : null;
          if (!replacement || sectionHeadingText(replacement) !== sectionHeadingText(section)) return false;
          section = replacement;
        }
      }
      return entryCount(section, group) > before;
    }, 1800, 100);
    current = entryCount(section, group);
    if (!grew) break;
    added += current - before;
    if (current >= count) break;
    targets = actionTargets(group);
    if (targets.length !== 1) break;
    ({ button, section } = targets[0]!);
  }
  return { ok: true, added, ...(current < count ? { detail: `${label}栏有 ${current} 段，资料库有 ${count} 段；网站已达上限或未能继续添加，请手动核对。` } : {}) };
}
