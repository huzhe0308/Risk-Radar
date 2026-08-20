import type { AppData, Connection, Milestone, MilestoneShape, PlanItem, Project, View } from "./types";

const EXCEL_MAX_CELL_LEN = 30_000;
const OVERFLOW_PREFIX = "[[OF";
const BASELINE_PLAN_TITLE = "CEA 2.X E/E Baseline Plan";
const BASELINE_PLAN_VIEW_NAME = "CEA 2.X Platform";
const BASELINE_ROWS_REMOVAL_VERSION = 3;
const CURRENT_DATA_VERSION = 8;

export type XlsxLike = {
  read: (data: ArrayBuffer, options?: Record<string, unknown>) => any;
  utils: {
    sheet_to_json: (sheet: any, options?: Record<string, unknown>) => unknown[][];
    book_new: () => any;
    book_append_sheet: (book: any, sheet: any, name: string) => void;
    aoa_to_sheet: (rows: unknown[][]) => any;
  };
  writeFile: (book: any, filename: string) => void;
};

declare global {
  interface Window {
    XLSX?: XlsxLike;
  }
}

const colors = ["#0f766e", "#2563eb", "#7c3aed", "#dc2626", "#d97706", "#0891b2"];

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeDate(value: unknown, fallback = ""): string {
  const raw = stringValue(value).trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) return fallback;
  return parsed.toISOString().slice(0, 10);
}

function normalizeShape(value: unknown): MilestoneShape {
  const shape = stringValue(value).toLowerCase();
  return shape || "diamond";
}

function inferTextFrameBindings(items: PlanItem[]): PlanItem[] {
  const frames = items.filter((item) => item.kind === "frame");
  if (!frames.length) return items;

  return items.map((item) => {
    if (item.kind !== "text" || item.parentFrameId || item.bindingDisabled) return item;
    const textRight = item.x + item.width;
    const candidate = frames
      .map((frame) => {
        const frameRight = frame.x + frame.width;
        const horizontalGap = item.x > frameRight
          ? item.x - frameRight
          : frame.x > textRight ? frame.x - textRight : 0;
        const verticalGap = Math.abs(item.y - frame.y);
        return { frame, horizontalGap, verticalGap, score: verticalGap * 4 + horizontalGap };
      })
      .filter(({ horizontalGap, verticalGap }) => horizontalGap <= 48 && verticalGap <= 64)
      .sort((a, b) => a.score - b.score)[0];
    return candidate ? { ...item, parentFrameId: candidate.frame.id, bindingDisabled: false } : item;
  });
}

function normalizePlanItems(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const kind = item.kind === "frame" ? "frame" : item.kind === "text" ? "text" : null;
    if (!kind) return [];
    const x = Number(item.x);
    const y = Number(item.y);
    const optionalPositiveNumber = (candidate: unknown) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    };
    return [{
      id: stringValue(item.id) || makeId(`plan${index}`),
      kind,
      x: Number.isFinite(x) ? Math.max(0, x) : 80,
      y: Number.isFinite(y) ? y : 80,
      width: Math.max(kind === "frame" ? 32 : 50, Number(item.width) || (kind === "frame" ? 260 : 180)),
      height: Math.max(30, Number(item.height) || (kind === "frame" ? 76 : 36)),
      text: kind === "frame" ? stringValue(item.text) : (stringValue(item.text) || "New text"),
      color: stringValue(item.color) || "#d8ff3e",
      fontSize: Math.max(10, Math.min(28, Number(item.fontSize) || 13)),
      manualSize: Boolean(item.manualSize),
      startWeek: optionalPositiveNumber(item.startWeek),
      startYear: optionalPositiveNumber(item.startYear),
      endWeek: optionalPositiveNumber(item.endWeek),
      endYear: optionalPositiveNumber(item.endYear),
      projectId: stringValue(item.projectId) || undefined,
      parentFrameId: stringValue(item.parentFrameId) || undefined,
      bindingDisabled: Boolean(item.bindingDisabled),
    }];
  });
  const frameIds = new Set(normalized.filter((item) => item.kind === "frame").map((item) => item.id));
  return inferTextFrameBindings(normalized.map((item) => item.parentFrameId && !frameIds.has(item.parentFrameId)
    ? { ...item, parentFrameId: undefined }
    : item));
}

