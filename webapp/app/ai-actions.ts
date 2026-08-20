import type { Connection, Milestone, PlanItem, Project, View } from "./types";

export type UpdateMilestoneAction = {
  type: "update_milestone";
  projectId: string;
  milestoneId: string;
  changes: Partial<Pick<Milestone, "iteration" | "releaseDate" | "remark" | "detailRemark" | "color" | "textColor" | "shape">>;
};

export type AddMilestoneAction = {
  type: "add_milestone";
  projectId: string;
  milestone: Pick<Milestone, "iteration" | "releaseDate"> & Partial<Pick<Milestone, "remark" | "detailRemark" | "color" | "textColor" | "shape">>;
};

export type UpdateProjectAction = {
  type: "update_project";
  projectId: string;
  changes: Partial<Pick<Project, "name" | "tag" | "detailRemark" | "bgColor" | "textColor" | "rowHeight">>;
};

export type UpdateViewAction = {
  type: "update_view";
  changes: Partial<Pick<View, "name" | "startDate" | "endDate" | "content" | "columnWidth">>;
};

export type AddConnectionAction = {
  type: "add_connection";
  fromProjectId: string;
  fromMilestoneId: string;
  toProjectId: string;
  toMilestoneId: string;
  style: Pick<Connection, "color" | "lineType" | "shape">;
};

export type UpdateConnectionAction = {
  type: "update_connection";
  connectionId: string;
  changes: Partial<Pick<Connection, "color" | "lineType" | "shape">>;
};

export type DeleteConnectionAction = { type: "delete_connection"; connectionId: string };

export type AddPlanItemAction = {
  type: "add_plan_item";
  item: Omit<PlanItem, "id">;
};

export type UpdatePlanItemAction = {
  type: "update_plan_item";
  itemId: string;
  changes: Partial<Pick<PlanItem, "x" | "y" | "width" | "height" | "text" | "color" | "fontSize">>;
};

export type DeletePlanItemAction = { type: "delete_plan_item"; itemId: string };

export type AiAction =
  | UpdateMilestoneAction
  | AddMilestoneAction
  | UpdateProjectAction
  | UpdateViewAction
  | AddConnectionAction
  | UpdateConnectionAction
  | DeleteConnectionAction
  | AddPlanItemAction
  | UpdatePlanItemAction
  | DeletePlanItemAction;

export type AiCommandResult = {
  reply: string;
  actions: AiAction[];
  summaries: string[];
  warnings: string[];
};

type ValidationResult = { result: AiCommandResult; rejected: string[] };

const MILESTONE_KEYS = new Set(["iteration", "releaseDate", "remark", "detailRemark", "color", "textColor", "shape"]);
const PROJECT_KEYS = new Set(["name", "tag", "detailRemark", "bgColor", "textColor", "rowHeight"]);
const VIEW_KEYS = new Set(["name", "startDate", "endDate", "content", "columnWidth"]);
const PLAN_ITEM_KEYS = new Set(["x", "y", "width", "height", "text", "color", "fontSize"]);
const LINE_TYPES = new Set(["thin-solid", "thin-dashed"]);
const SHAPES = new Set(["straight", "polyline"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, max = 2000, allowEmpty = false): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (allowEmpty || trimmed) && trimmed.length <= max ? trimmed : null;
}

function id(value: unknown): string | null {
  return text(value, 200);
}

