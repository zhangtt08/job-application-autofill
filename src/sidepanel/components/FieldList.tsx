import { rawFieldKey } from "../../types/field";
import { useState } from "react";
import type { CandidateField } from "../../types/field";
import { FieldCard } from "./FieldCard";

export interface FieldListProps {
  candidates: CandidateField[];
  devMode: boolean;
  onToggleConfirm: (reference: string) => void;
  onEditValue: (reference: string, value: string) => void;
  onIgnore: (reference: string) => void;
  onUnignore?: (reference: string) => void;
  onSwitchField?: (reference: string, fieldId: string) => void;
  onConfirmLowConfidence?: (reference: string) => void;
  onBlockOnSite?: (reference: string) => void;
  onUndoSiteRule?: (ruleId: string) => void;
  siteHost?: string;
  onLocate: (reference: string) => void;
  onGenerateAnswer?: (reference: string) => void;
  onRevalidateAnswer?: (reference: string) => void;
}

const STATUS_ORDER: Record<string, number> = {
  "need-confirm": 0,
  ready: 1,
  manual: 2,
  failed: 3,
  unsupported: 4,
  unknown: 5,
  "low-confidence": 6,
  empty: 7,
  ignored: 8,
  filled: 9,
  skipped: 10,
};

/** 按「用户要做什么」分桶 —— 这是理解成本最低的分组方式 */
type BucketId = "unfilled" | "filled" | "ignored";
const BUCKETS: { id: BucketId; label: string }[] = [
  { id: "unfilled", label: "未填写" },
  { id: "filled", label: "已填写" },
  { id: "ignored", label: "已忽略" },
];
function bucketOf(c: CandidateField): BucketId {
  return c.status === "filled" ? "filled" : c.status === "ignored" ? "ignored" : "unfilled";
}

function sortByStatus(list: CandidateField[]): CandidateField[] {
  return [...list].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
}

/** 默认展开未填写项，已填写项按需核对。 */
export function FieldList(props: FieldListProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({ unfilled: true, filled: false, ignored: false });
  const [editing, setEditing] = useState<{ key: string; bucket: BucketId } | null>(null);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  /**
   * 哪些卡片压成一行：状态是可填写/已填写、且不是开放题、也不是「用户可改内容的长文本」。
   * 客观信息（姓名、手机号、学校）没什么可看的，一行足够；
   * 长文本与开放题是「值得核对」的内容，保持完整卡片。
   */
  const isCompact = (c: CandidateField): boolean => c.status === "filled" || (!c.openAnswer && c.value?.editable !== true && c.status !== "low-confidence");

  const renderCards = (list: CandidateField[]) =>
    sortByStatus(list).map((c) => (
      <FieldCard
        key={rawFieldKey(c.raw)}
        candidate={c}
        devMode={props.devMode}
        compact={isCompact(c)}
        onToggleConfirm={props.onToggleConfirm}
        onEditValue={props.onEditValue}
        onIgnore={props.onIgnore}
        onUnignore={props.onUnignore}
        onSwitchField={props.onSwitchField}
        onConfirmLowConfidence={props.onConfirmLowConfidence}
        onBlockOnSite={props.onBlockOnSite}
        onUndoSiteRule={props.onUndoSiteRule}
        siteHost={props.siteHost}
        onLocate={props.onLocate}
        onGenerateAnswer={props.onGenerateAnswer}
        onRevalidateAnswer={props.onRevalidateAnswer}
      />
    ));

  // issue-004：被语境门禁排除的控件不进任何填写桶，也绝不显示「请人工填写」——
  // 那会把一个登录框伪装成待填的申请字段（§二十）。Dev 模式下仍可展开看排除原因。
  const excludedCards = props.candidates.filter((c) => c.status === "excluded");
  const pool = props.candidates.filter((c) => c.status !== "excluded");

  // 编辑时暂缓移到另一分组，避免每敲一个字就重挂载文本框、丢失焦点。
  const buckets = BUCKETS.map((b) => ({ ...b, key: b.id, list: pool.filter((c) => (editing?.key === rawFieldKey(c.raw) ? editing.bucket : bucketOf(c)) === b.id) }))
    .filter((b) => b.list.length > 0);

  return (
    <div className="field-list"
      onFocusCapture={(event) => {
        const key = (event.target as HTMLElement).closest<HTMLElement>("[data-field-key]")?.dataset.fieldKey;
        const candidate = pool.find((c) => rawFieldKey(c.raw) === key);
        if (key && candidate) setEditing((prev) => prev?.key === key ? prev : { key, bucket: bucketOf(candidate) });
      }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(null); }}
    >
      {props.devMode && excludedCards.length > 0 && (
        <div className="fold" data-excluded-count={excludedCards.length}>
          <div className="fold-note">
            已忽略 {excludedCards.length} 个网页控件——它们不属于申请表单（登录 / 搜索 / 导航等全局区域）
          </div>
          {props.devMode && renderCards(excludedCards)}
        </div>
      )}

      {buckets.map((b) => {
        const isOpen = open[b.key] ?? false;
        return (
          <section key={b.key} className={`fold fold-${b.id}`}>
            <button type="button" className="fold-head" aria-expanded={isOpen} onClick={() => toggle(b.key)}>
              <span className={`fold-caret ${isOpen ? "open" : ""}`}>▸</span>
              <span className="fold-label">{b.label}</span>
              <span className="fold-count">{b.list.length}</span>
            </button>
            {isOpen && (
              <div className="fold-body">
                {renderCards(b.list)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
