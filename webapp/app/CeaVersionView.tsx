"use client";

import { useMemo } from "react";
import type { Milestone, Project, View } from "./types";
import { ProjectPlanCanvas } from "./ProjectPlanCanvas";

const CEA_PATTERN = /^CEA\s?(\d+)\.(\d+)(?:\.(\d+))?$/i;

function ceaSortKey(version: string): number {
  const match = version.trim().match(CEA_PATTERN);
  if (!match) return 99;
  return Number(match[1]) * 100 + Number(match[2]) * 10 + (match[3] ? Number(match[3]) : 0);
}

function isCeaIteration(iteration: string): boolean {
  return CEA_PATTERN.test(iteration.trim());
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
  const ceaProjects = useMemo(() => {
    const map = new Map<string, { project: Project; milestones: Milestone[] }>();

    for (const project of projects) {
      for (const ms of project.milestones) {
        if (!isCeaIteration(ms.iteration)) continue;
        const version = ms.iteration.trim().replace(/\s+/g, " ");
        let entry = map.get(version);
        if (!entry) {
          entry = { project: createCeaProject(version, map.size), milestones: [] };
          map.set(version, entry);
        }
        entry.milestones.push({
          ...ms,
          iteration: project.name,
          remark: ms.remark || ms.iteration,
        });
      }
    }

    return [...map.values()]
      .sort((a, b) => ceaSortKey(a.project.name) - ceaSortKey(b.project.name))
      .map((entry) => ({
        ...entry.project,
        milestones: entry.milestones.sort((a, b) =>
          (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999"),
        ),
      }));
  }, [projects]);

  const ceaView = useMemo<View>(
    () => ({
      ...view,
      planItems: [],
      connections: [],
    }),
    [view],
  );

  if (!ceaProjects.length) {
    return (
      <div className="cea-version-empty">
        <p>当前视图没有 CEA 版本里程碑。</p>
        <small>CEA 版本里程碑的 iteration 字段需匹配 CEA x.x 或 CEA x.x.x 格式。</small>
      </div>
    );
  }

  return (
    <section className="cea-version-view">
      <div className="cea-version-toolbar">
        <span className="cea-version-count">{ceaProjects.length} 个 CEA 版本</span>
      </div>
      <ProjectPlanCanvas
        view={ceaView}
        projects={ceaProjects}
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

function createCeaProject(version: string, index: number): Project {
  const colorIdx = index % VERSION_COLORS.length;
  return {
    uuid: `cea_${version.replace(/\s+/g, "_")}`,
    name: version,
    tag: ceaSortKey(version) % 10 === 0 ? "主版本" : "补丁",
    detailRemark: "",
    bgColor: VERSION_COLORS[colorIdx].bg,
    textColor: VERSION_COLORS[colorIdx].text,
    milestones: [],
    viewId: "cea",
  };
}
