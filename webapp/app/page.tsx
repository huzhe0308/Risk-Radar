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
  if (!value) return "æœªè®¾ç½®";
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
  const [tagFilter, setTagFilter] = useState("å…¨éƒ¨æ ‡ç­¾");
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
        window.alert("Excel å¼•æ“ŽæœªåŠ è½½ï¼Œè¯·åˆ·æ–°é¡µé¢é‡è¯•ã€‚");
        return;
      }
      try {
        const response = await fetch("http://127.0.0.1:3999/import-raw");
        if (!response.ok) throw new Error("æœªæ‰¾åˆ°å¾…å¯¼å…¥çš„æ•°æ®ï¼Œè¯·é‡æ–°ä»Žé£žä¹¦å‘é€ã€‚");
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
        window.alert("å·²ä»Žé£žä¹¦å¯¼å…¥è¡¨æ ¼æ•°æ®ã€‚");
      } catch (err) {
        if (!alive) return;
        window.alert(`å¯¼å…¥å¤±è´¥ï¼š${err instanceof Error ? err.message : "æœªçŸ¥é”™è¯¯"}`);
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
      return matchesQuery && (tagFilter === "å…¨éƒ¨æ ‡ç­¾" || project.tag === tagFilter);
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
    return <main className="loading-screen"><div className="loading-mark"><span className="radar-dot" /><span className="radar-ring ring-outer" /><span className="radar-ring ring-inner" /><span className="radar-sweep" /></div><p>æ­£åœ¨è½½å…¥æ—¶é—´è®¡åˆ’â€¦</p></main>;
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
      window.alert(`å¯¼å…¥å¤±è´¥ï¼š${error instanceof Error ? error.message : "æ–‡ä»¶æ ¼å¼æ— æ³•è¯†åˆ«"}`);
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
    if (data.views.length === 1) return window.alert("è‡³å°‘ä¿ç•™ä¸€ä¸ªè§†å›¾ã€‚");
    if (!window.confirm(`ç¡®è®¤åˆ é™¤è§†å›¾â€œ${activeView.name}â€ï¼Ÿ`)) return;
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
      iteration: "æ–°é‡Œç¨‹ç¢‘",
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
    if (!window.confirm(`ç¡®è®¤åˆ é™¤é‡Œç¨‹ç¢‘â€œ${activeMilestone.iteration}â€ï¼Ÿ`)) return;
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
      window.alert("å½“å‰è§†å›¾æ²¡æœ‰å¯æ·»åŠ é‡Œç¨‹ç¢‘çš„é¡¹ç›®ï¼Œè¯·å…ˆå¯¼å…¥åŒ…å«é¡¹ç›®çš„æ•°æ®ã€‚");
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
    if (!target || !window.confirm(`ç¡®å®šåˆ é™¤è¡Œâ€œ${target.name}â€åŠå…¶å…¨éƒ¨é‡Œç¨‹ç¢‘å—ï¼Ÿ`)) return;
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
      if (!response.ok) throw new Error(payload.error || "æŸ¥è¯¢åŒæ­¥çŠ¶æ€å¤±è´¥ã€‚");
      setFeishuSyncStatus({
        projects: payload.projects ?? 0,
        milestones: payload.milestones ?? 0,
        syncedProjects: payload.syncedProjects ?? 0,
        recentSyncs: payload.recentSyncs ?? [],
      });
      setFeishuStatus("åŒæ­¥çŠ¶æ€å·²åˆ·æ–°ã€‚");
      setFeishuStatusTone("success");
    } catch (error) {
      setFeishuStatus(error instanceof Error ? error.message : "æŸ¥è¯¢åŒæ­¥çŠ¶æ€å¤±è´¥ã€‚");
      setFeishuStatusTone("error");
    } finally {
      setFeishuStatusLoading(false);
    }
  };

  const loadFeishuSyncData = async () => {
    setFeishuSyncLoading(true);
    setFeishuStatus("æ­£åœ¨ä»Žæ•°æ®åº“åŠ è½½é£žä¹¦åŒæ­¥æ•°æ®â€¦");
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
      if (!response.ok) throw new Error(payload.error || "åŠ è½½åŒæ­¥æ•°æ®å¤±è´¥ã€‚");
      const syncedProjects = payload.projects || [];
      if (!syncedProjects.length) {
        setFeishuStatus("æ•°æ®åº“ä¸­æš‚æ— åŒæ­¥æ•°æ®ã€‚è¯·å…ˆåœ¨é£žä¹¦å¤šç»´è¡¨æ ¼ä¸­é…ç½®è‡ªåŠ¨åŒ–æŽ¨é€ã€‚");
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
      window.alert(`å·²åŠ è½½ ${syncedProjects.length} ä¸ªé¡¹ç›®ï¼ˆ${payload.milestoneCount || 0} æ¡é‡Œç¨‹ç¢‘ï¼‰åˆ°æ—¶é—´çº¿ã€‚æ–°å¢ž ${newProjects.length} ä¸ªï¼Œæ›´æ–° ${updatedProjects.length} ä¸ªã€‚`);
    } catch (error) {
      setFeishuStatus(error instanceof Error ? error.message : "åŠ è½½åŒæ­¥æ•°æ®å¤±è´¥ã€‚");
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
    if (boundCount && !window.confirm(`è¯¥è™šçº¿æ¡†ç»‘å®šäº† ${boundCount} ä¸ªæ–‡æœ¬æ¡†ï¼Œåˆ é™¤åŽè¿™äº›æ–‡æœ¬æ¡†ä¹Ÿä¼šä¸€èµ·åˆ é™¤ã€‚æ˜¯å¦ç»§ç»­ï¼Ÿ`)) return;
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
    ctx.fillText(`${activeView.name}  Â·  ${formatDate(activeView.startDate)} â€” ${formatDate(activeView.endDate)}`, 40, 86);
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
    const html = `<!doctype html><meta charset="utf-8"><title>${data.title}</title><body style="font:14px Arial;padding:32px"><h1>${data.title}</h1><h2>${activeView.name}</h2>${visibleProjects.map((project) => `<section><h3>${project.name}</h3><p>${project.milestones.map((milestone) => `${milestone.iteration}: ${milestone.releaseDate}`).join(" Â· ")}</p></section>`).join("")}</body>`;
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
    setTagFilter("å…¨éƒ¨æ ‡ç­¾");
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
            <Icon>â†¥</Icon>{importing ? "å¯¼å…¥ä¸­â€¦" : "å¯¼å…¥ Excel"}
            <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => event.target.files?.[0] && void handleImport(event.target.files[0])} />
          </label>
          <button className="button" onClick={() => { setFeishuStatus(""); setShowFeishuImport(true); }}><Icon>âŒ</Icon>èŽ·å–å¤šç»´è¡¨æ ¼</button>
          <button className="button" onClick={() => exportWorkbook(data)}><Icon>â†§</Icon>å¯¼å‡º Excel</button>
          <button className="button button-quiet" onClick={() => window.print()}><Icon>â–£</Icon>æ‰“å° / PDF</button>
          <button className="icon-button" title="å¯¼å‡º PNG" onClick={exportPng}>â–§</button>
          <button className="icon-button" title="å¯¼å‡º HTML" onClick={exportHtml}>â¤´</button>
          <button className="button button-outline" onClick={() => setShowExcelAnalysis(true)}><Icon>â–¥</Icon>Excel åˆ†æž</button>
          <div className="avatar">U</div>
        </div>
      </header>

      {changePreview && (
        <section className="plan-change-preview-banner">
          <div><strong>Excel å˜æ›´é¢„è§ˆ</strong><span>ä»¥å½“å‰æ—¶é—´è®¡åˆ’è§†å›¾ä¸ºæ˜¾ç¤ºåŸºçº¿ï¼Œå¯¹æ¯” {changePreview.sourceFile} Â· {changePreview.changes.length} é¡¹å˜æ›´å·²ç”¨æ©™è‰²æ ‡è®°</span></div>
          <button className="button button-outline" onClick={() => { window.sessionStorage.removeItem(CHANGE_PREVIEW_KEY); window.location.assign("/"); }}>é€€å‡ºé¢„è§ˆï¼Œè¿”å›žå½“å‰è®¡åˆ’</button>
        </section>
      )}

      <section className={`workspace ${activeProject ? "has-drawer" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-head">
            <div>
              <span className="eyebrow">WORKSPACE</span>
              <h2>è®¡åˆ’è§†å›¾</h2>
            </div>
            <button className="round-button" title="æ·»åŠ è§†å›¾" onClick={() => setShowViewDialog(true)}>ï¼‹</button>
          </div>
          <div className="view-list">
            {data.views.map((view) => (
              <button key={view.id} className={`view-item ${view.id === activeView.id ? "active" : ""}`} onClick={() => { setData({ ...data, activeViewId: view.id }); setSelectedProjectId(""); setSelectedMilestone(null); setShowAddMilestonePicker(false); setSelectedPlanItemId(null); setArrowMode(false); setArrowStart(null); setSelectedConnectionId(null); }}>
                <span className="view-icon">{view.type === "whiteboard" ? "âŒ˜" : "â–¤"}</span>
                <span className="view-copy"><strong>{view.name}</strong>{changePreview && changedViewNames.has(view.name) && <small className="view-change-indicator">â— æœ‰å˜æ›´</small>}</span>
                {view.id === activeView.id && <span className="active-dot" />}
              </button>
            ))}
          </div>
          <div className="sidebar-foot">
            <p>{changePreview ? "å˜æ›´é¢„è§ˆä¸ä¼šè¦†ç›–å½“å‰è®¡åˆ’" : "æœ¬åœ°è‡ªåŠ¨ä¿å­˜å·²å¼€å¯"}</p>
          </div>
        </aside>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="breadcrumb">è®¡åˆ’è§†å›¾ <span>/</span> {activeView.name}</div>
              <h1>{data.title}</h1>
              <p>{workspaceMode === "overview" ? "ä»Žç®¡ç†è§†è§’æŽŒæ¡è®¡åˆ’å¥åº·åº¦ã€è¿‘æœŸèŠ‚ç‚¹ä¸Žå…³é”®é£Žé™©ã€‚" : workspaceMode === "cea" ? "æŒ‰ CEA è½¯ä»¶ç‰ˆæœ¬åˆ†ç»„æµè§ˆæ‰€æœ‰è½¦åž‹çš„é‡Œç¨‹ç¢‘èŠ‚ç‚¹ã€‚" : workspaceMode === "feishu-table" ? "æŸ¥çœ‹é£žä¹¦å¤šç»´è¡¨æ ¼ webhook æŽ¨é€çš„åŽŸå§‹è®°å½•æ•°æ®ã€‚" : "ç»Ÿä¸€ç®¡ç†äº§å“ã€è½¦åž‹å’Œç³»ç»Ÿé‡Œç¨‹ç¢‘ï¼Œæ”¯æŒ Excel å¾€è¿”ç¼–è¾‘ã€‚"}</p>
            </div>
            <div className="plan-heading-actions">
              <div className="workspace-mode-switch" aria-label="å·¥ä½œåŒºæ¨¡å¼">
                <button className={workspaceMode === "overview" ? "active" : ""} onClick={() => { setWorkspaceMode("overview"); setSelectedProjectId(""); setSelectedMilestone(null); }}><Icon>â—«</Icon>ç®¡ç†æ¦‚è§ˆ</button>
                <button className={workspaceMode === "timeline" ? "active" : ""} onClick={() => setWorkspaceMode("timeline")}><Icon>â–¤</Icon>æ—¶é—´çº¿</button>
                <button className={workspaceMode === "cea" ? "active" : ""} onClick={() => { setWorkspaceMode("cea"); setSelectedProjectId(""); setSelectedMilestone(null); }}><Icon>âŠŸ</Icon>CEA ç‰ˆæœ¬</button>
                <button className={workspaceMode === "feishu-table" ? "active" : ""} onClick={() => { setWorkspaceMode("feishu-table"); setSelectedProjectId(""); setSelectedMilestone(null); }}><Icon>âŒ</Icon>é£žä¹¦è¡¨æ ¼</button>
              </div>
              {workspaceMode === "timeline" && <>
                <button className="button button-outline" onClick={addProjectRow}><Icon>ï¼‹</Icon>æ–°å¢žè¡Œ</button>
                <button className="button button-outline" onClick={beginAddMilestone}><Icon>ï¼‹</Icon>æ–°å¢žé‡Œç¨‹ç¢‘</button>
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
            <div className="search-field"><Icon>âŒ•</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="æœç´¢é¡¹ç›®ã€é‡Œç¨‹ç¢‘æˆ–å¤‡æ³¨â€¦" /><kbd>âŒ˜ K</kbd></div>
            <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option>å…¨éƒ¨æ ‡ç­¾</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}><option value="manual">é»˜è®¤æŽ’åº</option><option value="date">æŒ‰é¦–ä¸ªé‡Œç¨‹ç¢‘</option><option value="name">æŒ‰é¡¹ç›®åç§°</option></select>
            <div className="toolbar-spacer" />
            <div className="column-width-control"><button onClick={() => updateColumnWidth(-1)}>âˆ’</button><input type="number" min="6" max="300" value={activeView.columnWidth || 20} onChange={(event) => { const v = Number(event.target.value); if (!isNaN(v)) updateColumnWidth(v - (activeView.columnWidth || 20)); }} /><span>px / å‘¨</span><button onClick={() => updateColumnWidth(1)}>ï¼‹</button></div>
            <button className="button button-quiet" onClick={() => window.print()}><Icon>â‡©</Icon>å¯¼å‡º PDF</button>
          </div>

          <div className="filter-summary"><span>æ˜¾ç¤º {visibleProjects.length} / {activeView.projects.length} è¡Œ</span>{(query || tagFilter !== "å…¨éƒ¨æ ‡ç­¾") && <button onClick={() => { setQuery(""); setTagFilter("å…¨éƒ¨æ ‡ç­¾"); }}>æ¸…é™¤ç­›é€‰ Ã—</button>}<div className="date-controls"><label>å¼€å§‹ <input type="date" value={activeView.startDate} onChange={(event) => updateViewDate("startDate", event.target.value)} /></label><label>ç»“æŸ <input type="date" value={activeView.endDate} onChange={(event) => updateViewDate("endDate", event.target.value)} /></label></div></div>

          {(
            <>
              <div className="plan-canvas-toolbar">
                <span>å¸ƒå±€å·¥å…·</span>
                <button className="button button-primary" onClick={() => addPlanItem("frame")}>ï¼‹ æ–°å»ºè™šçº¿æ¡†</button>
                <button className="button button-outline" onClick={() => addPlanItem("text")}>T æ–°å»ºæ–‡æœ¬</button>
                <button className={`button ${arrowMode ? "button-primary" : "button-outline"}`} onClick={toggleArrowMode}>â†— {arrowMode ? "å–æ¶ˆæ·»åŠ ç®­å¤´" : "æ·»åŠ ç®­å¤´"}</button>
                {arrowMode && <>
                  <label className="plan-style-control">çº¿åž‹
                    <button className={`button ${arrowDashed ? "button-outline" : "button-primary"}`} onClick={() => setArrowDashed(false)} style={{ padding: "4px 10px", fontSize: 10 }}>å®žçº¿</button>
                    <button className={`button ${arrowDashed ? "button-primary" : "button-outline"}`} onClick={() => setArrowDashed(true)} style={{ padding: "4px 10px", fontSize: 10 }}>è™šçº¿</button>
                  </label>
                  <label className="plan-style-control">é¢œè‰² <input type="color" value={arrowColor} onChange={(event) => setArrowColor(event.target.value)} /></label>
                  <small className="arrow-help">{arrowStart ? "è¯·é€‰æ‹©ç»ˆç‚¹é‡Œç¨‹ç¢‘" : "è¯·é€‰æ‹©èµ·ç‚¹é‡Œç¨‹ç¢‘"}</small>
                </>}
                {selectedPlanItem && selectedPlanItem.kind === "frame" && <FrameWeekEditor item={selectedPlanItem} projects={visibleProjects} boundTextCount={(activeView.planItems || []).filter((item) => item.parentFrameId === selectedPlanItem.id).length} onUpdate={updatePlanItem} onDelete={deleteSelectedPlanItem} />}
              {selectedPlanItem && selectedPlanItem.kind === "text" && <>
                <label className="plan-style-control">é¢œè‰² <input type="color" value={selectedPlanItem.color} onChange={(event) => updatePlanItem(selectedPlanItem.id, { color: event.target.value })} /></label>
                <label className="plan-style-control">å­—å· <input type="number" min="10" max="28" value={selectedPlanItem.fontSize || 13} onChange={(event) => updatePlanItem(selectedPlanItem.id, { fontSize: Math.max(10, Math.min(28, Number(event.target.value) || 13)) })} /></label>
                <label className="plan-style-control">æ‰€å±žè™šçº¿æ¡†
                  <select value={selectedPlanItem.parentFrameId || ""} onChange={(event) => updatePlanItem(selectedPlanItem.id, { parentFrameId: event.target.value || undefined, bindingDisabled: !event.target.value })}>
                    <option value="">æœªç»‘å®š</option>
                    {(activeView.planItems || []).filter((item) => item.kind === "frame").map((frame, index) => <option key={frame.id} value={frame.id}>è™šçº¿æ¡† {index + 1}</option>)}
                  </select>
                </label>
                {selectedPlanItem.parentFrameId && <span className="week-bound-hint">å·²ç»‘å®šï¼Œç§»åŠ¨è™šçº¿æ¡†æ—¶æ–‡æœ¬ä¼šåŒæ­¥ç§»åŠ¨</span>}
                <button className="button button-quiet" onClick={deleteSelectedPlanItem}>åˆ é™¤é€‰ä¸­å…ƒç´ </button>
              </>}
                {selectedConnection && <><label className="plan-style-control">ç®­å¤´çº¿åž‹
                  <button className={`button ${selectedConnection.lineType.includes("dash") ? "button-outline" : "button-primary"}`} onClick={() => updateConnection(selectedConnection.id, { lineType: "thin-solid" })} style={{ padding: "4px 10px", fontSize: 10 }}>å®žçº¿</button>
                  <button className={`button ${selectedConnection.lineType.includes("dash") ? "button-primary" : "button-outline"}`} onClick={() => updateConnection(selectedConnection.id, { lineType: "thin-dashed" })} style={{ padding: "4px 10px", fontSize: 10 }}>è™šçº¿</button>
                </label><label className="plan-style-control">ç®­å¤´é¢œè‰² <input type="color" value={selectedConnection.color} onChange={(event) => updateConnection(selectedConnection.id, { color: event.target.value })} /></label><button className="button button-quiet" onClick={deleteSelectedConnection}>åˆ é™¤ç®­å¤´</button></>}
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
              <div><span className="eyebrow">NEW MILESTONE</span><h2 id="add-milestone-title">æ·»åŠ é‡Œç¨‹ç¢‘</h2></div>
              <button onClick={() => setShowAddMilestonePicker(false)} aria-label="å…³é—­é¡¹ç›®é€‰æ‹©">Ã—</button>
            </div>
            <p className="project-picker-help">è¯·é€‰æ‹©é‡Œç¨‹ç¢‘æ‰€å±žçš„é¡¹ç›®ã€‚</p>
            <div className="project-picker-list">
              {activeView.projects.map((project) => (
                <button key={project.uuid} onClick={() => { setShowAddMilestonePicker(false); addMilestoneToProject(project.uuid); }}>
                  <span className="project-picker-swatch" style={{ background: project.bgColor || "#ecf0f1" }} />
                  <span><strong>{project.name}</strong>{project.tag && <small>{project.tag}</small>}</span>
                  <em>é€‰æ‹©</em>
                </button>
              ))}
            </div>
            <div className="dialog-actions"><button className="button button-quiet" onClick={() => setShowAddMilestonePicker(false)}>å–æ¶ˆ</button></div>
          </div>
        </div>
      )}

      {showViewDialog && <div className="modal-backdrop" onMouseDown={() => setShowViewDialog(false)}><div className="dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-head"><div><span className="eyebrow">NEW VIEW</span><h2>æ–°å»ºè®¡åˆ’è§†å›¾</h2></div><button onClick={() => setShowViewDialog(false)}>Ã—</button></div><label className="form-field"><span>è§†å›¾åç§°</span><input autoFocus value={newViewName} onChange={(event) => setNewViewName(event.target.value)} placeholder="ä¾‹å¦‚ï¼šé¡¹ç›®ä¸»è®¡åˆ’" onKeyDown={(event) => event.key === "Enter" && createView()} /></label><label className="form-field"><span>è§†å›¾ç±»åž‹</span><select value="plan" disabled><option value="plan">é¡¹ç›®è®¡åˆ’ç”»æ¿</option></select><small className="form-hint">æ‰€æœ‰è§†å›¾ç»Ÿä¸€ä½¿ç”¨è®¡åˆ’ç”»æ¿ï¼Œæ”¯æŒè™šçº¿æ¡†ã€è‡ªç”±æ–‡æœ¬ã€æ‹–æ‹½ã€è¡Œé«˜å’Œç®­å¤´ç¼–è¾‘ã€‚</small></label><div className="dialog-actions"><button className="button button-quiet" onClick={() => setShowViewDialog(false)}>å–æ¶ˆ</button><button className="button button-primary" onClick={createView}>åˆ›å»ºè§†å›¾</button></div></div></div>}

      {showFeishuImport && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowFeishuImport(false)}>
          <div className="dialog feishu-import-dialog" role="dialog" aria-modal="true" aria-labelledby="feishu-sync-title">
            <div className="dialog-head">
              <div><span className="eyebrow">FEISHU WEBHOOK</span><h2 id="feishu-sync-title">èŽ·å–å¤šç»´è¡¨æ ¼æ•°æ®</h2></div>
              <button onClick={() => setShowFeishuImport(false)} aria-label="å…³é—­">Ã—</button>
            </div>
            <div className="feishu-sync-body">
              <p className="feishu-sync-intro">é£žä¹¦å¤šç»´è¡¨æ ¼é€šè¿‡è‡ªåŠ¨åŒ–æµç¨‹å°†è®°å½•æŽ¨é€åˆ°æœ¬ç³»ç»Ÿï¼Œæ— éœ€åº”ç”¨æƒé™å®¡æ‰¹ã€‚é…ç½®å®ŒæˆåŽï¼Œæ•°æ®å˜æ›´ä¼šå‡†å®žæ—¶åŒæ­¥ã€‚</p>

              <div className="feishu-sync-step">
                <strong>1. Webhook æŽ¥æ”¶åœ°å€</strong>
                <div className="feishu-sync-url-wrap">
                  <code className="feishu-sync-url">{typeof window !== "undefined" ? `${window.location.origin}/api/feishu/sync` : "/api/feishu/sync"}</code>
                  <button className="button button-outline feishu-copy-btn" onClick={() => { const url = `${window.location.origin}/api/feishu/sync`; navigator.clipboard?.writeText(url); setFeishuStatus("å·²å¤åˆ¶åˆ°å‰ªè´´æ¿"); setFeishuStatusTone("success"); }}>å¤åˆ¶</button>
                </div>
              </div>

              <div className="feishu-sync-step">
                <strong>2. é‰´æƒä»¤ç‰Œï¼ˆè¯·æ±‚å¤´ X-Webhook-Tokenï¼‰</strong>
                <div className="feishu-sync-url-wrap">
                  <code className="feishu-sync-url feishu-sync-token">{process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || "éƒ¨ç½²åŽåœ¨çŽ¯å¢ƒå˜é‡ä¸­æŸ¥çœ‹"}</code>
                  <button className="button button-outline feishu-copy-btn" onClick={() => { const t = process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || ""; if (t) { navigator.clipboard?.writeText(t); setFeishuStatus("å·²å¤åˆ¶åˆ°å‰ªè´´æ¿"); setFeishuStatusTone("success"); } }}>å¤åˆ¶</button>
                </div>
              </div>

              <div className="feishu-sync-step">
                <strong>3. åŒæ­¥çŠ¶æ€</strong>
                <div className="feishu-sync-status-grid">
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.projects ?? "â€”"}</span><span className="feishu-sync-stat-label">æ•°æ®åº“é¡¹ç›®</span></div>
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.syncedProjects ?? "â€”"}</span><span className="feishu-sync-stat-label">é£žä¹¦åŒæ­¥</span></div>
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.milestones ?? "â€”"}</span><span className="feishu-sync-stat-label">é‡Œç¨‹ç¢‘</span></div>
                  <div className="feishu-sync-stat"><span className="feishu-sync-stat-num">{feishuSyncStatus?.recentSyncs?.length ?? 0}</span><span className="feishu-sync-stat-label">æœ€è¿‘æŽ¨é€</span></div>
                </div>
                <button className="button button-outline" disabled={feishuStatusLoading} onClick={() => void loadFeishuSyncStatus()} style={{ marginTop: 8 }}>{feishuStatusLoading ? "æŸ¥è¯¢ä¸­â€¦" : "åˆ·æ–°çŠ¶æ€"}</button>
              </div>

              {feishuSyncStatus?.recentSyncs && feishuSyncStatus.recentSyncs.length > 0 && (
                <div className="feishu-sync-step">
                  <strong>æœ€è¿‘æŽ¨é€è®°å½•</strong>
                  <div className="feishu-sync-log">
                    {feishuSyncStatus.recentSyncs.map((r, i) => (
                      <div key={i} className={`feishu-sync-log-item ${r.processed ? "ok" : "fail"}`}>
                        <span className="feishu-sync-log-time">{new Date(r.receivedAt).toLocaleString("zh-CN")}</span>
                        <span className="feishu-sync-log-id">{r.recordId}</span>
                        <span className="feishu-sync-log-action">{r.action}</span>
                        <span className="feishu-sync-log-status">{r.processed ? "âœ“" : r.error ? "âœ—" : "â€¦"}</span>
                        {r.error && <span className="feishu-sync-log-error" title={r.error}>{r.error.slice(0, 40)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="feishu-sync-step">
                <strong>4. é£žä¹¦å¤šç»´è¡¨æ ¼é…ç½®æ–¹æ³•</strong>
                <ol className="feishu-sync-guide">
                  <li>æ‰“å¼€é£žä¹¦å¤šç»´è¡¨æ ¼ â†’ ç‚¹å‡»é¡¶éƒ¨ã€Œè‡ªåŠ¨åŒ–ã€æ ‡ç­¾</li>
                  <li>æ–°å»ºæµç¨‹ï¼šè§¦å‘æ¡ä»¶é€‰ã€Œè®°å½•æ–°å¢žã€æˆ–ã€Œè®°å½•ä¿®æ”¹ã€</li>
                  <li>æ‰§è¡ŒåŠ¨ä½œé€‰ã€Œå‘é€ HTTP è¯·æ±‚ã€</li>
                  <li>è¯·æ±‚æ–¹æ³• <code>POST</code>ï¼ŒURL å¡«ä¸Šæ–¹ Webhook åœ°å€</li>
                  <li>è¯·æ±‚å¤´æ·»åŠ  <code>X-Webhook-Token</code>ï¼Œå€¼å¡«ä¸Šæ–¹ä»¤ç‰Œ</li>
                  <li>è¯·æ±‚ä½“é€‰ JSON æ ¼å¼ï¼Œå­—æ®µåè§ä¸‹æ–¹è¯´æ˜Ž</li>
                </ol>
                <div className="feishu-sync-fields">
                  <strong>æ”¯æŒçš„å­—æ®µ</strong>
                  <div className="feishu-sync-field-list">
                    <span><code>record_id</code> å¿…å¡«</span>
                    <span><code>type</code> project / milestone</span>
                    <span><code>project_name</code> / <code>é¡¹ç›®åç§°</code></span>
                    <span><code>tag</code> / <code>æ ‡ç­¾</code></span>
                    <span><code>milestone_name</code> / <code>é‡Œç¨‹ç¢‘åç§°</code></span>
                    <span><code>release_date</code> / <code>å‘å¸ƒæ—¥æœŸ</code></span>
                    <span><code>project_id</code> / <code>æ‰€å±žé¡¹ç›®</code></span>
                  </div>
                </div>
              </div>
            </div>

            {feishuStatus && <p className={`feishu-import-status ${feishuStatusTone}`}>{feishuStatus}</p>}
            <div className="dialog-actions">
              <button className="button button-quiet" onClick={() => setShowFeishuImport(false)}>å…³é—­</button>
              <button className="button button-primary" disabled={feishuSyncLoading} onClick={() => { setShowFeishuImport(false); setWorkspaceMode("feishu-table"); }}>
                æŸ¥çœ‹é£žä¹¦è¡¨æ ¼
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
                <div><span className="eyebrow">FEISHU DATA</span><h2>é£žä¹¦è¡¨æ ¼æ•°æ®</h2></div>
                <div className="raw-table-header-actions">
                  <input className="raw-table-search" type="text" placeholder="æœç´¢â€¦" value={rawSearch} onChange={(e) => setRawSearch(e.target.value)} />
                  <button className="raw-table-close" onClick={() => { setRawFeishuSheets(null); setRawSearch(""); }} aria-label="å…³é—­">Ã—</button>
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
                    <span>{bodyRows.length} è¡Œ Ã— {Array.isArray(header) ? header.length : 0} åˆ—{rawSearch && ` ï¼ˆç­›é€‰è‡ª ${allRows.length - 1} è¡Œï¼‰`}</span>
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
                  {bodyRows.length > 500 && <p className="raw-table-truncated">ä»…æ˜¾ç¤ºå‰ 500 è¡Œï¼Œå…± {bodyRows.length} è¡Œ</p>}
                </div>
              );
            })()}
            <div className="raw-table-footer">
              <span className="raw-table-source">æ•°æ®æ¥æºï¼šé£žä¹¦</span>
              <button className="button button-quiet" onClick={() => { setRawFeishuSheets(null); setRawSearch(""); }}>å…³é—­</button>
            </div>
          </div>
        </div>
      )}

      {showExcelAnalysis && (
        <div className="excel-analysis-overlay" role="dialog" aria-modal="true" aria-label="Excel å˜æ›´åˆ†æž">
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

      <footer className="statusbar"><span><i className="online-dot" />{changePreview ? "Excel å˜æ›´é¢„è§ˆæ¨¡å¼" : "æœ¬åœ°è¿è¡Œæ¨¡å¼"}</span><span>å…¼å®¹ V3.40 Excel æ•°æ®æ ¼å¼</span><span className="status-spacer" /><button onClick={removeView}>åˆ é™¤å½“å‰è§†å›¾</button></footer>
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
          <h2>ä¿®æ”¹é‡Œç¨‹ç¢‘</h2>
          <p className="drawer-context">{project.name}</p>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="å…³é—­é‡Œç¨‹ç¢‘åˆ—è¡¨">Ã—</button>
      </div>
      <div className="drawer-scroll">
        <div className="drawer-section project-editor">
          <div className="section-title"><span>è¡Œä¿¡æ¯</span><button onClick={() => onSaveProject({ name: name.trim() || "æœªå‘½åè¡Œ", tag: tag.trim(), detailRemark, bgColor, showSeparatorAbove })}>ä¿å­˜è¡Œè®¾ç½®</button></div>
          <label className="form-field"><span>è¡Œåç§°</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div className="drawer-row"><label className="form-field"><span>æ ‡ç­¾</span><input value={tag} onChange={(event) => setTag(event.target.value)} /></label><label className="form-field"><span>è¡Œåº•è‰²</span><input type="color" value={bgColor} onChange={(event) => setBgColor(event.target.value)} /></label></div>
          <label className="form-field"><span>è¯´æ˜Ž</span><textarea rows={2} value={detailRemark} onChange={(event) => setDetailRemark(event.target.value)} /></label>
          <label className="form-field separator-toggle"><input type="checkbox" checked={showSeparatorAbove} onChange={(event) => setShowSeparatorAbove(event.target.checked)} /><span>åœ¨æ­¤è¡Œä¸Šæ–¹æ˜¾ç¤ºåˆ†å‰²è™šçº¿</span></label>
        </div>
        <p className="picker-help">è¯·é€‰æ‹©éœ€è¦ä¿®æ”¹çš„é‡Œç¨‹ç¢‘ï¼Œç¼–è¾‘ç•Œé¢ä¼šç«‹å³æ˜¾ç¤ºã€‚</p>
        <div className="milestone-picker-list">
          {project.milestones.map((milestone) => (
            <button className="milestone-picker-item" key={milestone.id} onClick={() => onSelect(milestone.id)}>
              <span className="milestone-bullet" style={{ background: milestone.color }} />
              <span>
                <strong>{milestone.iteration}</strong>
                <small>{formatDate(milestone.releaseDate)}{milestone.remark ? ` Â· ${milestone.remark}` : ""}</small>
              </span>
              <em>ä¿®æ”¹</em>
            </button>
          ))}
          {!project.milestones.length && <div className="picker-empty">è¯¥é¡¹ç›®æš‚æ— é‡Œç¨‹ç¢‘</div>}
        </div>
        <button className="button button-outline full-width" onClick={onAdd}>ï¼‹ æ·»åŠ å¹¶ä¿®æ”¹é‡Œç¨‹ç¢‘</button>
        <button className="danger-button project-delete" onClick={onDeleteProject}>åˆ é™¤æ­¤è¡Œ</button>
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
      <label className="plan-style-control">é¢œè‰² <input type="color" value={item.color} onChange={(event) => onUpdate(item.id, { color: event.target.value })} /></label>
      <label className="plan-style-control">å­—å· <input type="number" min="10" max="28" value={item.fontSize || 13} onChange={(event) => onUpdate(item.id, { fontSize: Math.max(10, Math.min(28, Number(event.target.value) || 13)) })} /></label>
      <div className="frame-week-editor">
        <div className="frame-week-row">
          <span className="frame-week-label">èŒƒå›´</span>
          <span className="week-bound-hint">{isBound ? `W${item.startWeek}/${startYear} â†’ W${item.endWeek}/${endYear}` : "è‡ªåŠ¨è¯†åˆ«ä¸­"}</span>
        </div>
        <div className="frame-week-row">
          <span className="frame-week-label">ä½ç½®</span>
          <label className="frame-week-field frame-week-project">
            <select value={item.projectId || ""} onChange={(event) => onUpdate(item.id, { projectId: event.target.value || undefined })}>
              <option value="">å…¨éƒ¨è¡Œ</option>
              {projects.map((p) => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="frame-week-actions">
          <span className="week-bound-hint">æŒ‰å‘¨åˆ—å¸é™„ï¼šæ‹–åŠ¨è™šçº¿æ¡†ç§»åŠ¨ï¼Œæ‹–åŠ¨å³ä¸‹è§’ç¼©æ”¾</span>
          <span className="week-bound-hint">å·²ç»‘å®š {boundTextCount} ä¸ªæ–‡æœ¬æ¡†</span>
        </div>
      </div>
      <button className="button button-quiet" onClick={onDelete}>åˆ é™¤é€‰ä¸­å…ƒç´ </button>
    </>
  );
}
