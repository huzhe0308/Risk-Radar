"use client";

import { useState, useEffect, useCallback } from "react";

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

const READ_KEY = "feishu-change-feed-read-id";

function safeParse(val: unknown): Record<string, unknown> {
  let obj = val;
  if (typeof obj === "string") {
    try { obj = JSON.parse(obj); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object") return {};
  return obj as Record<string, unknown>;
}

function getFields(rawPayload: unknown): Record<string, unknown> {
  const obj = safeParse(rawPayload);
  let f = obj.fields;
  if (typeof f === "string") {
    try { f = JSON.parse(f); } catch { f = undefined; }
  }
  if (f && typeof f === "object" && !Array.isArray(f)) return f as Record<string, unknown>;
  const { record_id, recordId, table_id, tableId, action, type, fields, ...rest } = obj;
  return rest;
}

function fmtVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => typeof x === "object" ? JSON.stringify(x) : String(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  let s = String(v).trim();
  while (s.startsWith("{{") && s.endsWith("}}")) s = s.slice(2, -2).trim();
  return s;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ChangeFeed({ token }: { token: string }) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastReadId, setLastReadId] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const s = localStorage.getItem(READ_KEY);
    if (s) setLastReadId(Number(s) || 0);
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const res = await fetch(`/api/feishu/records${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "加载失败");
      setRecords((data.records || []).slice(0, 50));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const markAllRead = () => {
    const maxId = records.reduce((m, r) => Math.max(m, r.id), 0);
    setLastReadId(maxId);
    localStorage.setItem(READ_KEY, String(maxId));
  };

  const unreadCount = records.filter((r) => r.id > lastReadId).length;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>加载中…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>变更提醒</h3>
          {unreadCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700 }}>{unreadCount}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {unreadCount > 0 && <button onClick={markAllRead} style={{ padding: "4px 12px", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 6, background: "rgba(6,182,212,0.06)", color: "#06b6d4", fontSize: 11, cursor: "pointer" }}>全部已读</button>}
          <button onClick={() => void load()} style={{ padding: "4px 12px", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 6, background: "rgba(15,23,42,0.6)", color: "#cbd5e1", fontSize: 11, cursor: "pointer" }}>刷新</button>
        </div>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

      {records.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
          <p>暂无变更记录</p>
        </div>
      )}

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {records.map((r) => {
          const fields = getFields(r.rawPayload);
          const fieldEntries = Object.entries(fields).filter(([, v]) => fmtVal(v));
          const isUnread = r.id > lastReadId;
          const isExpanded = expandedId === r.id;
          const action = r.action || "变更";
          const name = fmtVal(fields["项目"] || fields["项目名称"] || fields["项目ID"] || fields["name"]) || "未命名";

          return (
            <div
              key={r.id}
              onClick={() => setExpandedId(isExpanded ? null : r.id)}
              style={{
                border: `1px solid ${isUnread ? "rgba(6,182,212,0.3)" : "rgba(148,163,184,0.1)"}`,
                borderLeft: isUnread ? "3px solid #06b6d4" : undefined,
                borderRadius: 10,
                background: isUnread ? "rgba(6,182,212,0.04)" : "rgba(30,41,59,0.5)",
                cursor: "pointer",
                padding: "12px 14px",
              }}
            >
              {/* Row 1: action badge + name + time */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                  background: action.includes("create") || action.includes("新增") ? "rgba(5,150,105,0.15)" : action.includes("delete") || action.includes("删除") ? "rgba(220,38,38,0.15)" : "rgba(59,130,246,0.15)",
                  color: action.includes("create") || action.includes("新增") ? "#34d399" : action.includes("delete") || action.includes("删除") ? "#f87171" : "#60a5fa",
                }}>{action}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{name}</span>
                {r.tableId && <span style={{ fontSize: 10, color: "#64748b", background: "rgba(148,163,184,0.08)", padding: "2px 6px", borderRadius: 4 }}>{r.tableId.slice(0, 12)}</span>}
                <span style={{ fontSize: 11, color: "#64748b", marginLeft: "auto" }}>{fmtTime(r.receivedAt)}</span>
                {isUnread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 6px #06b6d4", flexShrink: 0 }} />}
              </div>

              {/* Row 2: field values */}
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {fieldEntries.slice(0, 4).map(([key, val]) => (
                  <span key={key} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(15,23,42,0.5)", color: "#cbd5e1" }}>
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>{key}: </span>
                    {fmtVal(val)}
                  </span>
                ))}
                {fieldEntries.length > 4 && <span style={{ fontSize: 10, color: "#64748b", padding: "3px 4px" }}>还有 {fieldEntries.length - 4} 项…</span>}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,0.1)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 10, color: "#475569" }}>
                    <span style={{ background: "rgba(148,163,184,0.08)", padding: "3px 8px", borderRadius: 4 }}>记录ID: {r.recordId}</span>
                    {r.tableId && <span style={{ background: "rgba(148,163,184,0.08)", padding: "3px 8px", borderRadius: 4 }}>子表: {r.tableId}</span>}
                    <span style={{ background: "rgba(148,163,184,0.08)", padding: "3px 8px", borderRadius: 4 }}>{new Date(r.receivedAt).toLocaleString("zh-CN")}</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "#64748b", borderBottom: "1px solid rgba(148,163,184,0.1)", fontSize: 11 }}>字段</th>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "#64748b", borderBottom: "1px solid rgba(148,163,184,0.1)", fontSize: 11 }}>值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldEntries.map(([key, val]) => (
                        <tr key={key}>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(148,163,184,0.05)", color: "#94a3b8", fontWeight: 600 }}>{key}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(148,163,184,0.05)", color: "#e2e8f0" }}>{fmtVal(val)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: "#475569" }}>查看原始 JSON</summary>
                    <pre style={{ background: "rgba(15,23,42,0.92)", color: "#67e8f9", padding: "10px 14px", borderRadius: 8, fontSize: 11, overflow: "auto", maxHeight: 300 }}>{JSON.stringify(r.rawPayload, null, 2)}</pre>
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
