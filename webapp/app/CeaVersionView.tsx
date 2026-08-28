"use client";

import { useMemo, useState } from "react";
import type { Milestone, Project, View } from "./types";
import { ProjectPlanCanvas } from "./ProjectPlanCanvas";

function normKey(iteration: string): string {
  return iteration.trim().replace(/\s+/g, "").toUpperCase();
}

function displayKey(key: string): string {
  const ipd = key.match(/^IPD(\d+)\.(\d+)$/);
  if (ipd) return `IPD ${ipd[1]}.${ipd[2]}`;
  const cea = key.match(/^CEA(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (cea) return `CEA ${cea[1]}.${cea[2]}${cea[3] ? `.${cea[3]}` : ""}`;
  if (key === "SWRELEASE") return "SW Release";
  if (key === "VEHICLERELEASE") return "Vehicle Release";
  if (key === "RELEASETEST") return "Release Test";
  if (key === "RELEASE") return "Release";
  if (key === "PRE-PVF") return "Pre-PVF";
  if (key === "UFT") return "UFT";
  if (key.startsWith("PVS")) return "PVS/MGS";
  if (key === "SOP") return "SOP";
  if (key === "SP") return "SP";
  return key;
}

function rawSort(key: string): number {
  const ipd = key.match(/^IPD(\d+)\.(\d+)$/);
  if (ipd) return Number(ipd[1]) * 100 + Number(ipd[2]);
  const cea = key.match(/^CEA(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (cea) return 10000 + Number(cea[1]) * 100 + Number(cea[2]) * 10 + (Number(cea[3]) || 0);
  if (key === "SP") return 20000;
  if (key === "PRE-PVF") return 20100;
  if (key === "UFT") return 20200;
  if (key.startsWith("PVS")) return 20300;
  if (key === "SOP") return 20400;
  if (key === "SWRELEASE") return 20500;
  if (key === "VEHICLERELEASE") return 20600;
  if (key === "RELEASETEST") return 20700;
  if (key === "RELEASE") return 20800;
  return 99999;
}

function groupId(key: string): string {
  const sk = rawSort(key);
  if (sk < 10000) return "ipd";
  if (sk < 20000) return "cea";
  if (sk < 20500) return "production";
  if (sk < 99999) return "release";
  return "other";
}

const GROUP_DEFS: { id: string; label: string; icon: string }[] = [
  { id: "ipd", label: "IPD 迭代", icon: "◆" },
  { id: "cea", label: "CEA 平台", icon: "★" },
  { id: "production", label: "量产节点", icon: "▲" },
  { id: "release", label: "发布节点", icon: "⚑" },
  { id: "other", label: "其他", icon: "•" },
];

const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  ipd: { bg: "#0d4f4a", text: "#a7f3d0" },
  cea: { bg: "#1a3a5c", text: "#93c5fd" },
  production: { bg: "#3c2a1a", text: "#fbbf24" },
  release: { bg: "#3a1a2c", text: "#f9a8d4" },
  other: { bg: "#3a3a1a", text: "#fde047" },
};

const VERSION_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#0d4f4a", text: "#a7f3d0" },
  { bg: "#1a3a5c", text: "#93c5fd" },
  { bg: "#3c2a1a", text: "#fbbf24" },
  { bg: "#3a1a2c", text: "#f9a8d4" },
  { bg: "#1a2c3a", text: "#67e8f9" },
  { bg: "#2c1a3a", text: "#c4b5fd" },
  { bg: "#3a3a1a", text: "#fde047" },
  { bg: "#1a3a2c", text: "#6ee7b7" },
];

export function CeaVersionView({
  view,
  projects,
  onMilestoneClick,
}: {
  view: View;
  projects: Project[];
  onMilestoneClick: (projectId: string, milestoneId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    ipd: true,
    cea: false,
    production: false,
    release: false,
    other: false,
  });

  const { versionProjects, groupStats } = useMemo(() => {
    const map = new Map<string, { milestones: Milestone[]; gId: string }>();

    for (const project of projects) {
      for (const ms of project.milestones) {
        const key = normKey(ms.iteration);
        const gId = groupId(key);
        let entry = map.get(key);
        if (!entry) {
          entry = { milestones: [], gId };
          map.set(key, entry);
        }
        entry.milestones.push({
          ...ms,
          iteration: project.name,
          remark: ms.remark || ms.iteration,
          detailRemark: project.tag || "",
        });
      }
    }

    const allKeys = [...map.keys()].sort((a, b) => rawSort(a) - rawSort(b));
    let colorIdx = 0;

    const allProjects = allKeys.map((key) => {
      const entry = map.get(key)!;
      const c = VERSION_COLORS[colorIdx % VERSION_COLORS.length];
      colorIdx++;
      return {
        uuid: `cea_${key}`,
        name: displayKey(key),
        tag: GROUP_DEFS.find((g) => g.id === entry.gId)?.label || "其他",
        detailRemark: "",
        bgColor: c.bg,
        textColor: c.text,
        milestones: entry.milestones.sort((a, b) =>
          (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999"),
        ),
        viewId: "cea",
      } as Project;
    });

    const stats = GROUP_DEFS.map((gd) => {
      const groupRows = allProjects.filter((p) => groupId(normKeyFromName(p.name)) === gd.id);
      return {
        id: gd.id,
        label: gd.label,
        icon: gd.icon,
        count: groupRows.length,
        msCount: groupRows.reduce((s, p) => s + p.milestones.length, 0),
      };
    }).filter((s) => s.count > 0);

    const visible = allProjects.filter((p) => {
      const key = normKeyFromName(p.name);
      const gId = groupId(key);
      return !collapsed[gId];
    });

    return { versionProjects: visible, groupStats: stats };
  }, [projects, collapsed]);

  const ceaView = useMemo<View>(
    () => ({
      ...view,
      planItems: [],
      connections: [],
    }),
    [view],
  );

  if (!versionProjects.length && !groupStats.length) {
    return (
      <div className="cea-version-empty">
        <p>当前视图没有里程碑数据。</p>
      </div>
    );
  }

  return (
    <section className="cea-version-view">
      <div className="cea-group-bar">
        {groupStats.map((g) => {
          const isCollapsed = collapsed[g.id];
          const colors = GROUP_COLORS[g.id] || GROUP_COLORS.other;
          return (
            <button
              key={g.id}
              className={`cea-group-chip ${isCollapsed ? "collapsed" : ""}`}
              style={{ background: colors.bg, color: colors.text }}
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
      <ProjectPlanCanvas
        view={ceaView}
        projects={versionProjects}
        onProjectClick={() => {}}
        onMilestoneClick={onMilestoneClick}
        arrowMode={false}
        arrowStart={null}
        onArrowMilestone={() => {}}
        onUpdateProject={() => {}}
        onUpdateItem={() => {}}
        onSelectItem={() => {}}
        selectedItemId={null}
        onConnectionClick={() => {}}
        selectedConnectionId={null}
        onColumnWidthChange={() => {}}
        readOnly
      />
    </section>
  );
}

function normKeyFromName(name: string): string {
  return name.trim().replace(/\s+/g, "").toUpperCase();
}
