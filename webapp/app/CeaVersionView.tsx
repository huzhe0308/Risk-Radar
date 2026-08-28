"use client";

import { useMemo } from "react";
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
  return key;
}

function sortKey(key: string): number {
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

function versionTag(key: string): string {
  const sk = sortKey(key);
  if (sk < 10000) return "IPD 迭代";
  if (sk < 20000) return "CEA 平台";
  if (sk < 20500) return "量产节点";
  if (sk < 99999) return "发布节点";
  return "其他";
}

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
  const versionProjects = useMemo(() => {
    const map = new Map<string, Milestone[]>();

    for (const project of projects) {
      for (const ms of project.milestones) {
        const key = normKey(ms.iteration);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          ...ms,
          iteration: project.name,
          remark: ms.remark || ms.iteration,
          detailRemark: project.tag || "",
        });
      }
    }

    return [...map.entries()]
      .sort((a, b) => sortKey(a[0]) - sortKey(b[0]))
      .map(([key, milestones], index) => {
        const colorIdx = index % VERSION_COLORS.length;
        return {
          uuid: `cea_${key}`,
          name: displayKey(key),
          tag: versionTag(key),
          detailRemark: "",
          bgColor: VERSION_COLORS[colorIdx].bg,
          textColor: VERSION_COLORS[colorIdx].text,
          milestones: milestones.sort((a, b) =>
            (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999"),
          ),
          viewId: "cea",
        } as Project;
      });
  }, [projects]);

  const ceaView = useMemo<View>(
    () => ({
      ...view,
      planItems: [],
      connections: [],
    }),
    [view],
  );

  if (!versionProjects.length) {
    return (
      <div className="cea-version-empty">
        <p>当前视图没有里程碑数据。</p>
      </div>
    );
  }

  return (
    <section className="cea-version-view">
      <div className="cea-version-toolbar">
        <span className="cea-version-count">{versionProjects.length} 个版本行</span>
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