function parseWeekYearFromRemark(remark: string): { week?: number; year?: number } {
  if (!remark) return {};
  const match = remark.match(/(\d{1,2})\/(\d{2,4})/);
  if (!match) return {};
  const week = Number(match[1]);
  const year = Number(match[2]);
  if (isNaN(week) || week < 1 || week > 53 || isNaN(year)) return {};
  return { week, year };
}

function normalizeMilestone(raw: Record<string, unknown>, index: number): Milestone {
  const remark = stringValue(raw.remark);
  const parsed = parseWeekYearFromRemark(remark);
  return {
    id: stringValue(raw.id) || makeId(`ms${index}`),
    iteration: stringValue(raw.iteration) || "Milestone",
    releaseDate: normalizeDate(raw.releaseDate, new Date().toISOString().slice(0, 10)),
    remark,
    detailRemark: stringValue(raw.detailRemark),
    color: stringValue(raw.color) || colors[index % colors.length],
    textColor: stringValue(raw.textColor) || "#122033",
    shape: normalizeShape(raw.shape),
    week: raw.week != null ? Number(raw.week) : parsed.week,
    year: raw.year != null ? Number(raw.year) : parsed.year,
  };
}

function normalizeProject(
  raw: Record<string, unknown>,
  viewId: string,
  index: number,
  milestoneOverride?: unknown[],
): Project {
  const milestones = milestoneOverride ?? (Array.isArray(raw.milestones) ? raw.milestones : []);
  return {
    uuid: stringValue(raw._uuid || raw.uuid) || makeId(`project${index}`),
    name: stringValue(raw.name) || `Project ${index + 1}`,
    tag: stringValue(raw.tag),
    detailRemark: stringValue(raw.detailRemark),
    bgColor: stringValue(raw.bgColor) || "transparent",
    textColor: stringValue(raw.textColor) || "#122033",
    milestones: milestones.map((item, milestoneIndex) =>
      normalizeMilestone((item || {}) as Record<string, unknown>, milestoneIndex),
    ),
    viewId,
    rowHeight: Math.max(42, Math.min(180, Number(raw.rowHeight) || 76)),
    showSeparatorAbove: raw.showSeparatorAbove === true,
  };
}

function configRowsToJson(rows: unknown[][]): Map<string, Record<string, unknown>> {
  const jsonByView = new Map<string, string>();
  let currentName = "";
  for (const row of rows) {
    const first = stringValue(row[0]);
    const chunk = stringValue(row[2]);
    if (!first || first === "Group") continue;
    if (first.startsWith(OVERFLOW_PREFIX)) {
      const markerName = first.replace(/^\[\[OF\d+_/, "").replace(/\]\]$/, "");
      const name = markerName || currentName;
      if (name) jsonByView.set(name, `${jsonByView.get(name) || ""}${chunk}`);
      continue;
    }
    currentName = first;
    jsonByView.set(first, chunk);
  }
  return new Map(
    [...jsonByView.entries()].flatMap(([name, json]) => {
      const parsed = safeJson<Record<string, unknown>>(json, {});
      return Object.keys(parsed).length ? [[name, parsed]] : [];
    }),
  );
}

function parseDateBounds(raw: Record<string, unknown>): [string, string] {
  const start = normalizeDate(raw.viewStartTime);
  const end = normalizeDate(raw.viewEndTime);
  if (start && end) return [start, end];
  const dates = Array.isArray(raw.projectData)
    ? (raw.projectData as Record<string, unknown>[]).flatMap((project) =>
        Array.isArray(project.milestones)
          ? project.milestones.map((milestone) => normalizeDate((milestone as Record<string, unknown>).releaseDate))
          : [],
      )
    : [];
  const validDates = dates.filter(Boolean).sort();
  return [validDates[0] || "2026-01-01", validDates.at(-1) || "2026-12-31"];
}

