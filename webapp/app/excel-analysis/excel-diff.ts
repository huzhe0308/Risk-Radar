/* eslint-disable @typescript-eslint/no-explicit-any */
export type ChangeKind = "added" | "removed" | "modified" | "delayed" | "advanced";
export type EntityType = "workbook" | "view" | "project" | "milestone" | "connection" | "cell";
export type ChangeSeverity = "high" | "medium" | "low";

export type ExcelChange = {
  id: string;
  kind: ChangeKind;
  entityType: EntityType;
  severity: ChangeSeverity;
  sheet?: string;
  address?: string;
  view?: string;
  project?: string;
  item: string;
  field: string;
  oldValue: string;
  newValue: string;
  daysDelta?: number;
  summary: string;
  reason?: string;
};

export type ComparisonResult = {
  mode: "time-plan" | "generic";
  changes: ExcelChange[];
  stats: {
    total: number;
    added: number;
    removed: number;
    modified: number;
    delayed: number;
    advanced: number;
    highRisk: number;
    affectedProjects: number;
    affectedViews: number;
  };
  insights: string[];
  analysis?: string;
  source?: "ai";
  truncated: boolean;
};

export type AiWorkbookContext = {
  format: "time-plan" | "generic";
  fileName: string;
  sheets: string[];
  title?: string;
  theme?: string;
  views?: Array<{
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    connections: unknown[];
  }>;
  projects?: Array<{
    id: string;
    view: string;
    name: string;
    tag: string;
    detailRemark: string;
    milestones: Record<string, unknown>[];
  }>;
  tables?: Array<{
    sheet: string;
    range: string;
    rows: unknown[][];
  }>;
  truncated: boolean;
};

type ProjectSnapshot = {
  key: string;
  uuid: string;
  view: string;
  name: string;
  tag: string;
  detailRemark: string;
  milestones: Map<string, Record<string, unknown>>;
};

type TimePlanSnapshot = {
  title: string;
  theme: string;
  views: Map<string, Record<string, unknown>>;
  projects: Map<string, ProjectSnapshot>;
};

const MAX_GENERIC_CHANGES = 5000;

function text(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function changeId(parts: unknown[]): string {
  let hash = 2166136261;
  const source = parts.map(text).join("|");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `chg_${(hash >>> 0).toString(36)}`;
}

function addChange(changes: ExcelChange[], change: Omit<ExcelChange, "id">) {
  changes.push({ ...change, id: changeId([change.entityType, change.kind, change.view, change.project, change.item, change.field]) });
}

function getRows(workbook: any, sheetName: string, xlsx: any): unknown[][] {
  const sheet = workbook?.Sheets?.[sheetName];
  return sheet ? xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) : [];
}

function configMap(rows: unknown[][]): Map<string, Record<string, unknown>> {
  const chunks = new Map<string, string>();
  let current = "";
  for (const row of rows) {
    const name = text(row[0]);
    const payload = text(row[2]);
    if (!name || name === "Group" || name === "title" || name === "bgColor") continue;
    if (name.startsWith("[[OF")) {
      const markerName = name.replace(/^\[\[OF\d+_/, "").replace(/\]\]$/, "");
      const target = markerName || current;
      if (target) chunks.set(target, `${chunks.get(target) || ""}${payload}`);
    } else {
      current = name;
      chunks.set(name, payload);
    }
  }
  return new Map([...chunks].flatMap(([name, payload]) => {
    const parsed = safeJson<Record<string, unknown>>(payload, {});
    return Object.keys(parsed).length ? [[name, parsed] as const] : [];
  }));
}

