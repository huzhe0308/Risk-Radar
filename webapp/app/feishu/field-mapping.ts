import type { Milestone, Project } from "../types";

export type RecordType = "project" | "milestone";

export type NormalizedPayload = {
  recordId: string;
  type: RecordType;
  fields: Record<string, unknown>;
  action: "create" | "update" | "delete";
  tableId: string;
};

const PROJECT_ALIASES: Array<[string[], keyof Project]> = [
  [["项目名称", "项目名", "project_name", "name", "title"], "name"],
  [["项目标签", "标签", "project_tag", "tag"], "tag"],
  [["项目ID", "project_id", "uuid"], "uuid"],
  [["项目备注", "备注", "detail_remark", "detailRemark", "description"], "detailRemark"],
  [["视图", "视图ID", "view_id", "viewId", "view"], "viewId"],
  [["背景色", "bg_color", "bgColor"], "bgColor"],
  [["文字色", "文字颜色", "text_color", "textColor"], "textColor"],
];

const MILESTONE_ALIASES: Array<[string[], keyof Milestone]> = [
  [["里程碑名称", "里程碑", "milestone_name", "remark", "name"], "remark"],
  [["迭代", "版本", "iteration", "version"], "iteration"],
  [["发布日期", "里程碑日期", "日期", "release_date", "releaseDate", "deadline", "date"], "releaseDate"],
  [["备注", "remark", "note"], "remark"],
  [["详细备注", "detail_remark", "detailRemark"], "detailRemark"],
  [["颜色", "color"], "color"],
  [["文字颜色", "文字色", "text_color", "textColor"], "textColor"],
  [["形状", "shape"], "shape"],
];

const MILESTONE_INDICATORS = ["里程碑", "milestone", "迭代", "iteration", "发布日期", "release_date"];

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function pickValue(
  fields: Record<string, unknown>,
  aliases: string[],
): unknown {
  const exact = aliases.find((a) => a in fields && fields[a] !== undefined && fields[a] !== null && fields[a] !== "");
  if (exact) return fields[exact];

  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(fields)) {
    normalized.set(normalizeKey(k), v);
  }
  for (const a of aliases) {
    const n = normalizeKey(a);
    const v = normalized.get(n);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function inferType(fields: Record<string, unknown>): RecordType {
  const keys = Object.keys(fields).map(normalizeKey);
  if (keys.some((k) => MILESTONE_INDICATORS.some((ind) => normalizeKey(ind) === k || k.includes(normalizeKey(ind))))) {
    return "milestone";
  }
  return "project";
}

function toString(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function toDateStr(value: unknown): string {
  const raw = toString(value);
  if (!raw) return "";
  const dateMatch = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function toBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = toString(value).toLowerCase();
  if (["true", "1", "yes", "是"].includes(s)) return true;
  if (["false", "0", "no", "否"].includes(s)) return false;
  return undefined;
}

function toInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : undefined;
}

export function normalizePayload(raw: Record<string, unknown>): NormalizedPayload {
  const recordId = toString(raw.record_id || raw.recordId || raw.recordId_ || raw["记录ID"]);
  const tableId = toString(raw.table_id || raw.tableId || raw.tableId_ || raw["数据表ID"]);
  const actionRaw = toString(raw.action || raw.event_type || raw.type_event || raw["事件类型"]).toLowerCase();
  const action: NormalizedPayload["action"] = actionRaw.includes("delete") ? "delete" : actionRaw.includes("create") ? "create" : "update";

  const fields: Record<string, unknown> =
    raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)
      ? { ...(raw.fields as Record<string, unknown>) }
      : { ...raw };

  delete fields.record_id;
  delete fields.recordId;
  delete fields.table_id;
  delete fields.tableId;
  delete fields.action;
  delete fields.event_type;
  delete fields.type_event;
  delete fields.fields;

  const declaredType = toString(raw.type || raw.record_type || raw["记录类型"]).toLowerCase();
  const type: RecordType = declaredType.includes("milestone")
    ? "milestone"
    : declaredType.includes("project")
      ? "project"
      : inferType(fields);

  return { recordId, type, fields, action, tableId };
}

export function mapToProject(payload: NormalizedPayload, fallbackUuid?: string): Partial<Project> {
  const f = payload.fields;
  const result: Partial<Project> = {};

  for (const [aliases, field] of PROJECT_ALIASES) {
    const v = pickValue(f, aliases);
    if (v !== undefined) (result as Record<string, unknown>)[field] = toString(v);
  }

  if (!result.uuid) result.uuid = fallbackUuid || payload.recordId || "";
  if (!result.viewId) result.viewId = "Default";
  if (!result.tag) result.tag = "";

  const rowHeight = pickValue(f, ["行高", "row_height", "rowHeight"]);
  if (rowHeight !== undefined) result.rowHeight = toInt(rowHeight);

  const sep = pickValue(f, ["分隔线", "show_separator", "showSeparatorAbove"]);
  if (sep !== undefined) result.showSeparatorAbove = toBool(sep);

  return result;
}

export function mapToMilestone(payload: NormalizedPayload, fallbackProjectUuid?: string): Partial<Milestone> & { projectId?: string } {
  const f = payload.fields;
  const result: Partial<Milestone> & { projectId?: string } = {};

  for (const [aliases, field] of MILESTONE_ALIASES) {
    const v = pickValue(f, aliases);
    if (v !== undefined) {
      if (field === "releaseDate") {
        (result as Record<string, unknown>)[field] = toDateStr(v);
      } else {
        (result as Record<string, unknown>)[field] = toString(v);
      }
    }
  }

  if (!result.id) result.id = payload.recordId;
  if (!result.shape) result.shape = "diamond";

  const projectRef = pickValue(f, ["所属项目", "项目ID", "project_id", "projectId", "project_uuid"]);
  if (projectRef !== undefined) {
    result.projectId = toString(projectRef);
  } else if (fallbackProjectUuid) {
    result.projectId = fallbackProjectUuid;
  }

  const week = pickValue(f, ["周", "week"]);
  if (week !== undefined) result.week = toInt(week);

  const year = pickValue(f, ["年", "year"]);
  if (year !== undefined) result.year = toInt(year);

  return result;
}
