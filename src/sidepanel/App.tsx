import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rawFieldKey, type CandidateField, type RawField } from "../types/field";
import { Header } from "./components/Header";
import { FieldList } from "./components/FieldList";
import { FillConfirmDialog } from "./components/FillConfirmDialog";
import { ProfileEditor } from "./components/ProfileEditor";
import { TabBar, type MainTab } from "./components/TabBar";
import { Stepper, type Step } from "./components/Stepper";
import { useProfile } from "./hooks/useProfile";
/**
 * 判断逻辑一律从 `src/core` 这一门面取——它与 agent/tools.mjs 加载的是同一批源文件。
 * （过去这里逐个 pointing 到 pipeline / rules / profile 的相对路径，
 *   想在扩展外面复用同一套判断就只能再抄一份，两份迟早给出两个结论。）
 */
import {
  assessRisk,
  buildFillPlan,
  describeRule,
  deriveStatus,
  fieldFullLabel,
  hostFromUrl,
  isCanonicalFieldId,
  matchField,
  resolveValue,
  rulesForHost,
  runScanPipeline,
  summarizeFillOutcome,
  type SiteMemory,
} from "../core";
import { checkRuntimeBroadcasterSender } from "../utils/messageGuard";
import { assembleProfile, loadStore } from "../profile/libraryStore";
import { profileHasContent } from "../profile/profileStore";
import { makeManualJobContext } from "../job/jobParser";
import type { JobContext } from "../job/schema";
import { type ProfileType } from "../job/profileTypes";
import type {
  ScanPageResult,
  EnsureContentScriptResult,
  FillFieldsResult,
  UndoResult,
} from "../types/message";
import { LogEvent, logger } from "../utils/logger";
import { startTrace, getTraceId, trace } from "../utils/trace";
import { TraceViewer } from "./components/TraceViewer";
import { JobInbox } from "./components/JobInbox";
import { ProviderSettingsForm } from "./components/ProviderSettingsForm";
import { JobWorkspace } from "./components/JobWorkspace";
import {
  upsertJobFromContext,
  appendEvent,
  migrateStorage,
  createSession as createSessionV2,
  updateSession as updateSessionV2,
} from "../workspace/index";
import { generateAnswer } from "../answering/answerGenerator";
import { selectAnswerFacts, careerFactsFrom, companyFactsFrom } from "../answering/answerStrategy";
import { buildFactContext, extractJobRequirements } from "../generation/promptBuilder";
import { ANSWER_PROMPT_VERSION } from "../answering/promptBuilder";
import {
  createSession,
  saveAnswerToSession,
  answerCacheKey,
  getCachedAnswer,
  putCachedAnswer,
} from "../answering/answerStore";
import { validateAnswer } from "../answering/answerValidator";
import { loadApplyPrefs, saveApplyPrefs, DEFAULT_PREFS, type ApplyPrefs } from "./prefs";
import {
  addSiteRule,
  emptySiteMemory,
  loadSiteMemory,
  removeSiteRule,
  subscribeSiteMemoryChanges,
} from "../site/siteMemory";
import { findDuplicate, listJobs } from "../workspace/jobRepository";
import { formatBytes, readStorageUsage, type StorageUsage } from "../utils/storageUsage";

/** 识别只读；用户点选资料库后才按库内原文覆盖填写。 */
type Phase = "idle" | "recognizing" | "selecting" | "ready" | "filling" | "done";

const RECOGNIZE_STEPS = [
  { key: "page", label: "连接页面" },
  { key: "scan", label: "识别表单" },
];

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function isSafeFillable(c: CandidateField): boolean {
  return (c.status === "ready" || c.status === "need-confirm") && !!c.value && c.risk !== "MANUAL_ONLY";
}

/** 可自动填写的候选：有内容且不是敏感 MANUAL_ONLY；不再要求用户逐项确认风险/置信度。 */
function isConfirmable(c: CandidateField): boolean {
  return (
    (c.status === "ready" || c.status === "need-confirm") && !!c.value && c.risk !== "MANUAL_ONLY"
  );
}

function isConfirmedFillable(c: CandidateField): boolean {
  return c.confirmed === true && isConfirmable(c);
}