function timePlanSnapshot(workbook: any, xlsx: any): TimePlanSnapshot | null {
  if (!workbook?.Sheets?.Config || !workbook?.Sheets?.Data) return null;
  const configRows = getRows(workbook, "Config", xlsx);
  const dataRows = getRows(workbook, "Data", xlsx);
  if (dataRows.length < 1 || dataRows[0].length < 6) return null;
  const views = configMap(configRows);
  const projects = new Map<string, ProjectSnapshot>();
  for (const row of dataRows.slice(1)) {
    const name = text(row[0]).trim();
    const view = text(row[5]).trim() || "Default";
    if (!name) continue;
    const uuid = text(row[4]).trim();
    const key = uuid || `${view}::${name}`;
    const milestoneRows = safeJson<Record<string, unknown>[]>(text(row[1]), []);
    const existing = projects.get(key);
    const milestones = existing?.milestones || new Map<string, Record<string, unknown>>();
    milestoneRows.forEach((milestone, index) => {
      const milestoneKey = text(milestone.id) || `${text(milestone.iteration)}::${text(milestone.releaseDate)}::${index}`;
      milestones.set(milestoneKey, milestone);
    });
    projects.set(key, {
      key,
      uuid,
      view,
      name,
      tag: text(row[2]),
      detailRemark: text(row[3]),
      milestones,
    });
  }
  let title = "Time Plan";
  let theme = "";
  configRows.forEach((row) => {
    if (text(row[0]) === "title") title = text(row[1]);
    if (text(row[0]) === "bgColor") theme = text(row[1]);
  });
  return { title, theme, views, projects };
}

function dateDelta(oldValue: string, newValue: string): number | undefined {
  const oldDate = new Date(`${oldValue}T00:00:00Z`);
  const newDate = new Date(`${newValue}T00:00:00Z`);
  if (Number.isNaN(oldDate.valueOf()) || Number.isNaN(newDate.valueOf())) return undefined;
  return Math.round((newDate.valueOf() - oldDate.valueOf()) / 86_400_000);
}

function compareFields(
  changes: ExcelChange[],
  context: { entityType: EntityType; view?: string; project?: string; item: string },
  oldItem: Record<string, unknown>,
  newItem: Record<string, unknown>,
  fields: Array<[string, string]>,
) {
  fields.forEach(([field, label]) => {
    const oldValue = text(oldItem[field]);
    const newValue = text(newItem[field]);
    if (oldValue === newValue) return;
    const daysDelta = field === "releaseDate" ? dateDelta(oldValue, newValue) : undefined;
    const kind: ChangeKind = daysDelta == null || daysDelta === 0 ? "modified" : daysDelta > 0 ? "delayed" : "advanced";
    const severity: ChangeSeverity = kind === "delayed" ? (Math.abs(daysDelta || 0) >= 14 ? "high" : "medium") : kind === "advanced" ? "low" : "low";
    const summary = kind === "delayed"
      ? `${context.item} 延期 ${daysDelta} 天`
      : kind === "advanced"
        ? `${context.item} 提前 ${Math.abs(daysDelta || 0)} 天`
        : `${context.item} 的${label}发生变化`;
    addChange(changes, { ...context, kind, severity, field: label, oldValue, newValue, daysDelta, summary });
  });
}

