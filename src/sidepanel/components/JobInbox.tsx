import { useEffect, useState } from "react";
import { deleteJobCascade, filterInbox, listJobs } from "../../workspace/jobRepository";
import { deleteEventsByJob, deleteSessionsByJob, loadSessionsPublic } from "../../workspace/workspaceRepository";
import { JOB_STATUS_LABELS, type ApplicationSessionV2, type JobRecord } from "../../workspace/types";

export function JobInbox(p: { onOpenJob: (jobId: string) => void; refreshKey: number }) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [sessions, setSessions] = useState<ApplicationSessionV2[]>([]);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void Promise.all([listJobs(), loadSessionsPublic()]).then(([records, history]) => {
      setJobs(records);
      setSessions(history);
    }).catch(() => setError("无法读取记录，请重试。"));
  }, [p.refreshKey]);

  const remove = async (id: string) => {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteSessionsByJob(id);
      await deleteEventsByJob(id);
      await deleteJobCascade(id);
      setJobs((prev) => prev.filter((job) => job.id !== id));
      setSessions((prev) => prev.filter((session) => session.jobId !== id));
      setConfirmDelete(null);
    } catch {
      setError("删除失败，请重试。");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = filterInbox(jobs, { view: "all", search, includeArchived: true });
  return (
    <main className="main inbox">
      {error && <div role="alert" className="banner banner-error">{error}</div>}
      <input className="inbox-search" aria-label="搜索记录" placeholder="搜索公司 / 岗位" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 && <div className="empty-records">{jobs.length ? "没有匹配的记录" : "暂无申请记录"}</div>}
      <div className="inbox-list">
        {filtered.map((job) => {
          const latest = sessions.find((session) => session.jobId === job.id);
          const fillLabel = latest?.status === "filled" ? "已填写" : latest?.fillPlanSummary ? "部分已填写" : "未填写";
          return (
            <article key={job.id} className="record-item">
              <button type="button" className="record-open" onClick={() => p.onOpenJob(job.id)}>
                <strong>{job.company ? `${job.company} · ` : ""}{job.position || "申请记录"}</strong>
                <span className="record-meta">
                  <span className={latest?.status === "filled" ? "count-filled" : "count-unfilled"}>{fillLabel}</span>
                  {job.status !== "saved" && <span>{JOB_STATUS_LABELS[job.status]}</span>}
                  <time>{new Date(job.updatedAt).toLocaleDateString("zh-CN")}</time>
                </span>
              </button>
              {confirmDelete === job.id ? (
                <div className="record-delete">
                  <span>同时删除申请记录？</span>
                  <button type="button" className="btn-sm danger" disabled={deleting} onClick={() => void remove(job.id)}>确认删除</button>
                  <button type="button" className="btn-sm" disabled={deleting} onClick={() => setConfirmDelete(null)}>取消</button>
                </div>
              ) : (
                <button type="button" className="btn-sm danger" aria-label={`删除 ${job.position}`} onClick={() => setConfirmDelete(job.id)}>删除</button>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
