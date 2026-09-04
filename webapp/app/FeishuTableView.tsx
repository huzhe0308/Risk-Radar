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

export default function FeishuTableView({ token }: { token: string }) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [tables, setTables] = useState<{ tableId: string; count: number }[]>([]);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      setFieldNames(payload.fieldNames || []);
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

  const filteredRecords = search
    ? records.filter((r) => {
        const fields = extractFields(r.rawPayload);
        const haystack = [r.recordId, r.action, ...Object.values(fields)].map(formatValue).join(" ").toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : records;

  const tableFilteredRecords = tableFilter === "all"
    ? filteredRecords
    : filteredRecords.filter((r) => (r.tableId || "(未知表格)") === tableFilter);

  const visibleFieldNames = tableFilter === "all"
    ? fieldNames
    : Array.from(
        new Set(
          tableFilteredRecords.flatMap((r) => {
            const fields = extractFields(r.rawPayload);
            return Object.keys(fields);
          })
        )
      ).sort();

  const tableRows = tableFilteredRecords.filter((r) => r.action !== "delete");

  function shortTableId(id: string | null): string {
    if (!id) return "—";
    if (id.length <= 16) return id;
    return id.slice(0, 8) + "…" + id.slice(-4);
  }

  return (
    <div className="feishu-table-view">
      <div className="feishu-table-toolbar">
        <div className="feishu-table-mode-switch">
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>表格视图</button>
          <button className={viewMode === "log" ? "active" : ""} onClick={() => setViewMode("log")}>同步日志</button>
        </div>
        <select
          className="feishu-table-filter"
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
        >
          <option value="all">全部表格 ({records.length})</option>
          {tables.map((t) => (
            <option key={t.tableId} value={t.tableId}>
              {shortTableId(t.tableId)} ({t.count})
            </option>
          ))}
        </select>
        <input
          className="feishu-table-search"
          type="text"
          placeholder="搜索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="feishu-table-count">
          {viewMode === "table" ? `${tableRows.length} 条数据` : `${tableFilteredRecords.length} 条日志`}
        </span>
        <button className="button button-outline" onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error && <p className="feishu-table-error">{error}</p>}

      {!loading && tableFilteredRecords.length === 0 && !error && (
        <div className="feishu-table-empty">
          <p>暂无飞书同步记录。</p>
          <p className="feishu-table-empty-hint">请在飞书多维表格中配置自动化推送，数据变更后会自动同步到这里。</p>
        </div>
      )}

      {viewMode === "table" && tableRows.length > 0 && (
        <div className="feishu-table-scroll">
          <table className="raw-table feishu-records-table feishu-clean-table">
            <thead>
              <tr>
                <th className="feishu-source-col">来源表格</th>
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
                      <td className="feishu-source-col" title={r.tableId || ""}>{shortTableId(r.tableId)}</td>
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
                        <td colSpan={visibleFieldNames.length + 2}>
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

      {viewMode === "log" && tableFilteredRecords.length > 0 && (
        <div className="feishu-table-scroll">
          <table className="raw-table feishu-records-table feishu-log-table">
            <thead>
              <tr>
                <th>接收时间</th>
                <th>动作</th>
                <th>记录 ID</th>
                <th>来源表格</th>
                {visibleFieldNames.map((fn) => (
                  <th key={fn}>{fn}</th>
                ))}
                <th>状态</th>
                <th className="feishu-action-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {tableFilteredRecords.map((r) => {
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
                      <td className="feishu-source-col" title={r.tableId || ""}>{shortTableId(r.tableId)}</td>
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
                        <td colSpan={visibleFieldNames.length + 7}>
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