function compareTimePlan(oldData: TimePlanSnapshot, newData: TimePlanSnapshot): ExcelChange[] {
  const changes: ExcelChange[] = [];
  compareFields(changes, { entityType: "workbook", item: "工作簿" }, oldData as unknown as Record<string, unknown>, newData as unknown as Record<string, unknown>, [["title", "标题"], ["theme", "主题"]]);

  const viewNames = new Set([...oldData.views.keys(), ...newData.views.keys()]);
  viewNames.forEach((viewName) => {
    const oldView = oldData.views.get(viewName);
    const newView = newData.views.get(viewName);
    if (!oldView || !newView) {
      const kind = newView ? "added" : "removed";
      addChange(changes, { kind, entityType: "view", severity: "high", view: viewName, item: viewName, field: "视图", oldValue: oldView ? "存在" : "", newValue: newView ? "存在" : "", summary: `${kind === "added" ? "新增" : "删除"}视图 ${viewName}` });
      return;
    }
    compareFields(changes, { entityType: "view", view: viewName, item: viewName }, oldView, newView, [["viewStartTime", "开始日期"], ["viewEndTime", "结束日期"], ["type", "类型"], ["content", "说明"], ["colWidth", "列宽"]]);
    const oldConnections = new Map((Array.isArray(oldView.connections) ? oldView.connections : []).map((item: any, index: number) => [text(item.id) || `${item.fromMsId}->${item.toMsId}::${index}`, item]));
    const newConnections = new Map((Array.isArray(newView.connections) ? newView.connections : []).map((item: any, index: number) => [text(item.id) || `${item.fromMsId}->${item.toMsId}::${index}`, item]));
    new Set([...oldConnections.keys(), ...newConnections.keys()]).forEach((key) => {
      const oldConnection = oldConnections.get(key);
      const newConnection = newConnections.get(key);
      if (!oldConnection || !newConnection) {
        const kind = newConnection ? "added" : "removed";
        const item = text((newConnection || oldConnection)?.id) || key;
        addChange(changes, { kind, entityType: "connection", severity: "medium", view: viewName, item, field: "依赖关系", oldValue: oldConnection ? `${oldConnection.fromProject} → ${oldConnection.toProject}` : "", newValue: newConnection ? `${newConnection.fromProject} → ${newConnection.toProject}` : "", summary: `${kind === "added" ? "新增" : "删除"}依赖关系 ${item}` });
      } else {
        compareFields(changes, { entityType: "connection", view: viewName, item: text(newConnection.id) || key }, oldConnection, newConnection, [["fromProject", "起点项目"], ["fromMsId", "起点里程碑"], ["toProject", "终点项目"], ["toMsId", "终点里程碑"], ["lineType", "线型"], ["color", "颜色"]]);
      }
    });
  });

  const projectKeys = new Set([...oldData.projects.keys(), ...newData.projects.keys()]);
  projectKeys.forEach((key) => {
    const oldProject = oldData.projects.get(key);
    const newProject = newData.projects.get(key);
    const project = newProject || oldProject;
    if (!project) return;
    if (!oldProject || !newProject) {
      const kind = newProject ? "added" : "removed";
      addChange(changes, { kind, entityType: "project", severity: "high", view: project.view, project: project.name, item: project.name, field: "项目", oldValue: oldProject ? "存在" : "", newValue: newProject ? "存在" : "", summary: `${kind === "added" ? "新增" : "删除"}项目 ${project.name}` });
      return;
    }
    compareFields(changes, { entityType: "project", view: newProject.view, project: newProject.name, item: newProject.name }, oldProject as unknown as Record<string, unknown>, newProject as unknown as Record<string, unknown>, [["name", "项目名称"], ["view", "所属视图"], ["tag", "标签"], ["detailRemark", "项目说明"]]);

    const milestoneKeys = new Set([...oldProject.milestones.keys(), ...newProject.milestones.keys()]);
    milestoneKeys.forEach((milestoneKey) => {
      const oldMilestone = oldProject.milestones.get(milestoneKey);
      const newMilestone = newProject.milestones.get(milestoneKey);
      const milestone = newMilestone || oldMilestone;
      if (!milestone) return;
      const item = text(milestone.iteration) || milestoneKey;
      if (!oldMilestone || !newMilestone) {
        const kind = newMilestone ? "added" : "removed";
        addChange(changes, { kind, entityType: "milestone", severity: kind === "removed" ? "medium" : "low", view: newProject.view, project: newProject.name, item, field: "里程碑", oldValue: oldMilestone ? `${item} · ${text(oldMilestone.releaseDate)}` : "", newValue: newMilestone ? `${item} · ${text(newMilestone.releaseDate)}` : "", summary: `${kind === "added" ? "新增" : "删除"}里程碑 ${item}` });
        return;
      }
      compareFields(changes, { entityType: "milestone", view: newProject.view, project: newProject.name, item }, oldMilestone, newMilestone, [["iteration", "里程碑名称"], ["releaseDate", "计划日期"], ["remark", "备注"], ["detailRemark", "详细说明"], ["color", "颜色"], ["shape", "形状"], ["textColor", "文字颜色"]]);
    });
  });
  return changes;
}

