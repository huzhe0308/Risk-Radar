"use client";

import { useState, useEffect, useCallback } from "react";

type SyncRecord = {
  id: number;
  recordId: string;
  tableId: string | null;
  action: string | null;
  payloadHash: string | null;
  rawPayload: unknown;
  receivedAt: string;
  processed: boolean;
  error: string | null;
};

type RecordsResponse = {
  records: SyncRecord[];
  fieldNames: string[];
  tables: { tableId: string; count: number }[];
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
  while (v.startsWith("{{") && v.endsWith("}}")) {
    v = v.slice(2, -2).trim();
  }
  while (v.startsWith("{") && v.endsWith("}") && v.length > 2) {
    v = v.slice(1, -1).trim();
  }
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

function shortTableId(id: string | null): string {
  if (!id) return "未知表格";
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "…" + id.slice(-4);
}

export default function FeishuTableView({ token }: { token: string }) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [tables, setTables] = useState<{ tableId: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "log">("table");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const response = await fetch(`/api/feishu/records${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const payload: RecordsResponse = await response.json();
      if (!response.ok) throw new Error((payload as unknown as { error?: string }).error || "加载失败");
      setRecords(payload.records || []);
      setTables(payload.tables || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (recordDbId: number) => {
    if (!window.confirm("确认删除该记录？此操作不可撤销。")) return;
    setDeletingId(recordDbId);
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const response = await fetch(`/api/feishu/records?${params}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordDbId }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "删除失败");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const tableRecords = selectedTable
    ? records.filter((r) => (r.tableId || "(未知表格)") === selectedTable)
    : [];

  const filteredRecords = search && selectedTable
    ? tableRecords.filter((r) => {
        const fields = extractFields(r.rawPayload);
        const haystack = [r.recordId, r.action, ...Object.values(fields)].map(formatValue).join(" ").toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : tableRecords;

  const visibleFieldNames = selectedTable
    ? Array.from(
        new Set(
          tableRecords.flatMap((r) => {
            const fields = extractFields(r.rawPayload);
            return Object.keys(fields);
          })
        )
      ).sort()
    : [];

  const tableRows = filteredRecords.filter((r) => r.action !== "delete");

  function lastSyncTime(tid: string): string {
    const rec = records.find((r) => (r.tableId || "(未知表格)") === tid);
    return rec ? new Date(rec.receivedAt).toLocaleString("zh-CN") : "—";
  }

  function tableDisplayName(tid: string): string {
    const sample = records.find((r) => (r.tableId || "(未知表格)") === tid);
    if (sample) {
      const payload = sample.rawPayload as Record<string, unknown> | null;
      if (payload) {
        const nameFromPayload =
          payload.table_name || payload.tableName || payload["表格名称"] || payload["数据表名称"];
        if (nameFromPayload && typeof nameFromPayload === "string") return nameFromPayload;
      }
    }
    return shortTableId(tid);
  }

  /* ---------- Table selection page ---------- */
  if (!selectedTable) {
    return (
      <div className="feishu-table-view">
        <div className="feishu-table-toolbar">
          <span className="feishu-table-count">{tables.length} 个表格 · {records.length} 条记录</span>
          <button className="button button-outline" onClick={() => void load()} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>

        {error && <p className="feishu-table-error">{error}</p>}

        {!loading && records.length === 0 && !error && (
          <div className="feishu-table-empty">
            <p>暂无飞书同步记录。</p>
            <p className="feishu-table-empty-hint">请在飞书多维表格中配置自动化推送，数据变更后会自动同步到这里。</p>
          </div>
        )}

        <div className="feishu-table-card-grid">
          {tables.map((t) => (
            <button
              key={t.tableId}
              className="feishu-table-card"
              onClick={() => { setSelectedTable(t.tableId); setSearch(""); setExpandedId(null); setViewMode("table"); }}
            >
              <div className="feishu-table-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </div>
              <div className="feishu-table-card-info">
                <div className="feishu-table-card-name" title={t.tableId}>{tableDisplayName(t.tableId)}</div>
                <div className="feishu-table-card-meta">
                  <span>{t.count} 条记录</span>
                  <span>·</span>
                  <span>最近同步 {lastSyncTime(t.tableId)}</span>
                </div>
                <div className="feishu-table-card-id" title={t.tableId}>{t.tableId === "(未知表格)" ? "" : t.tableId}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- Table data page ---------- */
  return (
    <div className="feishu-table-view">
      <div className="feishu-table-toolbar">
        <button className="feishu-back-btn" onClick={() => setSelectedTable(null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回表格列表
        </button>
        <div className="feishu-table-mode-switch">
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>表格视图</button>
          <button className={viewMode === "log" ? "active" : ""} onClick={() => setViewMode("log")}>同步日志</button>
        </div>
        <input
          className="feishu-table-search"
          type="text"
          placeholder="搜索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="feishu-table-count">
          {viewMode === "table" ? `${tableRows.length} 条数据` : `${filteredRecords.length} 条日志`}
        </span>
        <button className="button button-outline" onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error && <p className="feishu-table-error">{error}</p>}

      {!loading && filteredRecords.length === 0 && !error && (
        <div className="feishu-table-empty">
          <p>该表格暂无记录。</p>
        </div>
      )}

      {viewMode === "table" && tableRows.length > 0 && (
        <div className="feishu-table-scroll">
          <table className="raw-table feishu-records-table feishu-clean-table">
            <thead>
              <tr>
                {visibleFieldNames.map((fn) => (
                  <th key={fn}>{fn}</th>
                ))}
                <th className="feishu-action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const fields = extractFields(r.rawPayload);
                const isExpanded = expandedId === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      {visibleFieldNames.map((fn) => (
                        <td key={fn}>{formatValue(fields[fn])}</td>
                      ))}
                      <td className="feishu-action-col" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="feishu-delete-btn"
                          disabled={deletingId === r.id}
                          onClick={() => void handleDelete(r.id)}
                        >
                          {deletingId === r.id ? "删除中…" : "删除"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${r.id}-detail`} className="feishu-detail-row">
                        <td colSpan={visibleFieldNames.length + 1}>
                          <div className="feishu-detail-content">
                            <div className="feishu-detail-meta">
                              <span>记录 ID: {r.recordId}</span>
                              {r.tableId && <span>子表 ID: {r.tableId}</span>}
                              <span>接收时间: {new Date(r.receivedAt).toLocaleString("zh-CN")}</span>
                              <span>动作: {r.action}</span>
                              <span>状态: {r.processed ? "成功" : "失败"}</span>
                            </div>
                            <h4>原始 JSON 数据</h4>
                            <pre className="feishu-raw-json">{JSON.stringify(r.rawPayload, null, 2)}</pre>
                            {r.error && (
                              <div className="feishu-detail-error">
                                <strong>错误信息:</strong>{r.error}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "log" && filteredRecords.length > 0 && (
        <div className="feishu-table-scroll">
          <table className="raw-table feishu-records-table feishu-log-table">
            <thead>
              <tr>
                <th>接收时间</th>
                <th>动作</th>
                <th>记录 ID</th>
                {visibleFieldNames.map((fn) => (
                  <th key={fn}>{fn}</th>
                ))}
                <th>状态</th>
                <th className="feishu-action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r) => {
                const fields = extractFields(r.rawPayload);
                const isExpanded = expandedId === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      className={r.processed ? "ok" : "fail"}
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      <td className="feishu-cell-time">{new Date(r.receivedAt).toLocaleString("zh-CN")}</td>
                      <td><span className="feishu-action-badge">{r.action || "—"}</span></td>
                      <td className="feishu-cell-id" title={r.recordId}>{r.recordId.length > 50 ? r.recordId.slice(0, 50) + "…" : r.recordId}</td>
                      {visibleFieldNames.map((fn) => (
                        <td key={fn}>{formatValue(fields[fn])}</td>
                      ))}
                      <td>
                        {r.processed ? (
                          <span className="feishu-status-ok">成功</span>
                        ) : (
                          <span className="feishu-status-fail" title={r.error || ""}>失败</span>
                        )}
                      </td>
                      <td className="feishu-action-col" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="feishu-delete-btn"
                          disabled={deletingId === r.id}
                          onClick={() => void handleDelete(r.id)}
                        >
                          {deletingId === r.id ? "…" : "删除"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${r.id}-detail`} className="feishu-detail-row">
                        <td colSpan={visibleFieldNames.length + 6}>
                          <div className="feishu-detail-content">
                            <h4>原始 JSON 数据</h4>
                            <pre className="feishu-raw-json">{JSON.stringify(r.rawPayload, null, 2)}</pre>
                            {r.error && (
                              <div className="feishu-detail-error">
                                <strong>错误信息:</strong>{r.error}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