function number(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function copyAllowedChanges(raw: unknown, allowed: Set<string>): Record<string, string | number> {
  const source = record(raw);
  if (!source) return {};
  const output: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    if (key === "releaseDate" && validDate(value)) output[key] = value;
    else if (key === "color" || key === "textColor" || key === "bgColor") {
      if (validColor(value)) output[key] = value;
    } else if ((key === "columnWidth" || key === "rowHeight") && typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else {
      const normalized = text(value, key === "detailRemark" || key === "content" ? 4000 : 240);
      if (normalized !== null) output[key] = normalized;
    }
  }
  if (typeof output.columnWidth === "number") output.columnWidth = Math.max(6, Math.min(300, output.columnWidth));
  if (typeof output.rowHeight === "number") output.rowHeight = Math.max(42, Math.min(180, output.rowHeight));
  return output;
}

function copyConnectionChanges(raw: unknown): UpdateConnectionAction["changes"] {
  const source = record(raw);
  if (!source) return {};
  const changes: UpdateConnectionAction["changes"] = {};
  if (validColor(source.color)) changes.color = source.color;
  if (typeof source.lineType === "string" && LINE_TYPES.has(source.lineType)) changes.lineType = source.lineType;
  if (typeof source.shape === "string" && SHAPES.has(source.shape)) changes.shape = source.shape as Connection["shape"];
  return changes;
}

function copyPlanItemChanges(raw: unknown, kind?: PlanItem["kind"]): UpdatePlanItemAction["changes"] {
  const source = record(raw);
  if (!source) return {};
  const changes: UpdatePlanItemAction["changes"] = {};
  for (const key of PLAN_ITEM_KEYS) {
    const value = source[key];
    if (key === "text") {
      const valueText = text(value, 4000, kind === "frame");
      if (valueText !== null) changes.text = valueText;
    } else if (key === "color" && validColor(value)) changes.color = value;
    else if (key === "fontSize") {
      const valueNumber = number(value, 10, 28);
      if (valueNumber !== null) changes.fontSize = valueNumber;
    } else if (key === "x" || key === "y") {
      const valueNumber = number(value, -2000, 10000);
      if (valueNumber !== null) changes[key] = valueNumber;
    } else if (key === "width") {
      const valueNumber = number(value, kind === "frame" ? 32 : 50, 4000);
      if (valueNumber !== null) changes.width = valueNumber;
    } else if (key === "height") {
      const valueNumber = number(value, 30, 2400);
      if (valueNumber !== null) changes.height = valueNumber;
    }
  }
  return changes;
}

function projectById(view: View, projectId: string | null): Project | undefined {
  return projectId ? view.projects.find((project) => project.uuid === projectId) : undefined;
}

function hasMilestone(project: Project | undefined, milestoneId: string | null): milestoneId is string {
  return !!project && !!milestoneId && project.milestones.some((milestone) => milestone.id === milestoneId);
}

function describeAction(action: AiAction, view: View): string {
  const project = (projectId: string) => view.projects.find((item) => item.uuid === projectId)?.name || projectId;
  const milestone = (projectId: string, milestoneId: string) => view.projects.find((item) => item.uuid === projectId)?.milestones.find((item) => item.id === milestoneId)?.iteration || milestoneId;
  if (action.type === "update_view") return `更新视图“${view.name}”设置`;
  if (action.type === "update_project") return `更新项目“${project(action.projectId)}”`;
  if (action.type === "add_milestone") return `在“${project(action.projectId)}”新增里程碑“${action.milestone.iteration}”`;
  if (action.type === "update_milestone") return `更新“${project(action.projectId)} / ${milestone(action.projectId, action.milestoneId)}”`;
  if (action.type === "add_connection") return `添加箭头：${project(action.fromProjectId)} / ${milestone(action.fromProjectId, action.fromMilestoneId)} → ${project(action.toProjectId)} / ${milestone(action.toProjectId, action.toMilestoneId)}`;
  if (action.type === "update_connection") return "更新箭头样式";
  if (action.type === "delete_connection") return "删除箭头";
  if (action.type === "add_plan_item") return `添加${action.item.kind === "frame" ? "虚线框" : "文本"}${action.item.text ? `“${action.item.text.slice(0, 30)}”` : ""}`;
  if (action.type === "update_plan_item") return "更新画布元素";
  return "删除画布元素";
}

export function validateAiCommand(raw: unknown, view: View): ValidationResult {
  const root = record(raw) || {};
  const reply = text(root.reply, 4000) || "我已分析你的要求。";
  const warnings = Array.isArray(root.warnings) ? root.warnings.map((item) => text(item, 500)).filter((item): item is string => !!item).slice(0, 10) : [];
  const actions: AiAction[] = [];
  const rejected: string[] = [];
  const candidates = Array.isArray(root.actions) ? root.actions.slice(0, 20) : [];

  candidates.forEach((candidate, index) => {
    const action = record(candidate);
    const type = text(action?.type, 40);
    const invalid = (message: string) => rejected.push(`第 ${index + 1} 个命令${message}`);
    if (!action || !type) return invalid("格式无效");

    if (type === "update_view") {
      const changes = copyAllowedChanges(action.changes, VIEW_KEYS) as UpdateViewAction["changes"];
      if (!Object.keys(changes).length) invalid("没有有效的视图字段"); else actions.push({ type, changes });
      return;
    }

    if (type === "update_connection" || type === "delete_connection") {
      const connectionId = id(action.connectionId);
      if (!connectionId || !view.connections.some((connection) => connection.id === connectionId)) return invalid("引用了不存在的箭头");
      if (type === "delete_connection") actions.push({ type, connectionId });
      else {
        const changes = copyConnectionChanges(action.changes);
        if (!Object.keys(changes).length) invalid("没有有效的箭头样式"); else actions.push({ type, connectionId, changes });
      }
      return;
    }

    if (type === "add_connection") {
      const fromProjectId = id(action.fromProjectId);
      const toProjectId = id(action.toProjectId);
      const fromMilestoneId = id(action.fromMilestoneId);
      const toMilestoneId = id(action.toMilestoneId);
      const fromProject = projectById(view, fromProjectId);
      const toProject = projectById(view, toProjectId);
      if (!hasMilestone(fromProject, fromMilestoneId) || !hasMilestone(toProject, toMilestoneId)) return invalid("引用了不存在的箭头端点");
      if (fromProjectId === toProjectId && fromMilestoneId === toMilestoneId) return invalid("不能连接同一个里程碑");
      const style = copyConnectionChanges(action.style);
      actions.push({ type, fromProjectId, fromMilestoneId, toProjectId, toMilestoneId, style: { color: style.color || "#00e39a", lineType: style.lineType || "thin-solid", shape: style.shape || "straight" } });
      return;
    }

    if (type === "add_plan_item") {
      const item = record(action.item);
      const kind = item?.kind === "frame" || item?.kind === "text" ? item.kind : null;
      if (!item || !kind) return invalid("缺少有效的画布元素类型");
      const changes = copyPlanItemChanges(item, kind);
      const minimumWidth = kind === "frame" ? 32 : 50;
      if (changes.x === undefined || changes.y === undefined || changes.width === undefined || changes.height === undefined || changes.width < minimumWidth) return invalid("缺少有效的位置或尺寸");
      if (kind === "text" && !changes.text) return invalid("文本元素缺少内容");
      actions.push({ type, item: { kind, x: changes.x, y: changes.y, width: changes.width, height: changes.height, text: changes.text || "", color: changes.color || "#d8ff3e", fontSize: changes.fontSize || 13 } });
      return;
    }

    if (type === "update_plan_item" || type === "delete_plan_item") {
      const itemId = id(action.itemId);
      const existing = itemId ? (view.planItems || []).find((item) => item.id === itemId) : undefined;
      if (!itemId || !existing) return invalid("引用了不存在的画布元素");
      if (type === "delete_plan_item") actions.push({ type, itemId });
      else {
        const changes = copyPlanItemChanges(action.changes, existing.kind);
        if (!Object.keys(changes).length) invalid("没有有效的画布元素字段"); else actions.push({ type, itemId, changes });
      }
      return;
    }

    const projectId = id(action.projectId);
    const project = projectById(view, projectId);
    if (!projectId || !project) return invalid("引用了不存在的项目");
    if (type === "update_project") {
      const changes = copyAllowedChanges(action.changes, PROJECT_KEYS) as UpdateProjectAction["changes"];
      if (!Object.keys(changes).length) invalid("没有有效的项目字段"); else actions.push({ type, projectId, changes });
      return;
    }
    if (type === "add_milestone") {
      const milestone = record(action.milestone);
      const iteration = text(milestone?.iteration, 240);
      const releaseDate = milestone?.releaseDate;
      if (!milestone || !iteration || !validDate(releaseDate)) return invalid("新增里程碑缺少有效名称或日期");
      const optional = copyAllowedChanges(milestone, MILESTONE_KEYS) as AddMilestoneAction["milestone"];
      actions.push({ type, projectId, milestone: { ...optional, iteration, releaseDate } });
      return;
    }
    if (type === "update_milestone") {
      const milestoneId = id(action.milestoneId);
      if (!hasMilestone(project, milestoneId)) return invalid("引用了不存在的里程碑");
      const changes = copyAllowedChanges(action.changes, MILESTONE_KEYS) as UpdateMilestoneAction["changes"];
      if (!Object.keys(changes).length) invalid("没有有效的里程碑字段"); else actions.push({ type, projectId, milestoneId, changes });
      return;
    }
    invalid("类型不受支持");
  });

  return { result: { reply, actions, summaries: actions.map((action) => describeAction(action, view)), warnings: [...warnings, ...rejected] }, rejected };
}

function generatedId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function applyAiActions(view: View, actions: AiAction[]): { view: View; applied: number; skipped: string[] } {
  let next = view;
  let applied = 0;
  const skipped: string[] = [];
  const skip = (message: string) => skipped.push(message);

  for (const action of actions) {
    if (action.type === "update_view") { next = { ...next, ...action.changes }; applied += 1; continue; }
    if (action.type === "update_connection") {
      if (!next.connections.some((connection) => connection.id === action.connectionId)) { skip("目标箭头已不存在"); continue; }
      next = { ...next, connections: next.connections.map((connection) => connection.id === action.connectionId ? { ...connection, ...action.changes } : connection) };
      applied += 1; continue;
    }
    if (action.type === "delete_connection") {
      if (!next.connections.some((connection) => connection.id === action.connectionId)) { skip("目标箭头已不存在"); continue; }
      next = { ...next, connections: next.connections.filter((connection) => connection.id !== action.connectionId) };
      applied += 1; continue;
    }
    if (action.type === "add_connection") {
      const from = projectById(next, action.fromProjectId);
      const to = projectById(next, action.toProjectId);
      if (!hasMilestone(from, action.fromMilestoneId) || !hasMilestone(to, action.toMilestoneId)) { skip("箭头端点已不存在"); continue; }
      next = { ...next, connections: [...next.connections, { id: generatedId("connection_ai"), fromProject: from.name, fromMsId: action.fromMilestoneId, toProject: to.name, toMsId: action.toMilestoneId, ...action.style }] };
      applied += 1; continue;
    }
    if (action.type === "add_plan_item") {
      next = { ...next, planItems: [...(next.planItems || []), { ...action.item, id: generatedId("plan_ai") }] };
      applied += 1; continue;
    }
    if (action.type === "update_plan_item") {
      if (!(next.planItems || []).some((item) => item.id === action.itemId)) { skip("目标画布元素已不存在"); continue; }
      next = { ...next, planItems: (next.planItems || []).map((item) => item.id === action.itemId ? { ...item, ...action.changes } : item) };
      applied += 1; continue;
    }
    if (action.type === "delete_plan_item") {
      if (!(next.planItems || []).some((item) => item.id === action.itemId)) { skip("目标画布元素已不存在"); continue; }
      next = { ...next, planItems: (next.planItems || []).filter((item) => item.id !== action.itemId) };
      applied += 1; continue;
    }

    const project = projectById(next, action.projectId);
    if (!project) { skip("目标项目已不存在"); continue; }
    if (action.type === "update_project") {
      const oldName = project.name;
      const updated = { ...project, ...action.changes };
      next = { ...next, projects: next.projects.map((item) => item.uuid === project.uuid ? updated : item), connections: updated.name === oldName ? next.connections : next.connections.map((connection) => ({ ...connection, fromProject: connection.fromProject === oldName ? updated.name : connection.fromProject, toProject: connection.toProject === oldName ? updated.name : connection.toProject })) };
      applied += 1; continue;
    }
    if (action.type === "add_milestone") {
      const milestone: Milestone = { id: generatedId("ms_ai"), iteration: action.milestone.iteration, releaseDate: action.milestone.releaseDate, remark: action.milestone.remark || "", detailRemark: action.milestone.detailRemark || "", color: action.milestone.color || "#2563eb", textColor: action.milestone.textColor || "#122033", shape: action.milestone.shape || "diamond" };
      next = { ...next, projects: next.projects.map((item) => item.uuid === project.uuid ? { ...item, milestones: [...item.milestones, milestone] } : item) };
      applied += 1; continue;
    }
    if (!project.milestones.some((milestone) => milestone.id === action.milestoneId)) { skip("目标里程碑已不存在"); continue; }
    next = { ...next, projects: next.projects.map((item) => item.uuid === project.uuid ? { ...item, milestones: item.milestones.map((milestone) => milestone.id === action.milestoneId ? { ...milestone, ...action.changes } : milestone) } : item) };
    applied += 1;
  }
  return { view: next, applied, skipped };
}