function uniqueById<T>(items: T[], getId: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = getId(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function dedupeViewContent(view: View): View {
  return {
    ...view,
    projects: uniqueById(view.projects, (project) => project.uuid).map((project) => ({
      ...project,
      milestones: uniqueById(project.milestones, (milestone) => milestone.id),
    })),
    connections: uniqueById(view.connections, (connection) => connection.id),
    planItems: uniqueById(view.planItems || [], (item) => item.id),
  };
}

function hasReferenceTestContent(view: View): boolean {
  return view.projects.some((project) => project.uuid.startsWith("test_"))
    || (view.planItems || []).some((item) => item.id.startsWith("test_"));
}

function mergeTestIntoParent(parent: View, test: View): View {
  const parentRowHeight = parent.projects.reduce((total, project) => total + (project.rowHeight || 76), 0);
  const mergedProjectNames = new Set([...parent.projects, ...test.projects].map((project) => project.name));
  const startDate = [parent.startDate, test.startDate].filter(Boolean).sort()[0] || parent.startDate;
  const endDate = [parent.endDate, test.endDate].filter(Boolean).sort().at(-1) || parent.endDate;

  return dedupeViewContent({
    ...parent,
    startDate,
    endDate,
    projects: [...parent.projects, ...test.projects.map((project) => ({ ...project, viewId: parent.id }))],
    connections: [...parent.connections, ...test.connections].filter(
      (connection) => mergedProjectNames.has(connection.fromProject) && mergedProjectNames.has(connection.toProject),
    ),
    planItems: inferTextFrameBindings([
      ...(parent.planItems || []),
      ...(test.planItems || []).map((item) => ({ ...item, y: item.y + parentRowHeight })),
    ]),
  });
}

function mergeReferenceTestView(views: View[]): View[] {
  const test = views.find((view) => view.name.toLowerCase() === "test");
  const parent = views.find((view) => view.name === BASELINE_PLAN_VIEW_NAME);
  if (!test || !parent) return views;
  return views
    .filter((view) => view.id !== test.id)
    .map((view) => view.id === parent.id ? mergeTestIntoParent(view, test) : view);
}

export function parseWorkbook(workbook: any): AppData {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error("Excel engine is still loading. Please retry in a moment.");
  const configSheet = workbook.Sheets.Config || workbook.Sheets[workbook.SheetNames[0]];
  const dataSheet = workbook.Sheets.Data || workbook.Sheets[workbook.SheetNames[1]];
  const configRows = configSheet ? xlsx.utils.sheet_to_json(configSheet, { header: 1, raw: true, defval: "" }) : [];
  const dataRows = dataSheet ? xlsx.utils.sheet_to_json(dataSheet, { header: 1, raw: true, defval: "" }) : [];
  return parseRows(configRows, dataRows);
}

export function parseSheets(sheets: Array<{ title: string; values: unknown[][] }>): AppData {
  const configSheet = sheets.find((s) => s.title.toLowerCase() === "config") || sheets[0];
  const dataSheet = sheets.find((s) => s.title.toLowerCase() === "data") || sheets[1];
  const configRows = configSheet?.values || [];
  const dataRows = dataSheet?.values || [];
  return parseRows(configRows, dataRows);
}

function parseRows(configRows: unknown[][], dataRows: unknown[][]): AppData {

  let title = "Time Plan";
  let theme = "theme-light-1";
  for (const row of configRows) {
    if (stringValue(row[0]) === "title") title = stringValue(row[1]) || title;
    if (stringValue(row[0]) === "bgColor") theme = stringValue(row[1]) || theme;
  }

  const configMap = configRowsToJson(configRows);
  const dataMap = new Map<string, { name: string; viewId: string; tag: string; detailRemark: string; uuid: string; milestones: unknown[] }>();
  for (const row of dataRows.slice(1)) {
    const name = stringValue(row[0]).trim();
    if (!name) continue;
    const milestones = safeJson<unknown[]>(stringValue(row[1]), []);
    const viewId = stringValue(row[5]).trim() || "Default";
    const existing = dataMap.get(`${viewId}::${name}`);
    dataMap.set(`${viewId}::${name}`, {
      name,
      viewId,
      tag: stringValue(row[2]),
      detailRemark: stringValue(row[3]),
      uuid: stringValue(row[4]),
      milestones: [...(existing?.milestones || []), ...milestones],
    });
  }

  const viewNames = [...new Set([...configMap.keys(), ...[...dataMap.values()].map((item) => item.viewId)])];
  const views: View[] = viewNames.map((viewName, viewIndex) => {
    const config = configMap.get(viewName) || {};
    const isBaselinePlanView = title === BASELINE_PLAN_TITLE && viewName === BASELINE_PLAN_VIEW_NAME;
    const projectStyles = new Map<string, Record<string, unknown>>(
      Array.isArray(config.projectData)
        ? (config.projectData as Record<string, unknown>[]).map((project) => [stringValue(project.name), project])
        : [],
    );
    const dataProjects = [...dataMap.values()]
      .filter((item) => item.viewId === viewName)
      .map((item, index) => {
        const style = projectStyles.get(item.name);
        return normalizeProject(
          {
            ...(style || {}),
            name: style?.name || item.name,
            tag: item.tag,
            detailRemark: item.detailRemark,
            uuid: item.uuid || style?._uuid,
          },
          viewName,
          index,
          item.milestones,
        );
      });

    const trimmedDataProjects = isBaselinePlanView ? dataProjects.slice(0, Math.max(0, dataProjects.length - 4)) : dataProjects;
    const trimmedProjectNames = new Set(trimmedDataProjects.map((project) => project.name));
    const styleOnlyProjects = [...projectStyles.values()]
      .filter((style) => !dataProjects.some((project) => project.name === stringValue(style.name)))
      .map((style, index) => normalizeProject(style, viewName, dataProjects.length + index));
    const [fallbackStart, fallbackEnd] = parseDateBounds(config);
    const connections = Array.isArray(config.connections) ? (config.connections as Connection[]) : [];
    return {
      id: `view_${viewName}`,
      parentViewId: stringValue(config.parentViewId) || undefined,
      name: viewName,
      type: config.type === "whiteboard" ? "whiteboard" : config.type === "plan" ? "plan" : "chart",
      startDate: normalizeDate(config.viewStartTime, fallbackStart),
      endDate: normalizeDate(config.viewEndTime, fallbackEnd),
      content: stringValue(config.content),
      columnWidth: 20,
      projects: isBaselinePlanView
        ? [...trimmedDataProjects, ...styleOnlyProjects.filter((project) => trimmedProjectNames.has(project.name))]
        : [...dataProjects, ...styleOnlyProjects],
      connections: isBaselinePlanView
        ? connections.filter((connection) => trimmedProjectNames.has(connection.fromProject) && trimmedProjectNames.has(connection.toProject))
        : connections,
      planItems: normalizePlanItems(config.planItems),
    };
  });

  const normalizedViews = views.length
    ? views
    : [{ id: "view_default", name: "Default", type: "chart" as const, startDate: "2026-01-01", endDate: "2026-12-31", content: "", columnWidth: 20, projects: [], connections: [] }];
  const existingTest = normalizedViews.find((view) => view.name.toLowerCase() === "test");
  const parentView = normalizedViews.find((view) => view.name === BASELINE_PLAN_VIEW_NAME)
    || normalizedViews.find((view) => view.id !== existingTest?.id)
    || normalizedViews[0];
  const parentAlreadyContainsTest = hasReferenceTestContent(parentView);
  const testView = createReferenceTestView(existingTest?.id || "view_test", existingTest?.name || "test", parentView.id);
  const finalViews = existingTest
    ? normalizedViews.map((view) => view.id === existingTest.id ? testView : view)
    : parentAlreadyContainsTest ? normalizedViews : [...normalizedViews, testView];
  const mergedViews = mergeReferenceTestView(finalViews);
  return {
    version: CURRENT_DATA_VERSION,
    title,
    theme,
    background: "theme-light-1",
    activeViewId: parentView.id,
    views: mergedViews,
  };
}

function createReferenceTestView(id = "view_test", name = "test", parentViewId?: string): View {
  const ms = (id: string, iteration: string, releaseDate: string, remark = "", color = "#f4fff7", shape = "diamond"): Milestone => {
    const parsed = parseWeekYearFromRemark(remark);
    return {
      id, iteration, releaseDate, remark, detailRemark: "", color, textColor: "#d8ff3e", shape,
      week: parsed.week, year: parsed.year,
    };
  }
  const project = (uuid: string, name: string, rowHeight: number, milestones: Milestone[] = [], bgColor = "#00323c"): Project => ({
    uuid, name, tag: "Project plan", detailRemark: "Reference plan workstream", bgColor, textColor: "#ffffff", milestones, viewId: id, rowHeight,
  });
  const frame = (id: string, x: number, y: number, width: number, height = 16): PlanItem => ({ id, kind: "frame", x, y, width, height, text: "", color: "#ffffff", fontSize: 11 });
  const text = (id: string, x: number, y: number, width: number, value: string, color = "#d8ff3e", fontSize = 11): PlanItem => ({ id, kind: "text", x, y, width, height: 36, text: value, color, fontSize });

  const baseline = project("test_baseline", "Baseline Release", 58, [
    ms("test_ipd10", "IPD1.0", "2026-04-15", "15/06"),
    ms("test_ipd20", "IPD2.0", "2026-06-22", "22/06"),
    ms("test_ipd30", "IPD3.0", "2026-08-24", "24/06"),
    ms("test_ipd40", "IPD4.0", "2026-10-30", "30/06"),
    ms("test_ipd50", "IPD5.0", "2026-12-04", "4/06"),
    ms("test_ipd60", "IPD6.0", "2027-02-19", "19/27"),
    ms("test_ipd65", "IPD6.5", "2027-04-02", "4/27"),
    ms("test_cea20", "CEA2.0", "2027-06-18", "18/27", "#fff5a8"),
    ms("test_sp", "SP", "2027-08-26", "26/27"),
  ]);
  const pep = project("test_pep", "PEP", 48, [
    ms("test_pre_pvf", "Pre-PVF", "2026-11-05", "43/26", "#ffffff", "triangle"),
    ms("test_uft", "UFT", "2027-02-19", "7/27", "#ffffff", "triangle"),
    ms("test_pvsmgs", "PVS/MGS", "2027-05-12", "14/27", "#ffffff", "triangle"),
    ms("test_sop", "SOP", "2027-08-26", "26/27", "#ffffff", "triangle"),
  ]);

  return {
    id,
    parentViewId,
    name,
    type: "plan",
    startDate: "2026-02-01",
    endDate: "2028-12-31",
    content: "CMP 21CS A NB PHEV VW311/1 CN_P Project Plan",
    columnWidth: 20,
    projects: [
      baseline,
      pep,
      project("test_fusa", "FuSa Management", 64, [], "#293774"),
      project("test_initial", "Initial", 48),
      project("test_concept", "Concept development", 54),
      project("test_system", "System development", 54),
      project("test_validation", "Validation", 56),
      project("test_verification", "Verification test", 52, [
        ms("test_ipd40_v", "IPD 4.0", "2026-10-30", "40/26–46/26", "#d7ead0", "flag"),
        ms("test_ipd50_v", "IPD 5.0", "2027-02-19", "3/27–6/27", "#d7ead0", "flag"),
        ms("test_ipd65_v", "IPD 6.5", "2027-05-12", "14/27–16/27", "#d7ead0", "flag"),
      ]),
      project("test_validation_test", "Validation test", 52, [ms("test_release_test", "Release test", "2027-05-12", "12/27–16/27", "#d7ead0", "flag")]),
      project("test_release", "Release", 54, [
        ms("test_sw_release", "SW Release", "2027-05-26", "CW16–CW17.5", "#fff5a8", "flag"),
        ms("test_vehicle_release", "Vehicle Release", "2027-06-25", "CW21.5", "#fff5a8", "flag"),
        ms("test_release_final", "Release", "2027-08-26", "Safety Case", "#d8ff3e", "flag"),
      ]),
    ],
    connections: [
      { id: "test_c1", fromProject: "Baseline Release", fromMsId: "test_ipd50", toProject: "PEP", toMsId: "test_pre_pvf", shape: "straight", lineType: "thin-solid", color: "#00e39a" },
      { id: "test_c2", fromProject: "Baseline Release", fromMsId: "test_ipd60", toProject: "PEP", toMsId: "test_uft", shape: "straight", lineType: "thin-solid", color: "#00e39a" },
      { id: "test_c3", fromProject: "Baseline Release", fromMsId: "test_ipd65", toProject: "PEP", toMsId: "test_pvsmgs", shape: "straight", lineType: "thin-solid", color: "#00e39a" },
      { id: "test_c4", fromProject: "Baseline Release", fromMsId: "test_cea20", toProject: "PEP", toMsId: "test_sop", shape: "straight", lineType: "thin-solid", color: "#00e39a" },
    ],
    planItems: inferTextFrameBindings([
      frame("test_fusa_frame", 68, 193, 1010, 16),
      text("test_fusa_text", 590, 210, 330, "Safety Management\n• Safety Plan\n• Functional safety audit and assessment"),
      frame("test_initial_frame", 118, 254, 192, 16),
      text("test_initial_text", 330, 244, 250, "FuSa initialize\n• Item Definition\n• Impact Analysis"),
      frame("test_concept_frame", 150, 306, 336, 16),
      text("test_concept_text", 505, 292, 300, "Concept Development\n• HARA\n• Functional Safety Concept"),
      frame("test_system_frame", 278, 358, 660, 16),
      text("test_system_text", 958, 345, 360, "System development\n• System Safety Concept (FSC/TSC)\n• System integration and test strategy\n• System verification definition"),
      frame("test_validation_frame", 610, 414, 560, 16),
      text("test_validation_text", 1180, 408, 300, "Safety validation\n• System integration and test\n• Report\n• System validation report"),
      text("test_release_notes", 1180, 566, 310, "Release\n• Safety Case\n• Conformation measure report"),
    ]),
  };
}

export function createDemoData(): AppData {
  const view: View = {
    id: "view_demo",
    name: BASELINE_PLAN_VIEW_NAME,
    type: "chart",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    content: "",
    columnWidth: 20,
    connections: [],
    projects: [
      {
        uuid: "project_demo_1",
        name: "IPD Platform Release",
        tag: "IPD3.0",
        detailRemark: "Baseline release milestones",
        bgColor: "transparent",
        textColor: "#122033",
        viewId: "view_demo",
        milestones: [
          { id: "ms_demo_1", iteration: "Kick Off", releaseDate: "2026-02-09", remark: "", detailRemark: "", color: "#0f766e", textColor: "#122033", shape: "diamond" },
          { id: "ms_demo_2", iteration: "HW Freeze", releaseDate: "2026-03-06", remark: "", detailRemark: "", color: "#2563eb", textColor: "#122033", shape: "diamond" },
          { id: "ms_demo_3", iteration: "Release", releaseDate: "2026-07-31", remark: "", detailRemark: "", color: "#dc2626", textColor: "#122033", shape: "flag" },
        ],
      },
      {
        uuid: "project_demo_2",
        name: "Vehicle integration",
        tag: "TBT",
        detailRemark: "Integration and verification checkpoints",
        bgColor: "transparent",
        textColor: "#122033",
        viewId: "view_demo",
        showSeparatorAbove: true,
        milestones: [
          { id: "ms_demo_4", iteration: "PI Start", releaseDate: "2026-06-19", remark: "", detailRemark: "", color: "#7c3aed", textColor: "#122033", shape: "circle" },
          { id: "ms_demo_5", iteration: "Vehicle MS", releaseDate: "2026-09-25", remark: "", detailRemark: "", color: "#d97706", textColor: "#122033", shape: "triangle" },
        ],
      },
    ],
  };
  const testView = createReferenceTestView("view_test", "test", view.id);
  return { version: CURRENT_DATA_VERSION, title: BASELINE_PLAN_TITLE, theme: "theme-light-1", background: "theme-light-1", activeViewId: view.id, views: mergeReferenceTestView([view, testView]) };
}

export function migrateAppData(data: AppData): AppData {
  const sanitizedViews = data.views.map((view, viewIndex) => dedupeViewContent({
    ...view,
    planItems: inferTextFrameBindings((view.planItems || []).map((item) => item.text === "New phase" ? { ...item, text: "" } : item)),
    connections: viewIndex < 4
      ? view.connections.map((conn) => {
          const c = (conn.color || "").toLowerCase();
          if (c === "#000000" || c === "#000" || c === "black" || c === "#100" || c === "#111111" || c === "#1a1a1a" || c === "#122033") {
            return { ...conn, color: "#ffffff" };
          }
          return conn;
        })
      : view.connections,
    projects: viewIndex < 4
      ? view.projects.map((project) => ({
          ...project,
          milestones: project.milestones.map((ms) => {
            const tc = (ms.textColor || "").toLowerCase();
            if (tc === "#122033" || tc === "#000000" || tc === "#000" || tc === "black" || tc === "#111111" || tc === "#1a1a1a" || tc === "#100" || tc === "#0f172a" || tc === "#1e293b") {
              return { ...ms, textColor: "#e2e8f0" };
            }
            return ms;
          }),
        }))
      : view.projects,
  }));
  const existingTest = sanitizedViews.find((view) => view.name.toLowerCase() === "test");
  let views = sanitizedViews;
  const testView = views.find((view) => view.name.toLowerCase() === "test");
  const parentView = views.find((view) => view.name === BASELINE_PLAN_VIEW_NAME)
    || views.find((view) => view.id !== testView?.id);
  if (testView && parentView) {
    views = views.map((view) => view.id === testView.id ? { ...view, parentViewId: parentView.id } : view);
  }
  const activeViewId = testView && data.activeViewId === testView.id && parentView ? parentView.id : data.activeViewId;
  if (data.version >= CURRENT_DATA_VERSION) return { ...data, activeViewId, views: mergeReferenceTestView(views) };
  if (data.version >= BASELINE_ROWS_REMOVAL_VERSION || data.title !== BASELINE_PLAN_TITLE) {
    return { ...data, version: CURRENT_DATA_VERSION, activeViewId, views: mergeReferenceTestView(views) };
  }

  views = views.map((view) => {
    if (view.name !== BASELINE_PLAN_VIEW_NAME || view.projects.length < 4) return view;
    const projects = view.projects.slice(0, -4);
    const projectNames = new Set(projects.map((project) => project.name));
    return {
      ...view,
      projects,
      connections: view.connections.filter(
        (connection) => projectNames.has(connection.fromProject) && projectNames.has(connection.toProject),
      ),
    };
  });
  return { ...data, version: CURRENT_DATA_VERSION, activeViewId, views: mergeReferenceTestView(views) };
}

export function loadBaselineAppData(
  storageKey: string,
): { data: AppData; source: "localStorage" } {
  if (typeof window === "undefined") throw new Error("当前计划数据只能在浏览器中读取。");
  const local = window.localStorage.getItem(storageKey);
  if (!local) throw new Error("未找到当前时间计划数据，请先返回时间计划页面创建或导入计划。");
  try {
    const restored = JSON.parse(local) as AppData;
    if (!restored?.views?.length) throw new Error("当前时间计划没有可用视图。");
    return { data: migrateAppData(restored), source: "localStorage" };
  } catch (error) {
    if (error instanceof Error && error.message === "当前时间计划没有可用视图。") throw error;
    throw new Error("当前时间计划数据无法读取，请返回时间计划页面重新保存后再试。");
  }
}

export function buildWorkbook(data: AppData): any {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error("Excel engine is still loading.");
  const workbook = xlsx.utils.book_new();
  const configRows: unknown[][] = [
    ["title", data.title, ""],
    ["bgColor", data.theme, ""],
    ["Group", "", "Group JSON 配置"],
  ];
  for (const view of data.views) {
    const config = {
      type: view.type,
      parentViewId: view.parentViewId,
      content: view.content,
      colWidth: view.columnWidth || 20,
      projectData: view.projects.map((project) => ({
        name: project.name,
        bgColor: project.bgColor,
        textColor: project.textColor,
        _uuid: project.uuid,
        rowHeight: project.rowHeight || 76,
        showSeparatorAbove: project.showSeparatorAbove,
      })),
      viewStartTime: view.startDate,
      viewEndTime: view.endDate,
      connections: view.connections,
      planItems: view.planItems || [],
    };
    const json = JSON.stringify(config);
    const chunks = json.match(new RegExp(`.{1,${EXCEL_MAX_CELL_LEN}}`, "g")) || [""];
    configRows.push([view.name, "", chunks[0]]);
    chunks.slice(1).forEach((chunk, index) => configRows.push([`[[OF${index + 1}_${view.name}]]`, "", chunk]));
  }
  const dataRows: unknown[][] = [["项目", "里程碑JSON", "标签", "详细备注", "UUID", "视图"]];
  for (const view of data.views) {
    for (const project of view.projects) {
      dataRows.push([project.name, JSON.stringify(project.milestones), project.tag, project.detailRemark, project.uuid, view.name]);
    }
  }
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(configRows), "Config");
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(dataRows), "Data");
  return workbook;
}

