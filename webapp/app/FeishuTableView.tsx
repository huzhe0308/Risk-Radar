"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  if (!id) return "项目表";
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "…" + id.slice(-4);
}

function resolveTableKey(r: SyncRecord): string {
  if (r.tableId) return r.tableId;
  const payload = r.rawPayload as Record<string, unknown> | null;
  if (payload) {
    const rawType = formatValue(payload.type || payload.record_type);
    if (rawType && !["project", "milestone"].includes(rawType.toLowerCase())) return rawType;
  }
  return "(项目表)";
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
  const [menuOpenTid, setMenuOpenTid] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTids, setSelectedTids] = useState<Set<string>>(new Set());
  const [tableOrder, setTableOrder] = useState<string[] | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const dragTid = useRef<string | null>(null);
  const dragOverTid = useRef<string | null>(null);

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
    ? records.filter((r) => resolveTableKey(r) === selectedTable)
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
      )
      .filter((fn) =>
        tableRecords.some((r) => {
          const fields = extractFields(r.rawPayload);
          return formatValue(fields[fn]) !== "";
        })
      )
      .sort()
    : [];

  const tableRows = filteredRecords.filter((r) => r.action !== "delete");

  function lastSyncTime(tid: string): string {
    const rec = records.find((r) => resolveTableKey(r) === tid);
    return rec ? new Date(rec.receivedAt).toLocaleString("zh-CN") : "—";
  }

  function tableDisplayName(tid: string): string {
    if (tid === "(项目表)") return "项目表";
    return tid;
  }

  const orderedTables = tableOrder
    ? tableOrder.map((tid) => tables.find((t) => t.tableId === tid)).filter(Boolean) as { tableId: string; count: number }[]
    : tables;

  async function deleteTableRecords(tid: string) {
    setBatchDeleting(true);
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const response = await fetch(`/api/feishu/records?${params}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableKey: tid }),
      });
      if (!response.ok) throw new Error("删除失败");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBatchDeleting(false);
    }
  }

  async function deleteSelectedTables() {
    const tids = Array.from(selectedTids);
    if (tids.length === 0) return;
    if (!window.confirm(`确认删除选中的 ${tids.length} 个表格的所有记录？此操作不可撤销。`)) return;
    setBatchDeleting(true);
    try {
      for (const tid of tids) {
        await deleteTableRecords(tid);
      }
      setSelectedTids(new Set());
      setSelectMode(false);
    } finally {
      setBatchDeleting(false);
    }
  }

  function toggleSelect(tid: string) {
    setSelectedTids((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  }

  function handleDragStart(tid: string) {
    dragTid.current = tid;
  }

  function handleDragOver(e: React.DragEvent, tid: string) {
    e.preventDefault();
    dragOverTid.current = tid;
  }

  function handleDrop(tid: string) {
    const from = dragTid.current;
    if (!from || from === tid) return;
    const currentOrder = tableOrder || tables.map((t) => t.tableId);
    const fromIdx = currentOrder.indexOf(from);
    const toIdx = currentOrder.indexOf(tid);
    if (fromIdx < 0 || toIdx < 0) return;
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, from);
    setTableOrder(newOrder);
    dragTid.current = null;
    dragOverTid.current = null;
  }

  /* ---------- Table selection page ---------- */
  if (!selectedTable) {
    return (
      <div className="feishu-table-view">
        <div className="feishu-table-toolbar">
          <span className="feishu-table-count">{tables.length} 个表格 · {records.length} 条记录</span>
          {selectMode ? (
            <>
              <span className="feishu-select-info">已选 {selectedTids.size} 个</span>
              <button
                className="button button-outline"
                disabled={selectedTids.size === 0 || batchDeleting}
                onClick={() => void deleteSelectedTables()}
              >
                {batchDeleting ? "删除中…" : "删除选中"}
              </button>
              <button className="button button-outline" onClick={() => { setSelectMode(false); setSelectedTids(new Set()); }}>
                取消
              </button>
            </>
          ) : (
            <button className="button button-outline" onClick={() => setSelectMode(true)} disabled={tables.length === 0}>
              多选
            </button>
          )}
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
          {orderedTables.map((t) => (
            <div
              key={t.tableId}
              className={`feishu-table-card ${selectMode && selectedTids.has(t.tableId) ? "selected" : ""}`}
              draggable={!selectMode}
              onDragStart={() => handleDragStart(t.tableId)}
              onDragOver={(e) => handleDragOver(e, t.tableId)}
              onDrop={() => handleDrop(t.tableId)}
              onClick={() => {
                if (selectMode) {
                  toggleSelect(t.tableId);
                } else {
                  setSelectedTable(t.tableId);
                  setSearch("");
                  setExpandedId(null);
                  setViewMode("table");
                }
              }}
            >
              {!selectMode && (
                <button
                  className="feishu-card-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenTid(menuOpenTid === t.tableId ? null : t.tableId);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
              )}
              {selectMode && (
                <div className={`feishu-card-checkbox ${selectedTids.has(t.tableId) ? "checked" : ""}`} />
              )}
              {menuOpenTid === t.tableId && (
                <div className="feishu-card-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="feishu-card-menu-item"
                    onClick={() => {
                      setMenuOpenTid(null);
                      setSelectMode(true);
                      setSelectedTids(new Set([t.tableId]));
                    }}
                  >
                    多选删除
                  </button>
                  <button
                    className="feishu-card-menu-item feishu-card-menu-danger"
                    disabled={batchDeleting}
                    onClick={() => {
                      setMenuOpenTid(null);
                      if (window.confirm(`确认删除表格「${tableDisplayName(t.tableId)}」的所有记录？此操作不可撤销。`)) {
                        void deleteTableRecords(t.tableId);
                      }
                    }}
                  >
                    {batchDeleting ? "删除中…" : "删除此表格"}
                  </button>
                </div>
              )}
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
                <div className="feishu-table-card-id" title={t.tableId}>{t.tableId === "(项目表)" ? "" : t.tableId}</div>
              </div>
            </div>
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
