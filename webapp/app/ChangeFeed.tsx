"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

type SyncRecord = {
  id: number;
  recordId: string;
  tableId: string | null;
  action: string | null;
  rawPayload: unknown;
  receivedAt: string;
  processed: boolean;
  error: string | null;
};

type RecordsResponse = {
  records: SyncRecord[];
  fieldNames: string[];
  count: number;
};

function extractFields(rawPayload: unknown): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== "object") return {};
  const payload = rawPayload as Record<string, unknown>;
  if (payload.fields && typeof payload.fields === "object" && !Array.isArray(payload.fields)) {
    return payload.fields as Record<string, unknown>;
  }
  const { record_id, recordId, table_id, tableId, action, event_type, type_event, type, record_type, fields, ...rest } = payload;
  return rest;
}

function stripBraces(s: string): string {
  let v = s.trim();
  while (v.startsWith("{{") && v.endsWith("}}")) v = v.slice(2, -2).trim();
  while (v.startsWith("{") && v.endsWith("}") && v.length > 2) v = v.slice(1, -1).trim();
  return v;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((v) => typeof v === "object" ? JSON.stringify(v) : stripBraces(String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return stripBraces(String(value));
}

type FieldDiff = {
  field: string;
  oldValue: string;
  newValue: string;
  type: "added" | "removed" | "changed";
};

type ChangeItem = {
  record: SyncRecord;
  diffs: FieldDiff[];
  prevRecord: SyncRecord | null;
};

const READ_KEY = "feishu-change-feed-read-id";
const POLL_INTERVAL = 30000;

export function ChangeFeed({ token }: { token: string }) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [lastReadId, setLastReadId] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterTableId, setFilterTableId] = useState<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(READ_KEY);
    if (stored) setLastReadId(Number(stored) || 0);
  }, []);

  const markAllRead = useCallback(() => {
    if (records.length === 0) return;
    const maxId = records.reduce((max, r) => Math.max(max, r.id), 0);
    setLastReadId(maxId);
    window.localStorage.setItem(READ_KEY, String(maxId));
  }, [records]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const response = await fetch(`/api/feishu/records${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const payload: RecordsResponse = await response.json();
      if (!response.ok) throw new Error((payload as unknown as { error?: string }).error || "加载失败");
      setRecords((payload.records || []).slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      return;
    }
    pollingRef.current = setInterval(() => void load(), POLL_INTERVAL);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [autoRefresh, load]);

  const tableIds = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => { if (r.tableId) set.add(r.tableId); });
    return Array.from(set).sort();
  }, [records]);

  const changes: ChangeItem[] = useMemo(() => {
    const byRecordId = new Map<string, SyncRecord[]>();
    for (const r of records) {
      const list = byRecordId.get(r.recordId) || [];
      list.push(r);
      byRecordId.set(r.recordId, list);
    }

    const result: ChangeItem[] = [];
    const sorted = [...records].sort((a, b) => b.id - a.id);

    for (const record of sorted) {
      const history = (byRecordId.get(record.recordId) || []).sort((a, b) => a.id - b.id);
      const idx = history.findIndex((r) => r.id === record.id);
      const prevRecord = idx > 0 ? history[idx - 1] : null;

      const diffs: FieldDiff[] = [];
      const currentFields = extractFields(record.rawPayload);

      if (prevRecord) {
        const prevFields = extractFields(prevRecord.rawPayload);
        const allKeys = new Set([...Object.keys(prevFields), ...Object.keys(currentFields)]);
        for (const key of allKeys) {
          const oldVal = formatValue(prevFields[key]);
          const newVal = formatValue(currentFields[key]);
          if (oldVal === newVal) continue;
          if (!oldVal && newVal) diffs.push({ field: key, oldValue: "", newValue: newVal, type: "added" });
          else if (oldVal && !newVal) diffs.push({ field: key, oldValue: oldVal, newValue: "", type: "removed" });
          else diffs.push({ field: key, oldValue: oldVal, newValue: newVal, type: "changed" });
        }
      } else {
        for (const [key, val] of Object.entries(currentFields)) {
          const v = formatValue(val);
          if (v) diffs.push({ field: key, oldValue: "", newValue: v, type: "added" });
        }
      }

      result.push({ record, diffs, prevRecord });
    }
    return result;
  }, [records]);

  const filteredChanges = useMemo(() => {
    if (!filterTableId) return changes;
    return changes.filter((c) => c.record.tableId === filterTableId);
  }, [changes, filterTableId]);

  const unreadCount = useMemo(
    () => changes.filter((c) => c.record.id > lastReadId).length,
    [changes, lastReadId],
  );

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const actionLabel = (action: string | null): string => {
    if (!action) return "变更";
    switch (action.toLowerCase()) {
      case "create": case "created": return "新增";
      case "update": case "updated": case "edit": case "edited": return "修改";
      case "delete": case "deleted": return "删除";
      default: return action;
    }
  };

  const actionColor = (action: string | null): string => {
    const a = (action || "").toLowerCase();
    if (a === "create" || a === "created") return "#059669";
    if (a === "delete" || a === "deleted") return "#dc2626";
    return "#2563eb";
  };

  const recordName = (rawPayload: unknown): string => {
    const fields = extractFields(rawPayload);
    const name = fields["项目名称"] || fields["项目ID"] || fields["name"] || fields["project_id"] || fields["项目"] || "";
    const v = formatValue(name);
    return v || "未命名记录";
  };

  if (loading) {
    return <div className="change-feed-loading">加载变更提醒中…</div>;
  }

  return (
    <div className="change-feed">
      <div className="change-feed-header">
        <div className="change-feed-title">
          <h3>变更提醒</h3>
          {unreadCount > 0 && <span className="change-feed-badge">{unreadCount}</span>}
        </div>
        <div className="change-feed-controls">
          {tableIds.length > 1 && (
            <select className="change-feed-filter" value={filterTableId} onChange={(e) => setFilterTableId(e.target.value)}>
              <option value="">全部子表</option>
              {tableIds.map((t) => <option key={t} value={t}>{t.slice(0, 12)}</option>)}
            </select>
          )}
          <label className="change-feed-auto">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <span>自动刷新</span>
          </label>
          {unreadCount > 0 && <button className="change-feed-mark-read" onClick={markAllRead}>全部标为已读</button>}
          <button className="change-feed-refresh" onClick={() => void load()}>刷新</button>
        </div>
      </div>

      {error && <div className="change-feed-error">{error}</div>}

      {filteredChanges.length === 0 && !error && (
        <div className="change-feed-empty">
          <p>暂无变更记录</p>
          <small>飞书多维表格配置 webhook 后，数据变更会自动出现在这里</small>
        </div>
      )}

      <div className="change-feed-list">
        {filteredChanges.map(({ record, diffs, prevRecord }) => {
          const isUnread = record.id > lastReadId;
          const isExpanded = expandedId === record.id;
          const action = actionLabel(record.action);
          const aColor = actionColor(record.action);
          const name = recordName(record.rawPayload);
          const keyDiffs = diffs.slice(0, 3);
          const extraDiffs = diffs.length - keyDiffs.length;

          return (
            <div
              key={record.id}
              className={`change-feed-item ${isUnread ? "unread" : ""} ${isExpanded ? "expanded" : ""}`}
              onClick={() => setExpandedId(isExpanded ? null : record.id)}
            >
              <div className="change-feed-item-main">
                <span className="change-feed-dot" style={{ background: aColor }} />
                <div className="change-feed-item-content">
                  <div className="change-feed-item-header">
                    <span className="change-feed-action" style={{ color: aColor }}>{action}</span>
                    <span className="change-feed-name">{name}</span>
                    {record.tableId && <span className="change-feed-table">{record.tableId.slice(0, 10)}</span>}
                    <span className="change-feed-time">{fmtTime(record.receivedAt)}</span>
                  </div>
                  {keyDiffs.length > 0 && (
                    <div className="change-feed-diffs">
                      {keyDiffs.map((d, i) => (
                        <span key={i} className={`change-feed-diff change-feed-diff-${d.type}`}>
                          <span className="change-feed-diff-field">{d.field}</span>
                          {d.type === "changed" ? (
                            <span className="change-feed-diff-values">
                              <span className="change-feed-diff-old">{d.oldValue}</span>
                              <span className="change-feed-diff-arrow">→</span>
                              <span className="change-feed-diff-new">{d.newValue}</span>
                            </span>
                          ) : d.type === "added" ? (
                            <span className="change-feed-diff-new">+ {d.newValue}</span>
                          ) : (
                            <span className="change-feed-diff-old">- {d.oldValue}</span>
                          )}
                        </span>
                      ))}
                      {extraDiffs > 0 && <span className="change-feed-diff-more">还有 {extraDiffs} 项变更…</span>}
                    </div>
                  )}
                </div>
                {isUnread && <span className="change-feed-unread-dot" />}
              </div>
              {isExpanded && (
                <div className="change-feed-item-detail">
                  <div className="change-feed-detail-meta">
                    <span>记录 ID: {record.recordId}</span>
                    {record.tableId && <span>子表: {record.tableId}</span>}
                    <span>时间: {new Date(record.receivedAt).toLocaleString("zh-CN")}</span>
                    {prevRecord && <span>对比上一条: {new Date(prevRecord.receivedAt).toLocaleString("zh-CN")}</span>}
                  </div>
                  {diffs.length > 0 ? (
                    <table className="change-feed-diff-table">
                      <thead>
                        <tr><th>字段</th><th>旧值</th><th>新值</th><th>类型</th></tr>
                      </thead>
                      <tbody>
                        {diffs.map((d, i) => (
                          <tr key={i} className={`diff-row-${d.type}`}>
                            <td className="diff-cell-field">{d.field}</td>
                            <td className="diff-cell-old">{d.oldValue || "—"}</td>
                            <td className="diff-cell-new">{d.newValue || "—"}</td>
                            <td className="diff-cell-type">
                              <span className={`diff-type-badge diff-type-${d.type}`}>
                                {d.type === "added" ? "新增" : d.type === "removed" ? "删除" : "修改"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="change-feed-no-diff">无字段级变更（可能是重复推送或仅触发动作）</p>
                  )}
                  <details className="change-feed-raw-json">
                    <summary>查看原始 JSON</summary>
                    <pre>{JSON.stringify(record.rawPayload, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
