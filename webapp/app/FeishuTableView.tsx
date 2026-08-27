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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "æ˜¯" : "å¦";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((v) => typeof v === "object" ? JSON.stringify(v) : String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function FeishuTableView({ token }: { token: string }) {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      const response = await fetch(`/api/feishu/records${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const payload: RecordsResponse = await response.json();
      if (!response.ok) throw new Error((payload as unknown as { error?: string }).error || "åŠ è½½å¤±è´¥");
      setRecords(payload.records || []);
      setFieldNames(payload.fieldNames || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "åŠ è½½å¤±è´¥");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRecords = search
    ? records.filter((r) => {
        const fields = extractFields(r.rawPayload);
        const haystack = [r.recordId, r.action, ...Object.values(fields)].map(formatValue).join(" ").toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : records;

  return (
    <div className="feishu-table-view">
      <div className="feishu-table-toolbar">
        <input
          className="feishu-table-search"
          type="text"
          placeholder="æœç´¢è®°å½•â€¦"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="feishu-table-count">{filteredRecords.length} æ¡è®°å½•</span>
        <button className="button button-outline" onClick={() => void load()} disabled={loading}>
          {loading ? "åˆ·æ–°ä¸­â€¦" : "åˆ·æ–°"}
        </button>
      </div>

      {error && <p className="feishu-table-error">{error}</p>}

      {!loading && filteredRecords.length === 0 && !error && (
        <div className="feishu-table-empty">
          <p>æš‚æ— é£žä¹¦åŒæ­¥è®°å½•ã€‚</p>
          <p className="feishu-table-empty-hint">è¯·åœ¨é£žä¹¦å¤šç»´è¡¨æ ¼ä¸­é…ç½®è‡ªåŠ¨åŒ–æŽ¨é€ï¼Œæ•°æ®å˜æ›´åŽä¼šè‡ªåŠ¨åŒæ­¥åˆ°è¿™é‡Œã€‚</p>
        </div>
      )}

      {filteredRecords.length > 0 && (
        <div className="feishu-table-scroll">
          <table className="raw-table feishu-records-table">
            <thead>
              <tr>
                <th>æŽ¥æ”¶æ—¶é—´</th>
                <th>åŠ¨ä½œ</th>
                <th>è®°å½• ID</th>
                {fieldNames.map((fn) => (
                  <th key={fn}>{fn}</th>
                ))}
                <th>çŠ¶æ€</th>
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
                      <td><span className="feishu-action-badge">{r.action || "â€”"}</span></td>
                      <td className="feishu-cell-id" title={r.recordId}>{r.recordId.length > 50 ? r.recordId.slice(0, 50) + "â€¦" : r.recordId}</td>
                      {fieldNames.map((fn) => (
                        <td key={fn}>{formatValue(fields[fn])}</td>
                      ))}
                      <td>
                        {r.processed ? (
                          <span className="feishu-status-ok">âœ“ æˆåŠŸ</span>
                        ) : (
                          <span className="feishu-status-fail" title={r.error || ""}>âœ— å¤±è´¥</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${r.id}-detail`} className="feishu-detail-row">
                        <td colSpan={fieldNames.length + 4}>
                          <div className="feishu-detail-content">
                            <h4>åŽŸå§‹ JSON æ•°æ®</h4>
                            <pre className="feishu-raw-json">{JSON.stringify(r.rawPayload, null, 2)}</pre>
                            {r.error && (
                              <div className="feishu-detail-error">
                                <strong>é”™è¯¯ä¿¡æ¯ï¼š</strong>{r.error}
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