export function exportWorkbook(data: AppData, filename = "time-plan-viewer.xlsx"): void {
  const workbook = buildWorkbook(data);
  window.XLSX?.writeFile(workbook, filename);
}

export function allProjects(data: AppData): Project[] {
  return data.views.flatMap((view) => view.projects);
}

export function allMilestones(data: AppData): Milestone[] {
  return allProjects(data).flatMap((project) => project.milestones);
}

export function validateData(data: AppData): string[] {
  const issues: string[] = [];
  const viewNames = new Set<string>();
  for (const view of data.views) {
    if (viewNames.has(view.name)) issues.push(`视图名称重复：${view.name}`);
    viewNames.add(view.name);
    if (!view.startDate || !view.endDate || view.startDate > view.endDate) issues.push(`视图“${view.name}”的日期范围无效`);
    const projectNames = new Set(view.projects.map((project) => project.name));
    const milestoneIds = new Set(view.projects.flatMap((project) => project.milestones.map((milestone) => milestone.id)));
    for (const project of view.projects) {
      if (!project.uuid) issues.push(`视图“${view.name}”中的项目“${project.name}”缺少 UUID`);
      for (const milestone of project.milestones) {
        if (!milestone.releaseDate) issues.push(`项目“${project.name}”存在无日期里程碑`);
      }
    }
    let brokenConnections = 0;
    for (const connection of view.connections) {
      const hasStart = projectNames.has(connection.fromProject) && milestoneIds.has(connection.fromMsId);
      const hasEnd = projectNames.has(connection.toProject) && milestoneIds.has(connection.toMsId);
      if (!hasStart || !hasEnd) brokenConnections += 1;
    }
    if (brokenConnections) issues.push(`视图“${view.name}”有 ${brokenConnections} 条连接引用了已改名或已删除的项目/里程碑`);
  }
  return issues;
}