function cellDisplay(cell: any): string {
  if (!cell) return "";
  if (cell.f) return `=${cell.f}`;
  return text(cell.v);
}

function compareGeneric(oldWorkbook: any, newWorkbook: any, xlsx: any): { changes: ExcelChange[]; truncated: boolean } {
  const changes: ExcelChange[] = [];
  let truncated = false;
  const sheetNames = new Set([...(oldWorkbook?.SheetNames || []), ...(newWorkbook?.SheetNames || [])]);
  sheetNames.forEach((sheetName) => {
    if (changes.length >= MAX_GENERIC_CHANGES) { truncated = true; return; }
    const oldSheet = oldWorkbook?.Sheets?.[sheetName];
    const newSheet = newWorkbook?.Sheets?.[sheetName];
    if (!oldSheet || !newSheet) {
      const kind = newSheet ? "added" : "removed";
      addChange(changes, { kind, entityType: "cell", severity: "medium", sheet: sheetName, item: sheetName, field: "工作表", oldValue: oldSheet ? "存在" : "", newValue: newSheet ? "存在" : "", summary: `${kind === "added" ? "新增" : "删除"}工作表 ${sheetName}` });
      return;
    }
    const oldRange = xlsx.utils.decode_range(oldSheet["!ref"] || "A1:A1");
    const newRange = xlsx.utils.decode_range(newSheet["!ref"] || "A1:A1");
    const maxRow = Math.max(oldRange.e.r, newRange.e.r);
    const maxCol = Math.max(oldRange.e.c, newRange.e.c);
    for (let row = 0; row <= maxRow; row += 1) {
      for (let col = 0; col <= maxCol; col += 1) {
        const address = xlsx.utils.encode_cell({ r: row, c: col });
        const oldValue = cellDisplay(oldSheet[address]);
        const newValue = cellDisplay(newSheet[address]);
        if (oldValue === newValue) continue;
        const kind: ChangeKind = !oldValue ? "added" : !newValue ? "removed" : "modified";
        addChange(changes, { kind, entityType: "cell", severity: "low", sheet: sheetName, address, item: `${sheetName}!${address}`, field: "单元格", oldValue, newValue, summary: `${sheetName}!${address} 内容变化` });
        if (changes.length >= MAX_GENERIC_CHANGES) { truncated = true; return { changes, truncated }; }
      }
    }
  });
  return { changes, truncated };
}

function finalize(mode: ComparisonResult["mode"], changes: ExcelChange[], truncated: boolean): ComparisonResult {
  const count = (kind: ChangeKind) => changes.filter((change) => change.kind === kind).length;
  const delayed = changes.filter((change) => change.kind === "delayed");
  const affectedProjects = new Set(changes.map((change) => change.project).filter(Boolean)).size;
  const affectedViews = new Set(changes.map((change) => change.view).filter(Boolean)).size;
  const biggestDelay = delayed.sort((a, b) => (b.daysDelta || 0) - (a.daysDelta || 0))[0];
  const insights: string[] = [];
  if (!changes.length) insights.push("两个工作簿的可比业务数据一致，未发现变更。");
  if (delayed.length) insights.push(`发现 ${delayed.length} 项延期，其中 ${changes.filter((item) => item.kind === "delayed" && item.severity === "high").length} 项延期达到 14 天及以上。`);
  if (biggestDelay) insights.push(`最大延期为 ${biggestDelay.daysDelta} 天：${biggestDelay.project ? `${biggestDelay.project} / ` : ""}${biggestDelay.item}。`);
  const structural = changes.filter((item) => (item.kind === "added" || item.kind === "removed") && (item.entityType === "project" || item.entityType === "milestone"));
  if (structural.length) insights.push(`计划结构有 ${structural.length} 处调整，请重点确认新增/删除的项目与里程碑。`);
  if (mode === "generic") insights.push("未识别到 Time Plan 的 Config/Data 结构，已使用工作表单元格级对比。 ");
  return {
    mode,
    changes,
    truncated,
    stats: {
      total: changes.length,
      added: count("added"),
      removed: count("removed"),
      modified: count("modified"),
      delayed: count("delayed"),
      advanced: count("advanced"),
      highRisk: changes.filter((change) => change.severity === "high").length,
      affectedProjects,
      affectedViews,
    },
    insights,
  };
}