export default function App() {
  const {
    profile,
    persist,
    loadProblem,
    libraries,
    activeLibrary,
    activeLibraryId,
    switchLibrary,
    createLibrary,
    updateLibrary,
    deleteLibrary,
  } = useProfile();

  const [tab, setTab] = useState<MainTab>("apply");
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<ApplyPrefs>(DEFAULT_PREFS);
  /** 站点记忆：人在某个招聘站上做过的字段归属判断 / 「这一站别填」，本机保存 */
  const [siteMemory, setSiteMemory] = useState<SiteMemory>(emptySiteMemory());
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidates, setCandidates] = useState<CandidateField[]>([]);

  const [originals, setOriginals] = useState<
    { reference: string; kind: string; previousValue: string; frameId?: number; undoTag?: string }[]
  >([]);
  const [showConfirm, setShowConfirm] = useState(false);
  /** 无自动填写项时，字段清单默认收起；自动填写完成后保持展开，便于核对结果。 */
  const [previewRevealed, setPreviewRevealed] = useState(false);
  /** 仍通过确认框填写的补充字段（兼容手动预览流程）。 */
  const [confirmTargets, setConfirmTargets] = useState<CandidateField[]>([]);
  const [mutated, setMutated] = useState(false);
  /** 本轮识别后是否执行过撤销：决定副标题说「已撤销」还是「这个页面没有可填字段」 */
  const [inboxRefresh, setInboxRefresh] = useState(0);

  const [activeJob, setActiveJobState] = useState<JobContext | null>(null);
  const effectiveType: ProfileType = "general";
  const scanRef = useRef<{ fields: RawField[]; url: string; tabId: number; title: string } | null>(null);
  const busyRef = useRef(false);
  const fillJobRef = useRef<string | null>(null);
  const [usedLibraryName, setUsedLibraryName] = useState("");
  const sessionRef = useRef<string | null>(null);
  const sessionV2IdRef = useRef<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  /* ---------------- 基础数据 ---------------- */

  useEffect(() => {
    void loadApplyPrefs().then(setPrefs);
  }, []);

  // 站点记忆：开面板读一次，之后跟着 storage.onChanged 走（设置页删了，投递页要立刻失效）
  useEffect(() => {
    void loadSiteMemory().then(setSiteMemory);
    return subscribeSiteMemoryChanges(setSiteMemory);
  }, []);

  // 存储用量只在打开设置页时读（不常驻轮询，它要整份读盘）
  useEffect(() => {
    if (tab !== "settings") return;
    void readStorageUsage().then(setStorageUsage);
  }, [tab]);

  const updatePrefs = useCallback((patch: Partial<ApplyPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void saveApplyPrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    void migrateStorage().then((m) => {
      if (m) void trace("STORAGE_MIGRATION", "success", "afa.jobs.v1 → v2");
    });
  }, [initialized]);

  useEffect(() => {
    // 提醒类广播同样要认来源（`utils/messageGuard` 判据 1 的广播版）：
    // 只有本扩展自己（content script / service worker）发的才算「这一页变了」。
    const listener = (msg: { type?: string }, sender?: { id?: string }) => {
      if (msg?.type !== "PAGE_MUTATED") return;
      if (!checkRuntimeBroadcasterSender(sender, chrome.runtime.id).ok) return;
      setMutated(true);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  /** 资料还是空的：识别能认出字段，但一项都填不出来——先把用户引到导入，而不是让他对着空结果猜原因 */
  const needsProfile = useMemo(() => (profile ? !profileHasContent(profile) : false), [profile]);

  /* ---------------- 统计 ---------------- */

  /** 当前页面属于哪个招聘站（站点记忆的键）；读不到 URL 就没有站点设定可用 */
  const siteHost = useMemo(() => hostFromUrl(url), [url]);

  const reviewTargets = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (c.status === "need-confirm" || c.status === "low-confidence") &&
          !!c.value &&
          c.risk !== "MANUAL_ONLY",
      ),
    [candidates],
  );
  const filledList = useMemo(() => candidates.filter((c) => c.status === "filled"), [candidates]);
  const confirmable = useMemo(() => candidates.filter(isConfirmedFillable), [candidates]);
  /** 可直接填写：识别成功、有内容、非 MANUAL_ONLY。 */

  /**
   * 主按钮要写入的字段：
   * 已经逐项勾选过的优先；一个都没勾过时，把「待你确认」那一批整体纳入
   * —— 点主按钮 → 确认框列出将写什么 → 确认才写。写前门禁始终存在。
   */
  const pendingToFill = useMemo(
    () => (confirmable.length > 0 ? confirmable : candidates.filter(isSafeFillable)),
    [confirmable, candidates],
  );

  /* ---------------- Stage 4：开放题回答 ---------------- */

  const setGenErrorBanner = useCallback((e: Error & { code?: string }) => {
    setError(`${e.code ?? "ANSWER_GENERATION_FAILED"}: ${e.message}`);
  }, []);

  const handleGenerateAnswer = useCallback(
    async (reference: string) => {
      if (!profile || !activeJob) return;
      const candidate = candidates.find((c) => rawFieldKey(c.raw) === reference);
      const open = candidate?.openAnswer;
      if (!candidate || !open) return;

      const intent = open.intent;
      const question = open.question;
      const requirements = extractJobRequirements(activeJob);
      const length = open.lengthConstraint ?? {
        maxLength: candidate.raw.context.maxLength,
        targetCharacters: candidate.raw.context.maxLength ?? 300,
      };

      let personalFacts: import("../generation/types").Fact[] = [];
      const allCollections = [
        ...profile.internships.map((e, i) => ({ e, id: `internships-${i}`, label: e.company || "实习经历" })),
        ...profile.projects.map((e, i) => ({ e, id: `projects-${i}`, label: e.name || "项目经历" })),
        ...profile.campus.map((e, i) => ({ e, id: `campus-${i}`, label: "校园经历" })),
      ];
      if (intent === "representative_project") {
        const target = allCollections[0];
        if (target) personalFacts = buildFactContext(target.id, target.label, target.e).facts;
      } else {
        const merged = allCollections.flatMap(({ e, id, label }) => buildFactContext(id, label, e).facts);
        personalFacts = selectAnswerFacts(intent, requirements, merged);
      }
      const companyFacts = companyFactsFrom(activeJob);
      const careerFacts = careerFactsFrom(profile.careerPreferences);

      await trace("ANSWER_FACT_SELECT", "success", `${intent} facts=${personalFacts.length}`, {
        intent,
        factCount: personalFacts.length,
      });

      const cacheKey = answerCacheKey(
        activeJob.id,
        question,
        personalFacts.map((f) => f.id),
        ANSWER_PROMPT_VERSION,
      );
      const cached = await getCachedAnswer(cacheKey);

      let structured;
      let validation;
      try {
        if (cached) {
          structured = {
            answer: cached.answer,
            usedPersonalFactIds: [],
            usedCompanyFactIds: [],
            addressedRequirements: [],
            unsupportedRequirements: [],
            status: cached.status === "insufficient_context" ? ("insufficient_context" as const) : ("generated" as const),
            missingContext: [],
          };
          validation = validateAnswer(structured.answer, personalFacts, companyFacts, careerFacts, length);
        } else {
          const result = await generateAnswer({
            question,
            intent,
            jobRequirements: requirements,
            personalFacts,
            companyFacts,
            careerFacts,
            length,
          });
          structured = result.structured;
          validation = result.validation;
          if (structured.status === "generated" && structured.answer) {
            await putCachedAnswer(cacheKey, structured.answer, structured.status);
          }
        }
      } catch (err) {
        setGenErrorBanner(err as Error & { code?: string });
        return;
      }

      await trace(
        "ANSWER_GENERATE",
        structured.status === "generated" ? "success" : "info",
        `${intent} status=${structured.status}`,
        { intent, factCount: personalFacts.length },
      );

      setCandidates((prev) =>
        prev.map((c) => {
          if (rawFieldKey(c.raw) !== reference || !c.openAnswer) return c;
          if (structured.status === "insufficient_context") {
            return {
              ...c,
              openAnswer: {
                ...c.openAnswer,
                status: "insufficient_context",
                missingContext: structured.missingContext,
              },
            };
          }
          const blocked = validation.overall === "fail";
          return {
            ...c,
            status: blocked ? "unknown" : "need-confirm",
            editedValue: blocked ? undefined : structured.answer,
            openAnswer: {
              ...c.openAnswer,
              status: "generated",
              answer: structured.answer,
              validation,
              usedPersonalFactIds: structured.usedPersonalFactIds,
              usedCompanyFactIds: structured.usedCompanyFactIds,
            },
            value: blocked
              ? undefined
              : {
                  fieldId: "open.question",
                  value: structured.answer,
                  variant: "plain",
                  editable: true,
                  sourceType: "ai_grounded",
                },
          };
        }),
      );

      if (sessionRef.current && validation.overall !== "fail" && structured.status === "generated") {
        await saveAnswerToSession(sessionRef.current, {
          question,
          intent,
          answer: structured.answer,
          validationStatus: validation.overall,
          usedFactIds: structured.usedPersonalFactIds,
          maxLength: length.maxLength,
          manualEdited: false,
          createdAt: new Date().toISOString(),
        });
        await trace("ANSWER_SAVE_TO_SESSION", "success", intent, { intent });
      }
    },
    [profile, activeJob, candidates],
  );

  const handleRevalidateAnswer = useCallback(
    async (reference: string) => {
      if (!profile || !activeJob) return;
      const candidate = candidates.find((c) => rawFieldKey(c.raw) === reference);
      const open = candidate?.openAnswer;
      if (!candidate || !open) return;
      const draft = candidate.editedValue ?? "";
      const requirements = extractJobRequirements(activeJob);
      const companyFacts = companyFactsFrom(activeJob);
      const careerFacts = careerFactsFrom(profile.careerPreferences);
      const allFacts = [...profile.internships, ...profile.projects, ...profile.campus].flatMap((e, i) =>
        buildFactContext(`exp-${i}`, "经历", e).facts,
      );
      const personalFacts = selectAnswerFacts(open.intent, requirements, allFacts);
      const length = open.lengthConstraint ?? {
        maxLength: candidate.raw.context.maxLength,
        targetCharacters: candidate.raw.context.maxLength ?? 300,
      };
      const validation = validateAnswer(draft, personalFacts, companyFacts, careerFacts, length);
      const blocked = validation.overall === "fail";
      setCandidates((prev) =>
        prev.map((c) =>
          rawFieldKey(c.raw) === reference && c.openAnswer
            ? {
                ...c,
                status: blocked ? "unknown" : "need-confirm",
                openAnswer: { ...c.openAnswer, status: "generated", validation },
              }
            : c,
        ),
      );
      if (!blocked && sessionRef.current) {
        await saveAnswerToSession(sessionRef.current, {
          question: open.question,
          intent: open.intent,
          answer: draft,
          validationStatus: validation.overall,
          usedFactIds: open.usedPersonalFactIds ?? [],
          maxLength: length.maxLength,
          manualEdited: true,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [profile, activeJob, candidates],
  );

  /* ---------------- 写入层 ---------------- */

  /**
   * 唯一正式写入口（writeConfirmedPlan 语义）：
   * 先经 buildFillPlan 生成 ConfirmedFillPlan（confirmed 过滤 + MANUAL_ONLY 拦截），
   * 再把整个 plan 发给 content 侧 Writer——content 侧还有第二道运行时门禁。
   * Safety 不变量：本函数只允许被「用户点击确认填写」之后的流程调用；
   * Scan / handleRecognize 绝不允许调用（见 docs/SAFETY_FLOW_AUDIT.md）。
   */
  const writeFields = useCallback(
    async (targets: CandidateField[], effType: ProfileType, jobId: string | null) => {
      const plan = buildFillPlan(targets, jobId, effType);
      // 运行时门禁：plan 必须经过用户确认且非空（正常路径由 buildFillPlan 保证）
      if (plan.confirmed !== true || plan.fields.length === 0) {
        throw new Error("没有可填写的内容");
      }
      await trace("FILL_PLAN_CREATE", "success", `approved=${plan.fields.length}`, {
        approved: plan.fields.length,
      });
      // 经 Background 按 frame 分发：目标标签页与 frame 都由 Background 统一解析
      // （面板自己也可能占一个 tab，这里若拿 active tab 会指错页面）
      const res = (await chrome.runtime.sendMessage({
        type: "FILL_TARGET",
        plan: { confirmed: plan.confirmed, fields: plan.fields },
        expectedUrl: scanRef.current?.url,
        expectedTabId: scanRef.current?.tabId,
      })) as FillFieldsResult;
      if (!res?.ok) throw new Error(res?.error || "写入请求失败");
      return { plan, outcomes: res.outcomes, originals: res.originals };
    },
    [],
  );

  /**
   * 执行已经匹配到资料的字段。
   * 当前产品策略：REVIEW / 中低置信度不再要求逐项确认；能稳定定位且有内容的字段直接写入。
   * MANUAL_ONLY、unknown、空内容和不支持控件仍由 buildFillPlan / Writer 拦截。
   */
  const applyFill = useCallback(
    async (targets: CandidateField[], sourceCandidates: CandidateField[]) => {
      setPreviewRevealed(true);
      setPhase("filling");
      setError("");
      setNotice("");
      try {
        if (targets.length === 0) throw new Error("没有可填写的字段");
        const confirmedTargets = targets.map((c) => ({ ...c, confirmed: true }));
        const { plan, outcomes: fillOutcomes, originals: newOriginals } = await writeFields(
          confirmedTargets,
          effectiveType,
          fillJobRef.current,
        );
        if (plan.fields.length === 0) throw new Error("没有可填写的字段");
        const outcomeMap = new Map(fillOutcomes.map((o) => [`${o.frameId ?? 0}|${o.reference}`, o]));
        const updatedCandidates = sourceCandidates.map((c): CandidateField => {
          const outcome = outcomeMap.get(rawFieldKey(c.raw));
          return outcome ? { ...c, status: outcome.status === "filled" ? "filled" : "failed", confirmed: false, fillDetail: outcome.detail } : c;
        });
        setCandidates(updatedCandidates);
        const summary = summarizeFillOutcome(plan, fillOutcomes, sourceCandidates);
        setOriginals((prev) => [...prev, ...newOriginals]);
        setPhase("done");
        if (sessionV2IdRef.current) {
          const relevant = updatedCandidates.filter((c) => c.status !== "excluded" && c.status !== "ignored");
          const filled = relevant.filter((c) => c.status === "filled").length;
          await updateSessionV2(sessionV2IdRef.current, {
            status: relevant.every((c) => c.status === "filled") ? "filled" : "reviewing",
            fillPlanSummary: `${filled}/${relevant.length} 字段`,
          });
          setInboxRefresh((n) => n + 1);
          if (fillJobRef.current) {
            void appendEvent({
              jobId: fillJobRef.current,
              type: "FORM_FILLED",
              timestamp: new Date().toISOString(),
              metadata: {},
            });
          }
        }
        const failedRefs = fillOutcomes.filter((o) => o.status === "failed");
        await trace(
          "FIELD_WRITE",
          failedRefs.length > 0 ? "failed" : "success",
          `success=${summary.filled} failed=${summary.failed}`,
          { success: summary.filled, failed: summary.failed },
        );
        logger.event(LogEvent.FILL_SUCCESS, `填写完成 成功${summary.filled} 失败${summary.failed}`);
        return true;
      } catch (err) {
        setError(`填写失败：${err instanceof Error ? err.message : String(err)}`);
        setPhase("ready");
        return false;
      }
    },
    [effectiveType, writeFields],
  );

  /* ---------------- 主流程：识别 ---------------- */

  const markStep = useCallback((key: string, state: Step["state"], detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s)));
  }, []);

  const handleRecognize = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("recognizing");
    setError("");
    setNotice("");
    setMutated(false);
    setCandidates([]);
    setPreviewRevealed(false);
    setSteps(RECOGNIZE_STEPS.map((step) => ({ ...step, state: "pending" as const })));
    scanRef.current = null;
    if (!getTraceId()) startTrace();
    try {
      markStep("page", "running");
      const ensure = await chrome.runtime.sendMessage({ type: "ENSURE_CONTENT_SCRIPT" }) as EnsureContentScriptResult;
      if (!ensure?.ok) throw new Error(ensure?.detail || (ensure?.error === "no-active-tab"
        ? "找不到当前网页，请回到网申标签页后重试" : "无法连接当前网页，请刷新页面后重试"));
      if (ensure.tabId == null) throw new Error("扩展后台尚未更新，请在扩展管理页重新加载网申助手，再关闭并重新打开侧栏");
      if (!ensure.url) throw new Error("无法读取当前网页地址，请允许扩展在此网站运行，刷新网页后重试");
      setUrl(ensure.url);
      markStep("page", "done", hostOf(ensure.url));
      markStep("scan", "running");
      const res = await chrome.runtime.sendMessage({ type: "SCAN_TARGET", expectedUrl: ensure.url, expectedTabId: ensure.tabId }) as ScanPageResult;
      if (!res?.ok || !res.fields) throw new Error(res?.error || "无法读取表单");
      const target = await chrome.tabs.get(ensure.tabId);
      scanRef.current = { fields: res.fields, url: ensure.url, tabId: ensure.tabId, title: target.title || hostOf(ensure.url) || "申请记录" };
      // 换到另一页面后，不能拿上一页面的撤销记录去恢复相似字段。
      setOriginals((prev) => ensure.url === url ? prev : []);
      markStep("scan", "done", `${res.fields.length} 项`);
      if (res.fields.length === 0) {
        setNotice("未找到表单，请进入网申填写页后重试。");
        setPhase("idle");
      } else {
        setPhase("selecting");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    } finally {
      busyRef.current = false;
    }
  }, [markStep, url]);

  const handleChooseLibrary = useCallback(async (libraryId: string) => {
    const scan = scanRef.current;
    if (!scan || busyRef.current) return;
    busyRef.current = true;
    setPhase("filling");
    setError("");
    setNotice("");
    try {
      // 选库期间网页可能继续加载；填写前重新扫描，并校验仍是同一个标签页和地址。
      const res = await chrome.runtime.sendMessage({ type: "SCAN_TARGET", expectedUrl: scan.url, expectedTabId: scan.tabId }) as ScanPageResult;
      if (!res?.ok || !res.fields) throw new Error(res?.error || "页面已变化，请重新识别");
      const store = await loadStore();
      const library = store.libraries.find((item) => item.id === libraryId);
      if (!library) throw new Error("资料库已删除，请重新选择");
      const chosenProfile = assembleProfile(store.shared, library.content);
      await switchLibrary(libraryId);
      setUsedLibraryName(library.name);
      const scanned = runScanPipeline(res.fields, chosenProfile, {
        profileType: "general",
        siteRules: rulesForHost(siteMemory, hostFromUrl(scan.url)),
      });
      setCandidates(scanned);
      setPreviewRevealed(true);
      const targets = scanned.filter(isSafeFillable);
      // 只记录本页和填写结果，不再从网页识别岗位或决定资料方向。
      const existing = findDuplicate(await listJobs(), { sourceUrl: scan.url, company: "", position: scan.title });
      const record = existing ?? (await upsertJobFromContext({
        ...makeManualJobContext("general", scan.url), position: scan.title, pageTitle: scan.title,
      })).record;
      setActiveJobState(record);
      fillJobRef.current = record.id;
      const session = await createSessionV2({ jobId: record.id, jobContextId: record.id,
        effectiveProfileType: "general", sourceUrl: scan.url, traceId: getTraceId() });
      sessionV2IdRef.current = session.sessionId;
      await updateSessionV2(session.sessionId, { status: "scanned", detectedFields: scanned.filter((c) => c.status !== "excluded").length });
      sessionRef.current = (await createSession(record.id, "general")).sessionId;
      if (targets.length === 0) {
        setNotice("没有可自动填写的内容，请检查资料或字段匹配。");
        setPhase("ready");
      } else {
        await applyFill(targets, scanned);
      }
      setInboxRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("selecting");
    } finally {
      busyRef.current = false;
    }
  }, [applyFill, siteMemory, switchLibrary]);

  /* ---------------- 主流程：填写剩余已确认项 ---------------- */

  const handleFillConfirmed = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setShowConfirm(false);
    try { await applyFill(confirmTargets, candidates); } finally { busyRef.current = false; }
  }, [applyFill, candidates, confirmTargets]);

  const handleUndo = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: "UNDO_TARGET",
        originals: [...originals].reverse(),
        expectedUrl: scanRef.current?.url,
        expectedTabId: scanRef.current?.tabId,
      })) as UndoResult;
      if (!res?.ok) throw new Error(res?.error || "无法撤销");
      if (res?.ok) {
        setCandidates((prev) =>
          prev.map((c) =>
            c.status === "filled" || c.status === "failed"
              ? { ...c, status: "ready", confirmed: false }
              : c,
          ),
        );
        if (res.failed === 0) setOriginals([]);
        if (sessionV2IdRef.current) await updateSessionV2(sessionV2IdRef.current, { status: "scanned", fillPlanSummary: "" });
        setInboxRefresh((n) => n + 1);
        setNotice(
          res.failed > 0
            ? `已撤销本次填写，恢复 ${res.restored} 个字段；${res.failed} 个字段未能恢复，请重试或在网页核对。`
            : `已撤销本次填写，恢复 ${res.restored} 个字段。`,
        );
        logger.event(LogEvent.UNDO_SUCCESS, `撤销完成 恢复${res.restored} 失败${res.failed}`);
      }
    } catch (err) {
      setError(`撤销失败：${String(err)}`);
    } finally {
      busyRef.current = false;
    }
  }, [originals]);

  /* ---------------- 字段级操作 ---------------- */

  const toggleConfirm = (reference: string) =>
    setCandidates((prev) =>
      prev.map((c) => (rawFieldKey(c.raw) === reference ? { ...c, confirmed: !c.confirmed } : c)),
    );


  const editValue = (reference: string, value: string) =>
    setCandidates((prev) =>
      prev.map((c) => {
        if (rawFieldKey(c.raw) !== reference) return c;
        const base = {
          ...c,
          // 已经填过的字段被用户改了值 → 回到「待填写」，让它重新进入填写计划；
          // 否则用户改完发现没有任何入口把新值写进页面。
          status: c.status === "filled" ? ("need-confirm" as const) : c.status,
        };
        if (c.openAnswer && c.openAnswer.status === "generated") {
          return { ...base, editedValue: value, openAnswer: { ...c.openAnswer, status: "edited" as const } };
        }
        return { ...base, editedValue: value };
      }),
    );

  const ignore = (reference: string) =>
    setCandidates((prev) =>
      prev.map((c) =>
        rawFieldKey(c.raw) === reference ? { ...c, preIgnoreStatus: c.status, status: "ignored", confirmed: false } : c,
      ),
    );

  /** 撤销跳过：回到跳过前的状态。点错一下不该逼用户重扫整页。 */
  const unignore = (reference: string) =>
    setCandidates((prev) =>
      prev.map((c) =>
        rawFieldKey(c.raw) === reference && c.status === "ignored"
          ? { ...c, status: c.preIgnoreStatus ?? "unknown", preIgnoreStatus: undefined }
          : c,
      ),
    );

  /**
   * 重新判定一个字段（人工改挂 / 撤销站点设定之后用）。
   * 走的是和扫描完全一样的口径：assessRisk → resolveValue → deriveStatus，
   * 所以人工改挂之后仍然可能被红线或控件格式拦下 —— 不会出现
   * 「界面上说是 SAFE，写进去却绕过了门禁」。多条目序号（第几段经历）保留，
   * 否则改一栏会把「实习经历 2」的内容填成「实习经历 1」。
   */
  const rejudgeCandidate = useCallback(
    (c: CandidateField, fieldId: string): CandidateField => {
      if (!profile) return c;
      const match: CandidateField["match"] = { ...c.match, fieldId };
      const risk = assessRisk(fieldId, {
        labelText: c.raw.context.labelText,
        ariaLabel: c.raw.context.ariaLabel,
        placeholder: c.raw.context.placeholder,
        title: c.raw.context.title,
        fieldsetLabel: c.raw.context.fieldsetLabel,
        sectionTitle: c.raw.context.sectionTitle,
      });
      const value =
        risk.risk === "MANUAL_ONLY"
          ? undefined
          : resolveValue(fieldId, profile, {
              entryIndex: c.entryIndex ?? c.value?.entryIndex,
              profileType: effectiveType,
            });
      const derived = deriveStatus(c.raw, match, risk, isCanonicalFieldId(fieldId), value);
      return {
        ...c,
        match,
        risk: risk.risk,
        riskReason: derived.riskReason ?? risk.reason,
        value: value ?? undefined,
        status: derived.status,
        editedValue: undefined,
        confirmed: false,
      };
    },
    [effectiveType, profile],
  );

  /**
   * 把这一项改挂到次选资料字段上（低置信字段的人工纠正出路），
   * 并在知道 host 时把它**沉淀成站点设定** —— 同一家招聘站下次不用再改一遍。
   * 记忆只含 host + 站点自己给控件写的文字 + canonical 字段 id，不含任何资料值（见 siteMemory.ts）。
   */
  const switchMatchedField = (reference: string, fieldId: string) => {
    if (!profile || !isCanonicalFieldId(fieldId)) return;
    const target = candidates.find((c) => rawFieldKey(c.raw) === reference);
    setCandidates((prev) =>
      prev.map((c) => {
        if (rawFieldKey(c.raw) !== reference) return c;
        const next = rejudgeCandidate(c, fieldId);
        return { ...next, siteRule: siteHost ? { ruleId: `pending_${reference}`, host: siteHost, kind: "map" as const } : undefined };
      }),
    );
    if (siteHost && target) {
      void addSiteRule({ host: siteHost, ctx: target.raw.context, kind: "map", fieldId }).then(async ({ rule }) => {
        const fresh = await loadSiteMemory();
        setSiteMemory(fresh);
        if (rule) {
          // 把占位 ruleId 换成真实那条，撤销按钮才找得到它
          setCandidates((prev) =>
            prev.map((c) =>
              rawFieldKey(c.raw) === reference && c.siteRule?.kind === "map"
                ? { ...c, siteRule: { ...c.siteRule, ruleId: rule.id, host: rule.host, overriddenFieldId: matchField(c.raw).fieldId } }
                : c,
            ),
          );
          setNotice(`已记住：${rule.host} 上的「${rule.siteLabel || rule.matchKey}」按${fieldFullLabel(fieldId)}填。可在「设置 → 站点设定」里撤销。`);
        } else {
          setNotice("这一栏的归属已经改了，但这一站没能记住（网页没给出可识别的栏名）。下次仍需在清单里确认。");
        }
      });
    }
  };

  /**
   * 低置信字段的人工放行。这里只翻「要不要填」的决定，
   * 写入仍然经过 buildFillPlan（confirmed + 非 MANUAL_ONLY + 语境合格）—— 放行不等于绕行。
   */
  const confirmLowConfidence = (reference: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        rawFieldKey(c.raw) === reference && c.status === "low-confidence"
          ? { ...c, status: "need-confirm", confirmed: true }
          : c,
      ),
    );
    setPreviewRevealed(true);
  };

  /** 「这一站以后都别填这一项」：写进站点记忆，并把当前这张卡立刻切成跳过 */
  const blockOnSite = async (reference: string) => {
    const target = candidates.find((c) => rawFieldKey(c.raw) === reference);
    if (!target || !siteHost) return;
    const { memory, rule } = await addSiteRule({ host: siteHost, ctx: target.raw.context, kind: "block" });
    setSiteMemory(memory);
    if (!rule) {
      setNotice("这一栏没能在这一站上被唯一识别（网页没给出可记的栏名），所以只跳过了本次。");
      ignore(reference);
      return;
    }
    setCandidates((prev) =>
      prev.map((c) =>
        rawFieldKey(c.raw) === reference
          ? {
              ...c,
              preIgnoreStatus: c.status,
              status: "ignored",
              confirmed: false,
              value: undefined,
              riskReason: `按你在 ${rule.host} 的设定，这一栏以后都不自动填`,
              siteRule: { ruleId: rule.id, host: rule.host, kind: "block" },
            }
          : c,
      ),
    );
    setNotice(`已记住：${rule.host} 上的「${rule.siteLabel || rule.matchKey}」以后都不自动填。可在「设置 → 站点设定」里撤销。`);
  };

  /** 撤销一条站点设定，并把受影响的那几张卡重新判定回自动识别的结果 */
  const undoSiteRule = async (ruleId: string) => {
    const removed = siteMemory.rules.find((r) => r.id === ruleId);
    const next = await removeSiteRule(ruleId);
    setSiteMemory(next);
    if (!removed) return;
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.siteRule?.ruleId !== ruleId) return c;
        const cleared: CandidateField = { ...c, siteRule: undefined };
        const autoId = matchField(c.raw).fieldId;
        const rejudged = rejudgeCandidate(cleared, autoId);
        return { ...rejudged, siteRule: undefined, preIgnoreStatus: undefined };
      }),
    );
    setNotice(`已取消这条站点设定。${removed.kind === "map" ? "这一栏回到自动识别的结果。" : "这一栏下次识别可以正常填写。"}`);
  };

  const locate = async (reference: string) => {
    const target = candidates.find((c) => rawFieldKey(c.raw) === reference);
    if (!target) return;
    try {
      await chrome.runtime.sendMessage({
        type: "LOCATE_TARGET",
        reference: target.raw.reference,
        frameId: target?.raw.frameId ?? 0,
      });
    } catch {
      // 页面刷新过 / content script 不在：不弹窗打断，提示条里说清楚就好
      setNotice("页面已经变了，无法定位到那个字段。请点「重新识别」再试一次。");
    }
  };

  /* ---------------- 渲染 ---------------- */

  if (!profile) {
    return (
      <div className="app">
        <Header subtitle="正在加载资料…" />
        <main className="main">
          <p className="muted">加载资料中…</p>
        </main>
      </div>
    );
  }

  const anyPending = reviewTargets.length;
  const visibleFields = candidates.filter((c) => c.status !== "excluded");
  const unfilledCount = visibleFields.filter((c) => c.status !== "filled" && c.status !== "ignored").length;
  const busy = phase === "recognizing" || phase === "filling";
  const subtitle = tab === "apply" ? undefined : tab === "jobs" ? "申请记录" : tab === "profile" ? "资料库" : "偏好设置";
  const applyView = (
    <main className="main apply-main">
      {loadProblem && <div role="alert" className="banner banner-error">{loadProblem}</div>}
      {error && <div role="alert" className="banner banner-error">{error}</div>}
      {notice && <div role="status" className="banner">{notice}</div>}
      {mutated && !busy && <div className="banner banner-review">页面有变化，可重新识别。</div>}
      {phase === "idle" && (
        <section className="hero">
          <h2 className="hero-title">填写当前网申</h2>
          <p className="hero-desc">识别表单，选资料库，一次填入。</p>
          <button type="button" className="hero-btn" onClick={() => void handleRecognize()}>开始识别</button>
          {needsProfile && <button type="button" className="link-btn" onClick={() => setTab("profile")}>导入简历</button>}
        </section>
      )}
      {phase === "recognizing" && <Stepper steps={steps} />}
      {phase === "selecting" && (
        <section className="library-choice" aria-labelledby="library-choice-title">
          <div className="choice-heading">
            <h2 id="library-choice-title">选择资料库</h2>
            <span>{scanRef.current?.fields.length} 个字段</span>
          </div>
          <p className="choice-note">选后自动填写，并覆盖网页已有内容。</p>
          <div className="library-options">
            {libraries.map((library) => (
              <button type="button" className="library-option" key={library.id} onClick={() => void handleChooseLibrary(library.id)}>
                <span>{library.name}</span><span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <div className="summary-actions">
            <button type="button" className="btn-sm" onClick={() => void handleRecognize()}>重新识别</button>
            <button type="button" className="link-btn" onClick={() => { scanRef.current = null; setPhase("idle"); }}>取消</button>
          </div>
        </section>
      )}
      {(phase === "ready" || phase === "filling" || phase === "done") && (
        <>
          <section className="fill-overview" aria-live="polite">
            <div className="choice-heading">
              <h2>{phase === "filling" ? "正在填写…" : unfilledCount > 0 ? "部分已填写" : "填写完成"}</h2>
              <span>{usedLibraryName}</span>
            </div>
            <div className="fill-counts">
              <span className="count-filled">已填写 <strong>{filledList.length}</strong></span>
              <span className="count-unfilled">未填写 <strong>{unfilledCount}</strong></span>
            </div>
            <div className="summary-actions">
              <button type="button" className="btn-sm" onClick={() => void handleRecognize()} disabled={busy}>重新识别</button>
              {originals.length > 0 && <button type="button" className="btn-sm" onClick={() => void handleUndo()} disabled={busy}>撤销填写</button>}
              {pendingToFill.length > 0 && <button type="button" className="primary" disabled={busy} onClick={() => { setConfirmTargets(pendingToFill.map((c) => ({ ...c, confirmed: true }))); setShowConfirm(true); }}>填写 {pendingToFill.length} 项</button>}
            </div>
          </section>
          {previewRevealed && <fieldset className="field-controls" disabled={busy}><FieldList
            candidates={candidates} devMode={prefs.showDev}
            onToggleConfirm={toggleConfirm} onEditValue={editValue} onIgnore={ignore} onUnignore={unignore}
            onSwitchField={switchMatchedField} onConfirmLowConfidence={confirmLowConfidence}
            onBlockOnSite={(r) => void blockOnSite(r)} onUndoSiteRule={(id) => void undoSiteRule(id)}
            siteHost={siteHost ?? undefined} onLocate={(r) => void locate(r)}
            onGenerateAnswer={(r) => void handleGenerateAnswer(r)} onRevalidateAnswer={(r) => void handleRevalidateAnswer(r)}
          /></fieldset>}
        </>
      )}
    </main>
  );

  const jobsView = detailJobId ? (
    <JobWorkspace
      jobId={detailJobId}
      onBack={() => setDetailJobId(null)}
      onChanged={() => setInboxRefresh((n) => n + 1)}
    />
  ) : (
    <JobInbox
      refreshKey={inboxRefresh}
      onOpenJob={(jobId) => {
        setDetailJobId(jobId);
      }}
    />
  );

  const profileView = (
    <ProfileEditor
      // 换库时重挂载，避免把上一个库的草稿写进新库
      key={activeLibraryId}
      profile={profile}
      onPersist={persist}
      onBack={() => setTab("apply")}
      libraries={libraries}
      activeLibraryId={activeLibraryId}
      onSwitchLibrary={(id) => void switchLibrary(id)}
      onCreateLibrary={(input) => void createLibrary(input)}
      onUpdateLibrary={(id, patch) => void updateLibrary(id, patch)}
      onDeleteLibrary={(id) => void deleteLibrary(id)}
      libraryName={activeLibrary?.name ?? "默认资料库"}
    />
  );

  const settingsView = (
    <main className="main">
      <section className="card">
        <h3 className="card-title">站点设定（{siteMemory.rules.length} 条）</h3>
        {siteMemory.rules.length === 0 ? (
          <p className="muted small">暂无设定</p>
        ) : (
          <ul className="site-rule-list">
            {siteMemory.rules.map((r) => (
              <li key={r.id} className="site-rule-row" data-kind={r.kind}>
                <span className="site-rule-text">{describeRule(r, fieldFullLabel)}</span>
                <button type="button" className="link-btn" onClick={() => void undoSiteRule(r.id)}>
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">本机存储</h3>
        {!storageUsage || !storageUsage.available ? (
          <p className="muted small">无法读取存储用量</p>
        ) : (
          <>
            <p className="hint" data-storage-ratio={storageUsage.ratio.toFixed(3)}>
              已用 {formatBytes(storageUsage.totalBytes)} / {formatBytes(storageUsage.quotaBytes)}（
              {(storageUsage.ratio * 100).toFixed(1)}%）。
              {storageUsage.warn && (
                <strong className="meta-warn"> 空间接近上限：保存可能失败，请清理岗位记录或在「资料」页导出后留底。</strong>
              )}
            </p>
            <ul className="storage-list">
              {storageUsage.keys.slice(0, 6).map((k) => (
                <li key={k.key}>
                  <span className="storage-key">{k.key}</span>
                  <span className="storage-bytes">{formatBytes(k.bytes)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">AI 模型</h3>
        <ProviderSettingsForm />
      </section>

      <section className="card">
        <h3 className="card-title">开发者</h3>
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.showDev}
            onChange={(e) => updatePrefs({ showDev: e.target.checked })}
          />
          <span>显示执行轨迹与字段调试信息</span>
        </label>
        <TraceViewer devMode={prefs.showDev} />
      </section>
    </main>
  );

  return (
    <div className="app">
      <Header subtitle={subtitle} />
      {tab === "apply" && applyView}
      {tab === "jobs" && jobsView}
      {tab === "profile" && profileView}
      {tab === "settings" && settingsView}
      <TabBar tab={tab} onChange={setTab} badge={anyPending} />

      {showConfirm && (
        <FillConfirmDialog
          candidates={[
            ...confirmTargets.map((c) => ({ ...c, confirmed: true })),
            ...candidates.filter((c) => c.status === "manual"),
          ]}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => void handleFillConfirmed()}
        />
      )}
    </div>
  );
}