export function mergeImportedData(oldData: AppData, newData: AppData): AppData {
  const oldViews = new Map(oldData.views.map((v) => [v.name, v]));

  const mergedViews = newData.views.map((newView) => {
    const oldView = oldViews.get(newView.name);

    if (!oldView) return newView;

    const oldProjects = new Map(oldView.projects.map((p) => [p.name, p]));

    const mergedProjects = newView.projects.map((newProject) => {
      const oldProject = oldProjects.get(newProject.name);
      if (!oldProject) return newProject;

      const oldMs = new Map(
        (oldProject.milestones || []).map((m) => [m.id, m]),
      );

      const mergedMs = (newProject.milestones || []).map((newMs) => {
        const oldM = oldMs.get(newMs.id);
        if (!oldM) return newMs;
        return oldM;
      });

      const extraMs = (oldProject.milestones || [])
        .filter((m) => !mergedMs.some((mm) => mm.id === m.id));

      return {
        ...newProject,
        uuid: oldProject.uuid,
        bgColor: oldProject.bgColor,
        textColor: oldProject.textColor,
        rowHeight: oldProject.rowHeight,
        showSeparatorAbove: oldProject.showSeparatorAbove,
        milestones: [...mergedMs, ...extraMs],
      };
    });

    const oldConns = new Map((oldView.connections || []).map((c) => [c.id, c]));
    const newConnIds = new Set((newView.connections || []).map((c) => c.id));
    const mergedConns = (newView.connections || []).map((newConn) => {
      const oldConn = oldConns.get(newConn.id);
      if (!oldConn) return newConn;
      return {
        ...newConn,
        color: oldConn.color,
        shape: oldConn.shape,
        lineType: oldConn.lineType,
      };
    });

    const extraConns = (oldView.connections || [])
      .filter((c) => !newConnIds.has(c.id));

    const deletedConnIds = oldData.deletedConnectionIds || [];
    const filteredExtraConns = extraConns.filter((c) => !deletedConnIds.includes(c.id));
    const filteredMergedConns = mergedConns.filter((c) => !deletedConnIds.includes(c.id));

    return {
      ...newView,
      columnWidth: oldView.columnWidth,
      planItems: oldView.planItems,
      projects: mergedProjects,
      connections: [...filteredMergedConns, ...filteredExtraConns],
    };
  });

  return {
    ...newData,
    theme: oldData.theme,
    background: oldData.background,
    views: mergedViews,
  };
}