export function compareExcelWorkbooks(oldWorkbook: any, newWorkbook: any, xlsx: any): ComparisonResult {
  const oldSnapshot = timePlanSnapshot(oldWorkbook, xlsx);
  const newSnapshot = timePlanSnapshot(newWorkbook, xlsx);
  if (oldSnapshot && newSnapshot) return finalize("time-plan", compareTimePlan(oldSnapshot, newSnapshot), false);
  const generic = compareGeneric(oldWorkbook, newWorkbook, xlsx);
  return finalize("generic", generic.changes, generic.truncated);
}

/**
 * Extracts a bounded, JSON-serializable workbook representation for the AI API.
 * It deliberately performs no change classification: all comparison judgment is
 * left to the model. Time Plan workbooks are converted to business objects;
 * unrelated workbooks use a bounded table representation.
 */
export function extractWorkbookForAi(workbook: any, xlsx: any, fileName: string): AiWorkbookContext {
  const snapshot = timePlanSnapshot(workbook, xlsx);
  if (snapshot) {
    let milestoneCount = 0;
    let connectionCount = 0;
    let truncated = false;
    const projects = [...snapshot.projects.values()].slice(0, 300).map((project) => {
      const remaining = Math.max(0, 6000 - milestoneCount);
      const milestones = [...project.milestones.values()].slice(0, remaining);
      milestoneCount += milestones.length;
      if (milestones.length < project.milestones.size) truncated = true;
      return {
        id: project.uuid || project.key,
        view: project.view,
        name: project.name,
        tag: project.tag,
        detailRemark: project.detailRemark,
        milestones,
      };
    });
    if (projects.length < snapshot.projects.size) truncated = true;
    const views = [...snapshot.views.entries()].slice(0, 100).map(([name, view]) => {
      const sourceConnections = Array.isArray(view.connections) ? view.connections : [];
      const remaining = Math.max(0, 3000 - connectionCount);
      const connections = sourceConnections.slice(0, remaining);
      connectionCount += connections.length;
      if (connections.length < sourceConnections.length) truncated = true;
      return {
        name,
        type: text(view.type),
        startDate: text(view.viewStartTime),
        endDate: text(view.viewEndTime),
        connections,
      };
    });
    return {
      format: "time-plan",
      fileName,
      sheets: workbook.SheetNames || [],
      title: snapshot.title,
      theme: snapshot.theme,
      views,
      projects,
      truncated,
    };
  }

  let cellBudget = 12_000;
  let truncated = false;
  const tables = (workbook.SheetNames || []).slice(0, 30).map((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    const range = sheet?.["!ref"] || "A1:A1";
    const rawRows = sheet ? xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][] : [];
    const maxRows = Math.min(rawRows.length, 300);
    const maxCols = Math.min(Math.max(1, ...rawRows.slice(0, maxRows).map((row) => row.length)), 60);
    const allowedRows = Math.min(maxRows, Math.max(0, Math.floor(cellBudget / maxCols)));
    const rows = rawRows.slice(0, allowedRows).map((row) => row.slice(0, maxCols));
    cellBudget -= rows.length * maxCols;
    if (rows.length < rawRows.length || rawRows.some((row) => row.length > maxCols)) truncated = true;
    return { sheet: sheetName, range, rows };
  });
  if ((workbook.SheetNames || []).length > tables.length) truncated = true;
  return { format: "generic", fileName, sheets: workbook.SheetNames || [], tables, truncated };
}
