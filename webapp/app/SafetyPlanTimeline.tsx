"use client";

import { useEffect, useMemo, useState } from "react";
import type { Milestone, Project, View } from "./types";
import { ProjectPlanCanvas } from "./ProjectPlanCanvas";

type MatrixVal = string | string[];

type UpstreamProject = {
  name: string;
  tags?: string;
  remark?: string;
  matrix: Record<string, MatrixVal>;
};

type UpstreamView = {
  source?: string;
  exportDate?: string;
  iterations: string[];
  milestoneTypes?: string[];
  projects: UpstreamProject[];
};

type SafetyPlanData = {
  upstreamPlan?: {
    source?: string;
    exportDate?: string;
    views: Record<string, UpstreamView>;
  };
};

const TOKEN = process.env.NEXT_PUBLIC_FEISHU_WEBHOOK_TOKEN_PREVIEW || "123456";

const ITERATION_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#0d4f4a", text: "#a7f3d0" },
  { bg: "#1a3a5c", text: "#93c5fd" },
  { bg: "#3c2a1a", text: "#fbbf24" },
  { bg: "#3a1a2c", text: "#f9a8d4" },
  { bg: "#1a2c3a", text: "#67e8f9" },
  { bg: "#2c1a3a", text: "#c4b5fd" },
  { bg: "#3a3a1a", text: "#fde047" },
  { bg: "#1a3a2c", text: "#6ee7b7" },
  { bg: "#2a2a2a", text: "#e2e8f0" },
];

const TYPE_COLORS = [
  "#d8ff3e",
  "#7dd3fc",
  "#f9a8d4",
  "#fbbf24",
  "#a7f3d0",
  "#c4b5fd",
  "#fda4af",
  "#93c5fd",
  "#fde047",
];

const GROUP_DEFS: Record<string, { label: string; icon: string }> = {
  ipd: { label: "IPD 迭代", icon: "◆" },
  cea: { label: "CEA 平台", icon: "★" },
};

function normGroup(key: string): string {
  return /^IPD/i.test(key) ? "ipd" : "cea";
}

function shortDate(value: string): string {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}

function earliest(matrix: Record<string, MatrixVal>): string {
  let earliest = "9999";
  for (const val of Object.values(matrix)) {
    const dates = Array.isArray(val) ? val : [val];
    for (const d of dates) {
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < earliest) earliest = d;
    }
  }
  return earliest === "9999" ? "" : earliest;
}

