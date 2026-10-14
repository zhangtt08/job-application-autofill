/**
 * 「投递」主流程的用户偏好。
 * 与业务数据分开存（afa.apply.prefs.v1），避免和 Profile / Job 混淆。
 */

const STORAGE_KEY = "afa.apply.prefs.v1";

export interface ApplyPrefs {
  showDev: boolean;
}

export const DEFAULT_PREFS: ApplyPrefs = { showDev: false };

export async function loadApplyPrefs(): Promise<ApplyPrefs> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return { ...DEFAULT_PREFS };
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return { showDev: result[STORAGE_KEY]?.showDev === true };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function saveApplyPrefs(prefs: ApplyPrefs): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: prefs });
}
