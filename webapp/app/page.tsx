"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  allProjects,
  createDemoData,
  exportWorkbook,
  mergeImportedData,
  migrateAppData,
  parseWorkbook,
  parseSheets,
} from "./data";
import type { AppData, Connection, Milestone, PlanItem, Project, View } from "./types";
import { MilestoneDrawer } from "./MilestoneDrawer";
import { ProjectPlanCanvas } from "./ProjectPlanCanvas";
import { AiChatPanel } from "./AiChatPanel";
import { ManagementDashboard } from "./ManagementDashboard";
import { CHANGE_PREVIEW_KEY, loadPlanChangePreview, type PlanChangePreview } from "./change-preview";
import { ExcelAnalysisEmbedded } from "./ExcelAnalysisEmbedded";
import { CeaVersionView } from "./CeaVersionView";
import FeishuTableView from "./FeishuTableView";

const STORAGE_KEY = "time-plan-viewer-v4";

type MilestoneSelection = {
  projectId: string;
  milestoneId: string;
};

type ArrowEndpoint = {
  projectId: string;
  milestoneId: string;
};

function dateValue(value: string): number {
  return new Date(`${value || "2026-01-01"}T00:00:00`).valueOf();
}

function formatDate(value: string): string {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function percentBetween(value: string, start: string, end: string): number {
  const total = dateValue(end) - dateValue(start);
  if (!total) return 0;
  return Math.max(0, Math.min(100, ((dateValue(value) - dateValue(start)) / total) * 100));
}

function updateActiveView(data: AppData, updater: (view: View) => View): AppData {
  return { ...data, views: data.views.map((view) => (view.id === data.activeViewId ? updater(view) : view)) };
}

function updateProject(data: AppData, projectId: string, updater: (project: Project) => Project): AppData {
  return updateActiveView(data, (view) => ({ ...view, projects: view.projects.map((project) => (project.uuid === projectId ? updater(project) : project)) }));
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [data, setData] = useState<AppData | null>(null);
  const [changePreview, setChangePreview] = useState<PlanChangePreview | null>(null);
  const [showExcelAnalysis, setShowExcelAnalysis] = useState(false);
  const [rawFeishuSheets, setRawFeishuSheets] = useState<Array<{ title: string; values: unknown[][] }> | null>(null);
  const [rawSheetIndex, setRawSheetIndex] = useState(0);
  const [rawSearch, setRawSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("全部标签");
  const [sortMode, setSortMode] = useState<"manual" | "date" | "name">("manual");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneSelection | null>(null);
  const [importing, setImporting] = useState(false);
  const [showFeishuImport, setShowFeishuImport] = useState(false);
  const [feishuStatus, setFeishuStatus] = useState("");
  const [feishuStatusTone, setFeishuStatusTone] = useState<"loading" | "success" | "error">("error");
  const [feishuSyncStatus, setFeishuSyncStatus] = useState<{ projects: number; milestones: number; syncedProjects: number; recentSyncs: Array<{ recordId: string; action: string; processed: boolean; error: string | null; receivedAt: string }> } | null>(null);
  const [feishuStatusLoading, setFeishuStatusLoading] = useState(false);
  const [feishuSyncLoading, setFeishuSyncLoading] = useState(false);
  const [showAddMilestonePicker, setShowAddMilestonePicker] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<string | null>(null);
  const [arrowMode, setArrowMode] = useState(false);
  const [arrowStart, setArrowStart] = useState<ArrowEndpoint | null>(null);
  const [arrowDashed, setArrowDashed] = useState(false);
  const [arrowColor, setArrowColor] = useState("#d8ff3e");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"overview" | "timeline" | "cea" | "feishu-table">("overview");
  const inputRef = useRef<HTMLInputElement>(null);
  const changePreviewRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (let attempt = 0; attempt < 30 && !window.XLSX; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (new URLSearchParams(window.location.search).get("changePreview") === "1") {
        const preview = loadPlanChangePreview();
        if (preview) {
          changePreviewRef.current = true;
          if (alive) {
            setChangePreview(preview);
            setData(migrateAppData(preview.data));
            setWorkspaceMode("timeline");
          }
          return;
        }
      }
      const local = window.localStorage.getItem(STORAGE_KEY);
      if (local) {
        try {
          const restored = JSON.parse(local) as AppData;
          if (alive && restored?.views?.length) {
            setData(migrateAppData(restored));
            return;
          }
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      try {
        const response = await fetch("/sample-plan.xlsx");
        const buffer = await response.arrayBuffer();
        if (alive && window.XLSX) {
          const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
          setData(migrateAppData(parseWorkbook(workbook)));
          return;
        }
      } catch {
        // The demo data is still useful when the sample workbook is unavailable.
      }
      if (alive) setData(createDemoData());
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "feishu-script") return;
    let alive = true;
    const tryImport = async (attempt: number) => {
      if (!window.XLSX) {
        if (attempt < 30 && alive) {
          setTimeout(() => void tryImport(attempt + 1), 200);
          return;
        }
        window.alert("Excel 引擎未加载，请刷新页面重试。");
        return;
      }
      try {
        const response = await fetch("http://127.0.0.1:3999/import-raw");
        if (!response.ok) throw new Error("未找到待导入的数据，请重新从飞书发送。");
        const buffer = await response.arrayBuffer();
        if (!alive) return;
        const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
        setData(migrateAppData(parseWorkbook(workbook)));
        setSelectedProjectId("");
        setSelectedMilestone(null);
        setSelectedPlanItemId(null);
        setSelectedConnectionId(null);
        setWorkspaceMode("timeline");
        window.history.replaceState(null, "", window.location.pathname);
        window.localStorage.setItem("time-plan-viewer-feishu-source", "feishu-script");
        window.alert("已从飞书导入表格数据。");
      } catch (err) {
        if (!alive) return;
        window.alert(`导入失败：${err instanceof Error ? err.message : "未知错误"}`);
        window.history.replaceState(null, "", window.location.pathname);
      }
    };
    void tryImport(0);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (data && !changePreviewRef.current) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (data) exportWorkbook(data);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[role='dialog'], .milestone-editor-backdrop, .drawer")) return;
      const scrollContainer = document.querySelector(".project-plan-scroll") as HTMLElement | null;
      if (!scrollContainer) return;
      const hasHorizontalScroll = scrollContainer.scrollWidth > scrollContainer.clientWidth + 1;
      if (!hasHorizontalScroll) return;
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 1;
      const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
      if (event.deltaY > 0 && atBottom && scrollContainer.scrollLeft < maxScrollLeft) {
        event.preventDefault();
        scrollContainer.scrollLeft = Math.min(maxScrollLeft, scrollContainer.scrollLeft + event.deltaY);
      } else if (event.deltaY < 0 && scrollContainer.scrollLeft > 0 && atBottom) {
        event.preventDefault();
        scrollContainer.scrollLeft = Math.max(0, scrollContainer.scrollLeft + event.deltaY);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  const activeView = data?.views.find((view) => view.id === data.activeViewId) || data?.views[0];
  const activeProject = activeView?.projects.find((project) => project.uuid === selectedProjectId);
  const activeMilestoneProject = selectedMilestone
    ? activeView?.projects.find((project) => project.uuid === selectedMilestone.projectId)
    : undefined;
  const activeMilestone = activeMilestoneProject?.milestones.find((milestone) => milestone.id === selectedMilestone?.milestoneId);
  const selectedPlanItem = activeView?.planItems?.find((item) => item.id === selectedPlanItemId);
  const selectedConnection = activeView?.connections.find((conn) => conn.id === selectedConnectionId);
  const tags = useMemo(() => {
    if (!data) return [];
    return [...new Set(allProjects(data).map((project) => project.tag).filter(Boolean))];
  }, [data]);
  const visibleProjects = useMemo(() => {
    if (!activeView) return [];
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = activeView.projects.filter((project) => {
      const matchesQuery = !normalizedQuery || [project.name, project.tag, project.detailRemark, ...project.milestones.map((milestone) => milestone.iteration)].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesQuery && (tagFilter === "全部标签" || project.tag === tagFilter);
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name, "zh");
      if (sortMode === "date") return (a.milestones[0]?.releaseDate || "9999").localeCompare(b.milestones[0]?.releaseDate || "9999");
      return 0;
    });
  }, [activeView, query, tagFilter, sortMode]);
  const changedViewNames = useMemo(() => new Set(changePreview?.changes.map((change) => change.view).filter(Boolean) as string[] || []), [changePreview]);
  const changeHighlights = useMemo(() => {
    if (!changePreview || !activeView) return { projects: [], milestones: [] };
    const projects = new Set<string>();
    const milestones = new Set<string>();
    changePreview.changes.forEach((change) => {
      if (change.view && change.view !== activeView.name) return;
      if (!change.project) return;
      projects.add(change.project);
      const project = activeView.projects.find((candidate) => candidate.name === change.project);
      if (project?.milestones.some((milestone) => milestone.iteration === change.item)) {
        milestones.add(`${change.project}::${change.item}`);
      }
    });
    return { projects: [...projects], milestones: [...milestones] };
  }, [activeView, changePreview]);
  if (!data || !activeView) {
    return <main className="loading-screen"><div className="loading-mark"><span className="radar-dot" /><span className="radar-ring ring-outer" /><span className="radar-ring ring-inner" /><span className="radar-sweep" /></div><p>正在载入时间计划…</p></main>;
  }

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      if (!window.XLSX) throw new Error("Excel engine unavailable");
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
      setData(migrateAppData(parseWorkbook(workbook)));
      setSelectedProjectId("");
      setSelectedMilestone(null);
      setShowAddMilestonePicker(false);
    } catch (error) {
      window.alert(`导入失败：${error instanceof Error ? error.message : "文件格式无法识别"}`);
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const createView = () => {
    const name = newViewName.trim();
    if (!name) return;
    const view: View = {
      id: `view_${Date.now()}`,
      name,
      type: "plan",
      startDate: activeView.startDate,
      endDate: activeView.endDate,
      content: "",
      columnWidth: activeView.columnWidth || 20,
      projects: [],
      connections: [],
      planItems: [],
    };
    setData({ ...data, views: [...data.views, view], activeViewId: view.id });
    setNewViewName("");
    setShowViewDialog(false);
  };

  const removeView = () => {
    if (data.views.length === 1) return window.alert("至少保留一个视图。");
    if (!window.confirm(`确认删除视图“${activeView.name}”？`)) return;
    const nextViews = data.views.filter((view) => view.id !== activeView.id);
    setData({ ...data, views: nextViews, activeViewId: nextViews[0].id });
    setSelectedProjectId("");
    setSelectedMilestone(null);
  };

  const updateViewDate = (key: "startDate" | "endDate", value: string) => {
    setData(updateActiveView(data, (view) => ({ ...view, [key]: value })));
  };

  const updateColumnWidth = (change: number) => {
    setData(updateActiveView(data, (view) => ({
      ...view,
      columnWidth: Math.max(6, Math.min(300, (view.columnWidth || 20) + change)),
    })));
  };

  const updateMilestone = (projectId: string, milestoneId: string, updater: (milestone: Milestone) => Milestone) => {
    setData(updateActiveView(data, (view) => ({
      ...view,
      projects: view.projects.map((project) => {
        if (project.uuid !== projectId) return project;
        return {
          ...project,
          milestones: project.milestones.map((milestone) => (milestone.id === milestoneId ? updater(milestone) : milestone)),
        };
      }),
    })));
  };

  const addMilestoneToProject = (projectId: string) => {
    const milestone: Milestone = {
      id: `ms_${Date.now()}`,
      iteration: "新里程碑",
      releaseDate: activeView.startDate,
      remark: "",
      detailRemark: "",
      color: "blue",
      textColor: "#1a1a1a",
      shape: "diamond",
    };
    setData(updateProject(data, projectId, (project) => ({ ...project, milestones: [...project.milestones, milestone] })));
    setSelectedProjectId("");
    setSelectedMilestone({ projectId, milestoneId: milestone.id });
  };

  const saveMilestone = (patch: Partial<Milestone>) => {
    if (!selectedMilestone || !activeMilestone) return;
    updateMilestone(selectedMilestone.projectId, selectedMilestone.milestoneId, (milestone) => ({ ...milestone, ...patch }));
  };

  const deleteMilestone = () => {
    if (!selectedMilestone || !activeMilestoneProject || !activeMilestone) return;
    if (!window.confirm(`确认删除里程碑“${activeMilestone.iteration}”？`)) return;
    setData(updateActiveView(data, (view) => ({
      ...view,
      projects: view.projects.map((project) => {
        if (project.uuid !== selectedMilestone.projectId) return project;
        return { ...project, milestones: project.milestones.filter((milestone) => milestone.id !== selectedMilestone.milestoneId) };
      }),
    })));
    setSelectedMilestone(null);
  };

  const beginAddMilestone = () => {
    if (!activeView.projects.length) {
      window.alert("当前视图没有可添加里程碑的项目，请先导入包含项目的数据。");
      return;
    }
    if (activeView.projects.length === 1) {
      addMilestoneToProject(activeView.projects[0].uuid);
      return;
    }
    setSelectedProjectId("");
    setSelectedMilestone(null);
    setShowAddMilestonePicker(true);
  };

  const addProjectRow = () => {
    const row: Project = {
      uuid: `project_${Date.now()}`,
      name: "New workstream",
      tag: "",
      detailRemark: "",
      bgColor: "#063642",
      textColor: "#ffffff",
      milestones: [],
      viewId: activeView.id,
    };
    setData(updateActiveView(data, (view) => ({ ...view, projects: [...view.projects, row] })));
    setSelectedProjectId(row.uuid);
  };

  const saveProject = (projectId: string, patch: Partial<Project>) => {
    const current = activeView.projects.find((project) => project.uuid === projectId);
    const nextName = patch.name?.trim() || current?.name;
    setData(updateActiveView(data, (view) => ({
      ...view,
      projects: view.projects.map((project) => project.uuid === projectId ? { ...project, ...patch, name: nextName || project.name } : project),
      connections: current && nextName && nextName !== current.name
        ? view.connections.map((connection) => ({ ...connection, fromProject: connection.fromProject === current.name ? nextName : connection.fromProject, toProject: connection.toProject === current.name ? nextName : connection.toProject }))
        : view.connections,
    })));
  };

  const deleteProject = (projectId: string) => {
    const target = activeView.projects.find((project) => project.uuid === projectId);
    if (!target || !window.confirm(`确定删除行“${target.name}”及其全部里程碑吗？`)) return;
    setData(updateActiveView(data, (view) => ({
      ...view,
      projects: view.projects.filter((project) => project.uuid !== projectId),
      connections: view.connections.filter((connection) => connection.fromProject !== target.name && connection.toProject !== target.name),
    })));
    setSelectedProjectId("");
  };

  const addPlanItem = (kind: PlanItem["kind"]) => {
    const count = activeView.planItems?.length || 0;
    const item: PlanItem = {
      id: `plan_${Date.now()}`,
      kind,
      x: 80 + count * 24,
      y: 92 + count * 22,
      width: kind === "frame" ? 260 : 180,
      height: kind === "frame" ? 76 : 36,
      text: kind === "frame" ? "" : "New text",
      color: "#d8ff3e",
      fontSize: 13,
    };
    setData(updateActiveView(data, (view) => ({ ...view, planItems: [...(view.planItems || []), item] })));
    setSelectedPlanItemId(item.id);
  };

  const updatePlanItem = (itemId: string, patch: Partial<PlanItem>) => {
    setData((currentData) => {
      if (!currentData) return currentData;
      return updateActiveView(currentData, (view) => {
        const items = view.planItems || [];
        const currentItem = items.find((item) => item.id === itemId);
        if (!currentItem) return view;
        const nextX = patch.x ?? currentItem.x;
        const nextY = patch.y ?? currentItem.y;
        const dx = nextX - currentItem.x;
        const dy = nextY - currentItem.y;
        return {
          ...view,
          planItems: items.map((item) => {
            if (item.id === itemId) return { ...item, ...patch };
            if (currentItem.kind === "frame" && item.parentFrameId === itemId && (dx || dy)) {
              return { ...item, x: item.x + dx, y: item.y + dy };
            }
            return item;
          }),
        };
      });
    });
  };

  const loadFeishuSyncStatus = async () => {
    setFeishuStatusLoading(true);
    setFeishuStatus("");
    try {
      const webhookToken = process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || "";
      const params = new URLSearchParams();
      if (webhookToken) params.set("token", webhookToken);
      const response = await fetch(`/api/feishu/sync-status${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string; projects?: number; milestones?: number; syncedProjects?: number; recentSyncs?: Array<{ recordId: string; action: string; processed: boolean; error: string | null; receivedAt: string }> };
      if (!response.ok) throw new Error(payload.error || "查询同步状态失败。");
      setFeishuSyncStatus({
        projects: payload.projects ?? 0,
        milestones: payload.milestones ?? 0,
        syncedProjects: payload.syncedProjects ?? 0,
        recentSyncs: payload.recentSyncs ?? [],
      });
      setFeishuStatus("同步状态已刷新。");
      setFeishuStatusTone("success");
    } catch (error) {
      setFeishuStatus(error instanceof Error ? error.message : "查询同步状态失败。");
      setFeishuStatusTone("error");
    } finally {
      setFeishuStatusLoading(false);
    }
  };

  const loadFeishuSyncData = async () => {
    setFeishuSyncLoading(true);
    setFeishuStatus("正在从数据库加载飞书同步数据…");
    setFeishuStatusTone("loading");
    try {
      const webhookToken = process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || "";
      const params = new URLSearchParams();
      if (webhookToken) params.set("token", webhookToken);
      const response = await fetch(`/api/feishu/sync-data${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const payload = await response.json() as {
        error?: string;
        projects?: Project[];
        count?: number;
        milestoneCount?: number;
        startDate?: string;
        endDate?: string;
      };
      if (!response.ok) throw new Error(payload.error || "加载同步数据失败。");
      const syncedProjects = payload.projects || [];
      if (!syncedProjects.length) {
        setFeishuStatus("数据库中暂无同步数据。请先在飞书多维表格中配置自动化推送。");
        setFeishuStatusTone("error");
        return;
      }

      const existingNames = new Set(activeView.projects.map((p) => p.name));
      const newProjects = syncedProjects.filter((p) => !existingNames.has(p.name));
      const updatedProjects = syncedProjects.filter((p) => existingNames.has(p.name));

      const viewStartDate = payload.startDate && payload.startDate < activeView.startDate ? payload.startDate : activeView.startDate;
      const viewEndDate = payload.endDate && payload.endDate > activeView.endDate ? payload.endDate : activeView.endDate;

      setData(updateActiveView(data, (view) => ({
        ...view,
        startDate: viewStartDate,
        endDate: viewEndDate,
        projects: [
          ...view.projects.map((p) => {
            const synced = updatedProjects.find((s) => s.name === p.name);
            return synced ? { ...p, milestones: synced.milestones, tag: synced.tag || p.tag, detailRemark: synced.detailRemark || p.detailRemark } : p;
          }),
          ...newProjects,
        ],
      })));

      setWorkspaceMode("timeline");
      setShowFeishuImport(false);
      window.alert(`已加载 ${syncedProjects.length} 个项目（${payload.milestoneCount || 0} 条里程碑）到时间线。新增 ${newProjects.length} 个，更新 ${updatedProjects.length} 个。`);
    } catch (error) {
      setFeishuStatus(error instanceof Error ? error.message : "加载同步数据失败。");
      setFeishuStatusTone("error");
    } finally {
      setFeishuSyncLoading(false);
    }
  };

  const deleteSelectedPlanItem = () => {
    if (!selectedPlanItemId) return;
    const target = activeView.planItems?.find((item) => item.id === selectedPlanItemId);
    const boundCount = target?.kind === "frame"
      ? activeView.planItems?.filter((item) => item.parentFrameId === selectedPlanItemId).length || 0
      : 0;
    if (boundCount && !window.confirm(`该虚线框绑定了 ${boundCount} 个文本框，删除后这些文本框也会一起删除。是否继续？`)) return;
    setData(updateActiveView(data, (view) => ({
      ...view,
      planItems: (view.planItems || []).filter((item) => item.id !== selectedPlanItemId && item.parentFrameId !== selectedPlanItemId),
    })));
    setSelectedPlanItemId(null);
  };

  const updateConnection = (connectionId: string, patch: Partial<Connection>) => {
    setData(updateActiveView(data, (view) => ({ ...view, connections: view.connections.map((conn) => conn.id === connectionId ? { ...conn, ...patch } : conn) })));
  };

  const deleteSelectedConnection = () => {
    if (!selectedConnectionId) return;
    setData({
      ...updateActiveView(data, (view) => ({ ...view, connections: view.connections.filter((conn) => conn.id !== selectedConnectionId) })),
      deletedConnectionIds: [...(data.deletedConnectionIds || []), selectedConnectionId],
    });
    setSelectedConnectionId(null);
  };

  const toggleArrowMode = () => {
    setArrowMode((active) => !active);
    setArrowStart(null);
    setSelectedPlanItemId(null);
  };

  const connectMilestones = (projectId: string, milestoneId: string) => {
    if (!arrowStart) {
      setArrowStart({ projectId, milestoneId });
      return;
    }
    if (arrowStart.projectId === projectId && arrowStart.milestoneId === milestoneId) return;
    const fromProject = activeView.projects.find((project) => project.uuid === arrowStart.projectId);
    const toProject = activeView.projects.find((project) => project.uuid === projectId);
    if (!fromProject || !toProject) return;
    setData(updateActiveView(data, (view) => ({
      ...view,
      connections: [...view.connections, {
        id: `connection_${Date.now()}`,
        fromProject: fromProject.name,
        fromMsId: arrowStart.milestoneId,
        toProject: toProject.name,
        toMsId: milestoneId,
        shape: "straight",
        lineType: arrowDashed ? "thin-dashed" : "thin-solid",
        color: arrowColor,
      }],
    })));
    setArrowStart(null);
    setArrowMode(false);
  };

  const exportPng = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = Math.max(700, 180 + visibleProjects.length * 74);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f7f9fc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#122033";
    ctx.font = "700 30px Arial";
    ctx.fillText(data.title, 40, 54);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`${activeView.name}  ·  ${formatDate(activeView.startDate)} — ${formatDate(activeView.endDate)}`, 40, 86);
    const left = 360;
    const trackWidth = 1370;
    const top = 145;
    visibleProjects.forEach((project, index) => {
      const y = top + index * 74;
      ctx.fillStyle = "#122033";
      ctx.font = "600 16px Arial";
      ctx.fillText(project.name.slice(0, 38), 40, y + 8);
      ctx.fillStyle = "#dbe3ee";
      ctx.fillRect(left, y - 10, trackWidth, 2);
      project.milestones.forEach((milestone) => {
        const x = left + (percentBetween(milestone.releaseDate, activeView.startDate, activeView.endDate) / 100) * trackWidth;
        ctx.fillStyle = milestone.color;
        ctx.beginPath();
        ctx.arc(x, y - 10, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "12px Arial";
        ctx.fillStyle = "#475569";
        ctx.fillText(milestone.iteration.slice(0, 18), x + 12, y - 6);
      });
    });
    const link = document.createElement("a");
    link.download = `${activeView.name}-time-plan.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportHtml = () => {
    const html = `<!doctype html><meta charset="utf-8"><title>${data.title}</title><body style="font:14px Arial;padding:32px"><h1>${data.title}</h1><h2>${activeView.name}</h2>${visibleProjects.map((project) => `<section><h3>${project.name}</h3><p>${project.milestones.map((milestone) => `${milestone.iteration}: ${milestone.releaseDate}`).join(" · ")}</p></section>`).join("")}</body>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeView.name}-view.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const locateFromDashboard = (projectId: string, milestoneId: string) => {
    setWorkspaceMode("timeline");
    setQuery("");
    setTagFilter("全部标签");
    setSelectedProjectId("");
    setSelectedMilestone({ projectId, milestoneId });
  };

  return (
    <main className={`app-shell ${activeProject ? "has-drawer" : ""} ${changePreview ? "change-preview-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span className="radar-dot" /><span className="radar-ring ring-outer" /><span className="radar-ring ring-inner" /><span className="radar-sweep" /></div>
          <strong>Fusa Risk Radar</strong>
        </div>
        <div className="top-actions">
          <label className="button button-primary">
            <Icon>↥</Icon>{importing ? "导入中…" : "导入 Excel"}
            <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => event.target.files?.[0] && void handleImport(event.target.files[0])} />
          </label>
          <button className="button" onClick={() => { setFeishuStatus(""); setShowFeishuImport(true); }}><Icon>⌁</Icon>获取多维表格</button>
          <button className="button" onClick={() => exportWorkbook(data)}><Icon>↧</Icon>导出 Excel</button>
          <button className="button button-quiet" onClick={() => window.print()}><Icon>▣</Icon>打印 / PDF</button>
          <button className="icon-button" title="导出 PNG" onClick={exportPng}>▧</button>
          <button className="icon-button" title="导出 HTML" onClick={exportHtml}>⤴</button>
          <button className="button button-outline" onClick={() => setShowExcelAnalysis(true)}><Icon>▥</Icon>Excel 分析</button>
          <div className="avatar">U</div>
        </div>
      </header>

      {changePreview && (
        <section className="plan-change-preview-banner">
          <div><strong>Excel 变更预览</strong><span>以当前时间计划视图为显示基线，对比 {changePreview.sourceFile} · {changePreview.changes.length} 项变更已用橙色标记</span></div>
          <button className="button button-outline" onClick={() => { window.sessionStorage.removeItem(CHANGE_PREVIEW_KEY); window.location.assign("/"); }}>退出预览，返回当前计划</button>
        </section>
      )}

      <section className={`workspace ${activeProject ? "has-drawer" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-head">
            <div>
              <span className="eyebrow">WORKSPACE</span>
              <h2>计划视图</h2>
            </div>
            <button className="round-button" title="添加视图" onClick={() => setShowViewDialog(true)}>＋</button>
          </div>
          <div className="view-list">
            {data.views.map((view) => (
              <button key={view.id} className={`view-item ${view.id === activeView.id ? "active" : ""}`} onClick={() => { setData({ ...data, activeViewId: view.id }); setSelectedProjectId(""); setSelectedMilestone(null); setShowAddMilestonePicker(false); setSelectedPlanItemId(null); setArrowMode(false); setArrowStart(null); setSelectedConnectionId(null); }}>
                <span className="view-icon">{view.type === "whiteboard" ? "⌘" : "▤"}</span>
                <span className="view-copy"><strong>{view.name}</strong>{changePreview && changedViewNames.has(view.name) && <small className="view-change-indicator">● 有变更</small>}</span>
                {view.id === activeView.id && <span className="active-dot" />}
              </button>
            ))}
          </div>
          <div className="sidebar-foot">
            <p>{changePreview ? "变更预览不会覆盖当前计划" : "本地自动保存已开启"}</p>
          </div>
        </aside>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="breadcrumb">计划视图 <span>/</span> {activeView.name}</div>
              <h1>{data.title}</h1>
              <p>{workspaceMode === "overview" ? "从管理视角掌握计划健康度、近期节点与关键风险。" : workspaceMode === "cea" ? "按 CEA 软件版本分组浏览所有车型的里程碑节点。" : workspaceMode === "feishu-table" ? "查看飞书多维表格 webhook 推送的原始记录数据。" : "统一管理产品、车型和系统里程碑，支持 Excel 往返编辑。"}</p>
            </div>
            <div className="plan-heading-actions">
              <div className="workspace-mode-switch" aria-label="工作区模式">
                <button className={workspaceMode === "overview" ? "active" : ""} onClick={() => { setWorkspaceMode("overview"); setSelectedProjectId(""); setSelectedMilestone(null); }}><Icon>◫</Icon>管理概览</button>
                <button className={workspaceMode === "timeline" ? "active" : ""} onClick={() => setWorkspaceMode("timeline")}><Icon>▤</Icon>时间线</button>
                <button className={workspaceMode === "cea" ? "active" : ""} onClick={() => { setWorkspaceMode("cea"); setSelectedProjectId(""); setSelectedMilestone(null); }}><Icon>⊟</Icon>CEA 版本</button>
                <button className={workspaceMode === "feishu-table" ? "active" : ""} onClick={() => { setWorkspaceMode("feishu-table"); setSelectedProjectId(""); setSelectedMilestone(null); }}><Icon>⌁</Icon>飞书表格</button>
              </div>
              {workspaceMode === "timeline" && <>
                <button className="button button-outline" onClick={addProjectRow}><Icon>＋</Icon>新增行</button>
                <button className="button button-outline" onClick={beginAddMilestone}><Icon>＋</Icon>新增里程碑</button>
              </>}
            </div>
          </div>

          {workspaceMode === "overview" ? (
            <ManagementDashboard view={activeView} onLocate={locateFromDashboard} />
          ) : workspaceMode === "cea" ? (
            <CeaVersionView
              view={activeView}
              projects={visibleProjects}
              onMilestoneClick={(projectId, milestoneId) => { setSelectedProjectId(""); setSelectedMilestone({ projectId, milestoneId }); }}
            />
          ) : workspaceMode === "feishu-table" ? (
            <FeishuTableView token={process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || ""} />
          ) : <>
          <div className="toolbar">
            <div className="search-field"><Icon>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、里程碑或备注…" /><kbd>⌘ K</kbd></div>
            <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option>全部标签</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}><option value="manual">默认排序</option><option value="date">按首个里程碑</option><option value="name">按项目名称</option></select>
            <div className="toolbar-spacer" />
            <div className="column-width-control"><button onClick={() => updateColumnWidth(-1)}>−</button><input type="number" min="6" max="300" value={activeView.columnWidth || 20} onChange={(event) => { const v = Number(event.target.value); if (!isNaN(v)) updateColumnWidth(v - (activeView.columnWidth || 20)); }} /><span>px / 周</span><button onClick={() => updateColumnWidth(1)}>＋</button></div>
            <button className="button button-quiet" onClick={() => window.print()}><Icon>⇩</Icon>导出 PDF</button>
          </div>

          <div className="filter-summary"><span>显示 {visibleProjects.length} / {activeView.projects.length} 行</span>{(query || tagFilter !== "全部标签") && <button onClick={() => { setQuery(""); setTagFilter("全部标签"); }}>清除筛选 ×</button>}<div className="date-controls"><label>开始 <input type="date" value={activeView.startDate} onChange={(event) => updateViewDate("startDate", event.target.value)} /></label><label>结束 <input type="date" value={activeView.endDate} onChange={(event) => updateViewDate("endDate", event.target.value)} /></label></div></div>

          {(
            <>
              <div className="plan-canvas-toolbar">
                <span>布局工具</span>
                <button className="button button-primary" onClick={() => addPlanItem("frame")}>＋ 新建虚线框</button>
                <button className="button button-outline" onClick={() => addPlanItem("text")}>T 新建文本</button>
                <button className={`button ${arrowMode ? "button-primary" : "button-outline"}`} onClick={toggleArrowMode}>↗ {arrowMode ? "取消添加箭头" : "添加箭头"}</button>
                {arrowMode && <>
                  <label className="plan-style-control">线型
                    <button className={`button ${arrowDashed ? "button-outline" : "button-primary"}`} onClick={() => setArrowDashed(false)} style={{ padding: "4px 10px", fontSize: 10 }}>实线</button>
                    <button className={`button ${arrowDashed ? "button-primary" : "button-outline"}`} onClick={() => setArrowDashed(true)} style={{ padding: "4px 10px", fontSize: 10 }}>虚线</button>
                  </label>
                  <label className="plan-style-control">颜色 <input type="color" value={arrowColor} onChange={(event) => setArrowColor(event.target.value)} /></label>
                  <small className="arrow-help">{arrowStart ? "请选择终点里程碑" : "请选择起点里程碑"}</small>
                </>}
                {selectedPlanItem && selectedPlanItem.kind === "frame" && <FrameWeekEditor item={selectedPlanItem} projects={visibleProjects} boundTextCount={(activeView.planItems || []).filter((item) => item.parentFrameId === selectedPlanItem.id).length} onUpdate={updatePlanItem} onDelete={deleteSelectedPlanItem} />}
              {selectedPlanItem && selectedPlanItem.kind === "text" && <>
                <label className="plan-style-control">颜色 <input type="color" value={selectedPlanItem.color} onChange={(event) => updatePlanItem(selectedPlanItem.id, { color: event.target.value })} /></label>
                <label className="plan-style-control">字号 <input type="number" min="10" max="28" value={selectedPlanItem.fontSize || 13} onChange={(event) => updatePlanItem(selectedPlanItem.id, { fontSize: Math.max(10, Math.min(28, Number(event.target.value) || 13)) })} /></label>
                <label className="plan-style-control">所属虚线框
                  <select value={selectedPlanItem.parentFrameId || ""} onChange={(event) => updatePlanItem(selectedPlanItem.id, { parentFrameId: event.target.value || undefined, bindingDisabled: !event.target.value })}>
                    <option value="">未绑定</option>
                    {(activeView.planItems || []).filter((item) => item.kind === "frame").map((frame, index) => <option key={frame.id} value={frame.id}>虚线框 {index + 1}</option>)}
                  </select>
                </label>
                {selectedPlanItem.parentFrameId && <span className="week-bound-hint">已绑定，移动虚线框时文本会同步移动</span>}
                <button className="button button-quiet" onClick={deleteSelectedPlanItem}>删除选中元素</button>
              </>}
                {selectedConnection && <><label className="plan-style-control">箭头线型
                  <button className={`button ${selectedConnection.lineType.includes("dash") ? "button-outline" : "button-primary"}`} onClick={() => updateConnection(selectedConnection.id, { lineType: "thin-solid" })} style={{ padding: "4px 10px", fontSize: 10 }}>实线</button>
                  <button className={`button ${selectedConnection.lineType.includes("dash") ? "button-primary" : "button-outline"}`} onClick={() => updateConnection(selectedConnection.id, { lineType: "thin-dashed" })} style={{ padding: "4px 10px", fontSize: 10 }}>虚线</button>
                </label><label className="plan-style-control">箭头颜色 <input type="color" value={selectedConnection.color} onChange={(event) => updateConnection(selectedConnection.id, { color: event.target.value })} /></label><button className="button button-quiet" onClick={deleteSelectedConnection}>删除箭头</button></>}
              </div>
              <ProjectPlanCanvas
                view={activeView}
                projects={visibleProjects}
                onProjectClick={(projectId) => { setSelectedProjectId(projectId); setSelectedMilestone(null); }}
                onMilestoneClick={(projectId, milestoneId) => { setSelectedProjectId(""); setSelectedMilestone({ projectId, milestoneId }); }}
                arrowMode={arrowMode}
                arrowStart={arrowStart}
                onArrowMilestone={connectMilestones}
                onUpdateProject={saveProject}
                onUpdateItem={updatePlanItem}
                onSelectItem={setSelectedPlanItemId}
                selectedItemId={selectedPlanItemId}
                onConnectionClick={setSelectedConnectionId}
                selectedConnectionId={selectedConnectionId}
                onColumnWidthChange={(delta) => updateColumnWidth(delta)}
                highlightedProjectNames={changeHighlights.projects}
                highlightedMilestoneKeys={changeHighlights.milestones}
              />
            </>
          )}
          </>}
        </section>

        {activeProject && (
          <ProjectMilestoneDrawer
            project={activeProject}
            onClose={() => setSelectedProjectId("")}
            onSaveProject={(patch) => saveProject(activeProject.uuid, patch)}
            onDeleteProject={() => deleteProject(activeProject.uuid)}
            onSelect={(milestoneId) => {
              setSelectedProjectId("");
              setSelectedMilestone({ projectId: activeProject.uuid, milestoneId });
            }}
            onAdd={() => addMilestoneToProject(activeProject.uuid)}
          />
        )}
      </section>

      {activeMilestone && activeMilestoneProject && (
        <MilestoneDrawer
          project={activeMilestoneProject}
          milestone={activeMilestone}
          onClose={() => setSelectedMilestone(null)}
          onSave={saveMilestone}
          onDelete={deleteMilestone}
        />
      )}

      {showAddMilestonePicker && (
        <div className="modal-backdrop add-milestone-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowAddMilestonePicker(false)}>
          <div className="dialog add-milestone-dialog" role="dialog" aria-modal="true" aria-labelledby="add-milestone-title">
            <div className="dialog-head">
              <div><span className="eyebrow">NEW MILESTONE</span><h2 id="add-milestone-title">添加里程碑</h2></div>
              <button onClick={() => setShowAddMilestonePicker(false)} aria-label="关闭项目选择">×</button>
            </div>
            <p className="project-picker-help">请选择里程碑所属的项目。</p>
            <div className="project-picker-list">
              {activeView.projects.map((project) => (
                <button key={project.uuid} onClick={() => { setShowAddMilestonePicker(false); addMilestoneToProject(project.uuid); }}>
                  <span className="project-picker-swatch" style={{ background: project.bgColor || "#ecf0f1" }} />
                  <span><strong>{project.name}</strong>{project.tag && <small>{project.tag}</small>}</span>
                  <em>选择</em>
                </button>
              ))}
            </div>
            <div className="dialog-actions"><button className="button button-quiet" onClick={() => setShowAddMilestonePicker(false)}>取消</button></div>
          </div>
        </div>
      )}

      {showViewDialog && <div className="modal-backdrop" onMouseDown={() => setShowViewDialog(false)}><div className="dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-head"><div><span className="eyebrow">NEW VIEW</span><h2>新建计划视图</h2></div><button onClick={() => setShowViewDialog(false)}>×</button></div><label className="form-field"><span>视图名称</span><input autoFocus value={newViewName} onChange={(event) => setNewViewName(event.target.value)} placeholder="例如：项目主计划" onKeyDown={(event) => event.key === "Enter" && createView()} /></label><label className="form-field"><span>视图类型</span><select value="plan" disabled><option value="plan">项目计划画板</option></select><small className="form-hint">所有视图统一使用计划画板，支持虚线框、自由文本、拖拽、行高和箭头编辑。</small></label><div className="dialog-actions"><button className="button button-quiet" onClick={() => setShowViewDialog(false)}>取消</button><button className="button button-primary" onClick={createView}>创建视图</button></div></div></div>}

      {showFeishuImport && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowFeishuImport(false)}>
          <div className="dialog feishu-import-dialog" role="dialog" aria-modal="true" aria-labelledby="feishu-sync-title">
            <div className="dialog-head">
              <div><span className="eyebrow">FEISHU WEBHOOK</span><h2 id="feishu-sync-title">获取多维表格数据</h2></div>
              <button onClick={() => setShowFeishuImport(false)} aria-label="关闭">×</button>
            </div>
            <div className="feishu-sync-body">
              <p className="feishu-sync-intro">飞书多维表格通过自动化流程将记录推送到本系统，无需应用权限审批。配置完成后，数据变更会准实时同步。</p>

              <div className="feishu-sync-step">
                <strong>1. Webhook 接收地址</strong>
                <div className="feishu-sync-url-wrap">
                  <code className="feishu-sync-url">{typeof window !== "undefined" ? `${window.location.origin}/api/feishu/sync` : "/api/feishu/sync"}</code>
                  <button className="button button-outline feishu-copy-btn" onClick={() => { const url = `${window.location.origin}/api/feishu/sync`; navigator.clipboard?.writeText(url); setFeishuStatus("已复制到剪贴板"); setFeishuStatusTone("success"); }}>复制</button>
                </div>
              </div>

              <div className="feishu-sync-step">
                <strong>2. 鉴权令牌（请求头 X-Webhook-Token）</strong>
                <div className="feishu-sync-url-wrap">
                  <code className="feishu-sync-url feishu-sync-token">{process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || "部署后在环境变量中查看"}</code>
                  <button className="button button-outline feishu-copy-btn" onClick={() => { const t = process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || ""; if (t) { navigator.clipboard?.writeText(t); setFeishuStatus("已复制到剪贴板"); setFeishuStatusTone("success"); } }}>复制</button>
                </div>
              </div>

              <div className="feishu-sync-step">
                <strong>3. 同步状态</strong>
                <div className="feishu-sync-status-grid">
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.projects ?? "—"}</span><span className="feishu-sync-stat-label">数据库项目</span></div>
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.syncedProjects ?? "—"}</span><span className="feishu-sync-stat-label">飞书同步</span></div>
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.milestones ?? "—"}</span><span className="feishu-sync-stat-label">里程碑</span></div>
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.recentSyncs?.length ?? 0}</span><span className="feishu-sync-stat-label">最近推送</span></div>
                </div>
                <button className="button button-outline" disabled={feishuStatusLoading} onClick={() => void loadFeishuSyncStatus()} style={{ marginTop: 8 }}>{feishuStatusLoading ? "查询中…" : "刷新状态"}</button>
              </div>

              {feishuSyncStatus?.recentSyncs && feishuSyncStatus.recentSyncs.length > 0 && (
                <div className="feishu-sync-step">
                  <strong>最近推送记录</strong>
                  <div className="feishu-sync-log">
                    {feishuSyncStatus.recentSyncs.map((r, i) => (
                      <div key={i} className={`feishu-sync-log-item ${r.processed ? "ok" : "fail"}`}>
                        <span className="feishu-sync-log-time">{new Date(r.receivedAt).toLocaleString("zh-CN")}</span>
                        <span className="feishu-sync-log-id">{r.recordId}</span>
                        <span className="feishu-sync-log-action">{r.action}</span>
                        <span className="feishu-sync-log-status">{r.processed ? "✓" : r.error ? "✗" : "…"}</span>
                        {r.error && <span className="feishu-sync-log-error" title={r.error}>{r.error.slice(0, 40)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="feishu-sync-step">
                <strong>4. 飞书多维表格配置方法</strong>
                <ol className="feishu-sync-guide">
                  <li>打开飞书多维表格 → 点击顶部「自动化」标签</li>
                  <li>新建流程：触发条件选「记录新增」或「记录修改」</li>
                  <li>执行动作选「发送 HTTP 请求」</li>
                  <li>请求方法 <code>POST</code>，URL 填上方 Webhook 地址</li>
                  <li>请求头添加 <code>X-Webhook-Token</code>，值填上方令牌</li>
                  <li>请求体选 JSON 格式，字段名见下方说明</li>
                </ol>
                <div className="feishu-sync-fields">
                  <strong>支持的字段</strong>
                  <div className="feishu-sync-field-list">
                    <span><code>record_id</code> 必填</span>
                    <span><code>type</code> project / milestone</span>
                    <span><code>project_name</code> / <code>项目名称</code></span>
                    <span><code>tag</code> / <code>标签</code></span>
                    <span><code>milestone_name</code> / <code>里程碑名称</code></span>
                    <span><code>release_date</code> / <code>发布日期</code></span>
                    <span><code>project_id</code> / <code>所属项目</code></span>
                  </div>
                </div>
              </div>
            </div>

            {feishuStatus && <p className={`feishu-import-status ${feishuStatusTone}`}>{feishuStatus}</p>}
            <div className="dialog-actions">
              <button className="button button-quiet" onClick={() => setShowFeishuImport(false)}>关闭</button>
              <button className="button button-primary" disabled={feishuSyncLoading} onClick={() => { setShowFeishuImport(false); setWorkspaceMode("feishu-table"); }}>
                查看飞书表格
              </button>
            </div>
          </div>
        </div>
      )}

      {rawFeishuSheets && (
        <div className="raw-table-overlay" role="dialog" aria-modal="true">
          <div className="raw-table-dialog">
            <div className="raw-table-header">
              <div className="raw-table-title-row">
                <div><span className="eyebrow">FEISHU DATA</span><h2>飞书表格数据</h2></div>
                <div className="raw-table-header-actions">
                  <input className="raw-table-search" type="text" placeholder="搜索…" value={rawSearch} onChange={(e) => setRawSearch(e.target.value)} />
                  <button className="raw-table-close" onClick={() => { setRawFeishuSheets(null); setRawSearch(""); }} aria-label="关闭">×</button>
                </div>
              </div>
              {rawFeishuSheets.length > 1 && (
                <div className="raw-table-tabs">
                  {rawFeishuSheets.map((sheet, idx) => (
                    <button key={sheet.title} className={`raw-table-tab ${idx === rawSheetIndex ? "active" : ""}`} onClick={() => { setRawSheetIndex(idx); setRawSearch(""); }}>
                      {sheet.title} <span className="raw-table-tab-count">{sheet.values.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(() => {
              const sheet = rawFeishuSheets[rawSheetIndex] || rawFeishuSheets[0];
              if (!sheet) return null;
              const allRows = sheet.values;
              const filteredRows = rawSearch
                ? allRows.filter((row, ri) => ri === 0 || (Array.isArray(row) && row.some((c) => c != null && String(c).toLowerCase().includes(rawSearch.toLowerCase()))))
                : allRows;
              const header = filteredRows[0] || [];
              const bodyRows = filteredRows.slice(1);
              return (
                <div className="raw-table-body">
                  <div className="raw-table-info-bar">
                    <span>{bodyRows.length} 行 × {Array.isArray(header) ? header.length : 0} 列{rawSearch && ` （筛选自 ${allRows.length - 1} 行）`}</span>
                  </div>
                  <div className="raw-table-scroll">
                    <table className="raw-table">
                      <thead>
                        <tr>
                          {(Array.isArray(header) ? header : []).map((cell, ci) => (
                            <th key={ci}>{cell === null || cell === undefined ? "" : String(cell)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bodyRows.slice(0, 500).map((row, ri) => (
                          <tr key={ri}>
                            {(Array.isArray(row) ? row : []).map((cell, ci) => (
                              <td key={ci}>{cell === null || cell === undefined ? "" : String(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bodyRows.length > 500 && <p className="raw-table-truncated">仅显示前 500 行，共 {bodyRows.length} 行</p>}
                </div>
              );
            })()}
            <div className="raw-table-footer">
              <span className="raw-table-source">数据来源：飞书</span>
              <button className="button button-quiet" onClick={() => { setRawFeishuSheets(null); setRawSearch(""); }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showExcelAnalysis && (
        <div className="excel-analysis-overlay" role="dialog" aria-modal="true" aria-label="Excel 变更分析">
          <div className="excel-analysis-dialog">
            <ExcelAnalysisEmbedded
              baselineData={data}
              onClose={() => setShowExcelAnalysis(false)}
              onApplyChanges={(nextData, changes, sourceFile) => {
                changePreviewRef.current = true;
                setChangePreview({ data: nextData, changes, sourceFile, createdAt: Date.now() });
                setData(nextData);
                setWorkspaceMode("timeline");
                setSelectedProjectId("");
                setSelectedMilestone(null);
                setShowExcelAnalysis(false);
              }}
            />
          </div>
        </div>
      )}

      <AiChatPanel
        view={activeView}
        onApplyView={(nextView) => setData({
          ...data,
          views: data.views.map((view) => view.id === nextView.id ? nextView : view),
        })}
      />

      <footer className="statusbar"><span><i className="online-dot" />{changePreview ? "Excel 变更预览模式" : "本地运行模式"}</span><span>兼容 V3.40 Excel 数据格式</span><span className="status-spacer" /><button onClick={removeView}>删除当前视图</button></footer>
    </main>
  );
}

function ProjectMilestoneDrawer({
  project,
  onClose,
  onSaveProject,
  onDeleteProject,
  onSelect,
  onAdd,
}: {
  project: Project;
  onClose: () => void;
  onSaveProject: (patch: Partial<Project>) => void;
  onDeleteProject: () => void;
  onSelect: (milestoneId: string) => void;
  onAdd: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [tag, setTag] = useState(project.tag);
  const [detailRemark, setDetailRemark] = useState(project.detailRemark);
  const [bgColor, setBgColor] = useState(project.bgColor === "transparent" ? "#ffffff" : project.bgColor);
  const [showSeparatorAbove, setShowSeparatorAbove] = useState(project.showSeparatorAbove || false);

  useEffect(() => {
    setName(project.name);
    setTag(project.tag);
    setDetailRemark(project.detailRemark);
    setBgColor(project.bgColor === "transparent" ? "#ffffff" : project.bgColor);
    setShowSeparatorAbove(project.showSeparatorAbove || false);
  }, [project]);

  return (
    <aside className="drawer milestone-picker">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">MILESTONES</span>
          <h2>修改里程碑</h2>
          <p className="drawer-context">{project.name}</p>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="关闭里程碑列表">×</button>
      </div>
      <div className="drawer-scroll">
        <div className="drawer-section project-editor">
          <div className="section-title"><span>行信息</span><button onClick={() => onSaveProject({ name: name.trim() || "未命名行", tag: tag.trim(), detailRemark, bgColor, showSeparatorAbove })}>保存行设置</button></div>
          <label className="form-field"><span>行名称</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div className="drawer-row"><label className="form-field"><span>标签</span><input value={tag} onChange={(event) => setTag(event.target.value)} /></label><label className="form-field"><span>行底色</span><input type="color" value={bgColor} onChange={(event) => setBgColor(event.target.value)} /></label></div>
          <label className="form-field"><span>说明</span><textarea rows={2} value={detailRemark} onChange={(event) => setDetailRemark(event.target.value)} /></label>
          <label className="form-field separator-toggle"><input type="checkbox" checked={showSeparatorAbove} onChange={(event) => setShowSeparatorAbove(event.target.checked)} /><span>在此行上方显示分割虚线</span></label>
        </div>
        <p className="picker-help">请选择需要修改的里程碑，编辑界面会立即显示。</p>
        <div className="milestone-picker-list">
          {project.milestones.map((milestone) => (
            <button className="milestone-picker-item" key={milestone.id} onClick={() => onSelect(milestone.id)}>
              <span className="milestone-bullet" style={{ background: milestone.color }} />
              <span>
                <strong>{milestone.iteration}</strong>
                <small>{formatDate(milestone.releaseDate)}{milestone.remark ? ` · ${milestone.remark}` : ""}</small>
              </span>
              <em>修改</em>
            </button>
          ))}
          {!project.milestones.length && <div className="picker-empty">该项目暂无里程碑</div>}
        </div>
        <button className="button button-outline full-width" onClick={onAdd}>＋ 添加并修改里程碑</button>
        <button className="danger-button project-delete" onClick={onDeleteProject}>删除此行</button>
      </div>
    </aside>
  );
}

function FrameWeekEditor({
  item,
  projects,
  boundTextCount,
  onUpdate,
  onDelete,
}: {
  item: PlanItem;
  projects: Project[];
  boundTextCount: number;
  onUpdate: (id: string, patch: Partial<PlanItem>) => void;
  onDelete: () => void;
}) {
  const isBound = !!(item.startWeek && item.startYear && item.endWeek && item.endYear);
  const startYear = item.startYear && item.startYear < 100 ? 2000 + item.startYear : item.startYear;
  const endYear = item.endYear && item.endYear < 100 ? 2000 + item.endYear : item.endYear;

  return (
    <>
      <label className="plan-style-control">颜色 <input type="color" value={item.color} onChange={(event) => onUpdate(item.id, { color: event.target.value })} /></label>
      <label className="plan-style-control">字号 <input type="number" min="10" max="28" value={item.fontSize || 13} onChange={(event) => onUpdate(item.id, { fontSize: Math.max(10, Math.min(28, Number(event.target.value) || 13)) })} /></label>
      <div className="frame-week-editor">
        <div className="frame-week-row">
          <span className="frame-week-label">范围</span>
          <span className="week-bound-hint">{isBound ? `W${item.startWeek}/${startYear} → W${item.endWeek}/${endYear}` : "自动识别中"}</span>
        </div>
        <div className="frame-week-row">
          <span className="frame-week-label">位置</span>
          <label className="frame-week-field frame-week-project">
            <select value={item.projectId || ""} onChange={(event) => onUpdate(item.id, { projectId: event.target.value || undefined })}>
              <option value="">全部行</option>
              {projects.map((p) => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="frame-week-actions">
          <span className="week-bound-hint">按周列吸附：拖动虚线框移动，拖动右下角缩放</span>
          <span className="week-bound-hint">已绑定 {boundTextCount} 个文本框</span>
        </div>
      </div>
      <button className="button button-quiet" onClick={onDelete}>删除选中元素</button>
    </>
  );
}