function viewRange(view: UpstreamView): { start: string; end: string } {
  let min = "9999";
  let max = "0000";
  for (const p of view.projects) {
    for (const val of Object.values(p.matrix)) {
      const dates = Array.isArray(val) ? val : [val];
      for (const d of dates) {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        if (d < min) min = d;
        if (d > max) max = d;
      }
    }
  }
  if (min === "9999") return { start: "2026-01-05", end: "2029-01-01" };
  const start = new Date(`${min}T00:00:00`);
  start.setDate(start.getDate() - 14);
  const end = new Date(`${max}T00:00:00`);
  end.setDate(end.getDate() + 21);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function buildPlatformRows(view: UpstreamView): { projects: Project[] } {
  const iterationDates = new Map<string, string>();
  for (const p of view.projects) {
    for (const [iter, val] of Object.entries(p.matrix)) {
      const dates = Array.isArray(val) ? val : [val];
      for (const d of dates) {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        const prev = iterationDates.get(iter);
        if (!prev || d < prev) iterationDates.set(iter, d);
      }
    }
  }

  const iterations = [...iterationDates.entries()]
    .map(([key, date]) => ({ key, date }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const colorByType = new Map<string, string>();
  view.projects.forEach((p, i) => colorByType.set(p.name, TYPE_COLORS[i % TYPE_COLORS.length]));

  const projects: Project[] = iterations.map((row, rowIdx) => {
    const colors = ITERATION_COLORS[rowIdx % ITERATION_COLORS.length];
    const milestones: Milestone[] = [];
    view.projects.forEach((p) => {
      const val = p.matrix[row.key];
      if (!val) return;
      const dates = Array.isArray(val) ? val : [val];
      dates.forEach((d, di) => {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        milestones.push({
          id: `${row.key}__${p.name}__${di}`,
          iteration: p.name,
          releaseDate: d,
          remark: shortDate(d),
          detailRemark: row.key,
          color: colorByType.get(p.name) || "#d8ff3e",
          textColor: colors.text,
          shape: "diamond",
        });
      });
    });
    milestones.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    return {
      uuid: `sp_${row.key}`,
      name: row.key,
      tag: GROUP_DEFS[normGroup(row.key)]?.label || "CEA 平台",
      detailRemark: "",
      bgColor: colors.bg,
      textColor: colors.text,
      milestones,
      viewId: "safety-plan",
    } as Project;
  });

  return { projects };
}

function buildVehicleRows(view: UpstreamView): { projects: Project[] } {
  const rows = view.projects
    .map((p) => ({ p, date: earliest(p.matrix) }))
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const projects: Project[] = rows.map((row, rowIdx) => {
    const colors = ITERATION_COLORS[rowIdx % ITERATION_COLORS.length];
    const marker = row.p.name.includes("Vehicle MS") ? "triangle" : "circle";
    const milestones: Milestone[] = [];
    Object.entries(row.p.matrix).forEach(([iter, val]) => {
      if (!iter) return;
      const dates = Array.isArray(val) ? val : [val];
      dates.forEach((d, di) => {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        milestones.push({
          id: `${row.p.name}__${iter}__${di}`,
          iteration: iter,
          releaseDate: d,
          remark: shortDate(d),
          detailRemark: "",
          color: colors.text,
          textColor: colors.text,
          shape: marker,
        });
      });
    });
    milestones.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    return {
      uuid: `sp_${row.p.name}`,
      name: row.p.name,
      tag: row.p.tags || "",
      detailRemark: row.p.remark || "",
      bgColor: colors.bg,
      textColor: colors.text,
      milestones,
      viewId: "safety-plan",
    } as Project;
  });

  return { projects };
}

export function SafetyPlanTimeline() {
  const [data, setData] = useState<SafetyPlanData | null>(null);
  const [error, setError] = useState("");
  const [viewName, setViewName] = useState("CEA 2.X Platform");
  const [columnWidth, setColumnWidth] = useState(20);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ ipd: true, cea: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let parsed: SafetyPlanData | null = null;
      try {
        const res = await fetch(`/api/safety-plan?token=${TOKEN}`);
        if (res.ok) {
          const body = await res.json();
          if (body?.upstreamPlan) parsed = body;
        }
      } catch {
        /* fall through to static json */
      }
      try {
        if (!parsed) {
          const res = await fetch("/safety-plan/data.json");
          if (res.ok) parsed = await res.json();
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      if (parsed?.upstreamPlan) {
        setData(parsed);
        const names = Object.keys(parsed.upstreamPlan!.views);
        if (names.length > 0) setViewName(names[0]);
      } else {
        setError("Safety Plan 数据加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const viewNames = useMemo(() => (data?.upstreamPlan ? Object.keys(data.upstreamPlan.views) : []), [data]);
  const upView = data?.upstreamPlan?.views?.[viewName] || null;

  const { projects, isPlatform } = useMemo(() => {
    if (!upView) return { projects: [] as Project[], isPlatform: false };
    const platformLike = viewName === "CEA 2.X Platform" || viewName === "IPD &MS Match";
    const built = platformLike ? buildPlatformRows(upView) : buildVehicleRows(upView);
    return { ...built, isPlatform: platformLike };
  }, [upView, viewName]);

  const range = useMemo(() => (upView ? viewRange(upView) : { start: "2026-01-05", end: "2029-01-01" }), [upView]);

  const visibleProjects = useMemo(() => {
    if (!isPlatform) return projects;
    return projects.filter((p) => !collapsed[normGroup(p.name)]);
  }, [projects, collapsed, isPlatform]);

  const groupStats = useMemo(() => {
    if (!isPlatform) return [];
    const ipdRows = projects.filter((p) => normGroup(p.name) === "ipd");
    const ceaRows = projects.filter((p) => normGroup(p.name) === "cea");
    return [
      { id: "ipd" as const, label: GROUP_DEFS.ipd.label, icon: GROUP_DEFS.ipd.icon, count: ipdRows.length, msCount: ipdRows.reduce((s, p) => s + p.milestones.length, 0) },
      { id: "cea" as const, label: GROUP_DEFS.cea.label, icon: GROUP_DEFS.cea.icon, count: ceaRows.length, msCount: ceaRows.reduce((s, p) => s + p.milestones.length, 0) },
    ].filter((g) => g.count > 0);
  }, [projects, isPlatform]);

  const ceaView = useMemo<View>(
    () => ({
      id: `safety-plan_${viewName}`,
      name: viewName,
      type: "plan",
      startDate: range.start,
      endDate: range.end,
      content: `${data?.upstreamPlan?.source || viewName}`,
      columnWidth,
      projects: visibleProjects,
      connections: [],
    }),
    [viewName, range, columnWidth, visibleProjects, data],
  );

  const legendColors = useMemo(() => {
    if (!isPlatform || !upView) return [];
    return upView.projects.map((p, i) => ({ name: p.name, color: TYPE_COLORS[i % TYPE_COLORS.length] }));
  }, [upView, isPlatform]);

  if (error) return <div className="cea-version-empty"><p>{error}</p></div>;
  if (!data || !upView) return <div className="cea-version-empty"><p>加载 Safety Plan 数据…</p></div>;

  return (
    <section className="cea-version-view">
      <div className="cea-version-toolbar">
        <select value={viewName} onChange={(e) => setViewName(e.target.value)} className="toolbar-select">
          {viewNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <span className="cea-version-count">{visibleProjects.length} 行 · {visibleProjects.reduce((s, p) => s + p.milestones.length, 0)} 个里程碑 · 导出 {data.upstreamPlan?.exportDate || "—"}</span>
        <span style={{ flex: 1 }} />
        <span className="column-width-control">
          <button onClick={() => setColumnWidth((w) => Math.max(10, w - 2))}>−</button>
          <input type="number" min="10" max="120" value={columnWidth} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v) && v >= 8 && v <= 200) setColumnWidth(v); }} />
          <span>px / 周</span>
          <button onClick={() => setColumnWidth((w) => Math.min(120, w + 2))}>＋</button>
        </span>
      </div>

      {isPlatform && (
        <>
          <div className="cea-group-bar">
            {groupStats.map((g) => {
              const isCollapsed = collapsed[g.id];
              return (
                <button
                  key={g.id}
                  className={`cea-group-chip ${isCollapsed ? "collapsed" : ""}`}
                  style={{ background: ITERATION_COLORS[g.id === "ipd" ? 0 : 1].bg, color: ITERATION_COLORS[g.id === "ipd" ? 0 : 1].text }}
                  onClick={() => setCollapsed((p) => ({ ...p, [g.id]: !p[g.id] }))}
                >
                  <span className="cea-group-chip-icon">{g.icon}</span>
                  <span>{g.label}</span>
                  <span className="cea-group-chip-count">{g.count} / {g.msCount}</span>
                  <span className={`cea-chip-chevron ${isCollapsed ? "rotated" : ""}`}>▾</span>
                </button>
              );
            })}
          </div>
          <div className="cea-group-bar" style={{ marginBottom: 10 }}>
            {legendColors.map((item) => (
              <span key={item.name} className="safety-plan-legend">
                <i style={{ background: item.color }} />{item.name}
              </span>
            ))}
          </div>
        </>
      )}

      <ProjectPlanCanvas
        view={ceaView}
        projects={visibleProjects}
        onProjectClick={() => {}}
        onMilestoneClick={() => {}}
        arrowMode={false}
        arrowStart={null}
        onArrowMilestone={() => {}}
        onUpdateProject={() => {}}
        onUpdateItem={() => {}}
        onSelectItem={() => {}}
        selectedItemId={null}
        onConnectionClick={() => {}}
        selectedConnectionId={null}
        onColumnWidthChange={(delta) => setColumnWidth((w) => Math.max(10, Math.min(120, w + delta)))}
        readOnly
      />
    </section>
  );
}