"use client";

import { useMemo } from "react";
import type { Connection, Milestone, Project, View } from "./types";

const HEADER_HEIGHT = 72;
const ROW_HEIGHT = 76;

type MonthCell = { year: number; month: number; key: string };

function getMonths(startDate: string, endDate: string): MonthCell[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const months: MonthCell[] = [];
  while (current <= last && months.length < 120) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    months.push({ year, month, key: `${year}-${month}` });
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

function resolveColor(color: string): string {
  const colorMap: Record<string, string> = {
    red: "#c0392b",
    orange: "#e67e22",
    blue: "#008c82",
    green: "#27ae60",
  };
  return colorMap[color] || color || "#ff4d4f";
}

function lineStyle(lineType: string): { width: number; dash: string } {
  if (lineType === "extra-thick-solid") return { width: 10, dash: "" };
  if (lineType === "thick-solid") return { width: 3, dash: "" };
  if (lineType === "thick-dashed") return { width: 3, dash: "8 4" };
  if (lineType === "thin-solid") return { width: 1.5, dash: "" };
  if (lineType === "thin-dashed") return { width: 1.5, dash: "6 3" };
  return { width: 1.5, dash: lineType.includes("dash") ? "6 3" : "" };
}

function markerPosition(milestone: Milestone, months: MonthCell[], columnWidth: number): number | null {
  if (!milestone.releaseDate) return null;
  const date = new Date(`${milestone.releaseDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return null;
  const monthIndex = months.findIndex((month) => month.year === date.getFullYear() && month.month === date.getMonth() + 1);
  if (monthIndex < 0) return null;
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return monthIndex * columnWidth + (date.getDate() / days) * columnWidth;
}

function findMilestone(project: Project | undefined, milestoneId: string): Milestone | undefined {
  return project?.milestones.find((milestone) => milestone.id === milestoneId);
}

function connectionPath(
  connection: Connection,
  projects: Project[],
  months: MonthCell[],
  columnWidth: number,
): { d: string; style: { width: number; dash: string }; color: string } | null {
  const fromRow = projects.findIndex((project) => project.name === connection.fromProject);
  const toRow = projects.findIndex((project) => project.name === connection.toProject);
  if (fromRow < 0 || toRow < 0) return null;
  const fromProject = projects[fromRow];
  const toProject = projects[toRow];
  const fromMilestone = findMilestone(fromProject, connection.fromMsId);
  const toMilestone = findMilestone(toProject, connection.toMsId);
  if (!fromMilestone || !toMilestone) return null;
  const x1 = markerPosition(fromMilestone, months, columnWidth);
  const x2 = markerPosition(toMilestone, months, columnWidth);
  if (x1 == null || x2 == null) return null;
  const y1 = HEADER_HEIGHT + fromRow * ROW_HEIGHT + 18;
  const y2 = HEADER_HEIGHT + toRow * ROW_HEIGHT + 18;
  const d = connection.shape === "straight"
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`;
  return { d, style: lineStyle(connection.lineType || "thin-dashed"), color: connection.color || "#1a1a1a" };
}

function MarkerShape({ shape, color }: { shape: string; color: string }) {
  return <span className={`grid-marker-shape shape-${shape || "triangle"}`} style={{ "--marker-color": color } as React.CSSProperties} />;
}

export function TimelineGrid({
  view,
  projects,
  columnWidth,
  onProjectClick,
  onMilestoneClick,
}: {
  view: View;
  projects: Project[];
  columnWidth: number;
  onProjectClick: (projectId: string) => void;
  onMilestoneClick: (projectId: string, milestoneId: string) => void;
}) {
  const months = useMemo(() => getMonths(view.startDate, view.endDate), [view.startDate, view.endDate]);
  const yearBlocks = useMemo(() => {
    const blocks: Array<{ year: number; start: number; count: number }> = [];
    months.forEach((month, index) => {
      const last = blocks.at(-1);
      if (last?.year === month.year) last.count += 1;
      else blocks.push({ year: month.year, start: index, count: 1 });
    });
    return blocks;
  }, [months]);
  const canvasWidth = Math.max(months.length * columnWidth, 600);
  const canvasHeight = HEADER_HEIGHT + projects.length * ROW_HEIGHT;
  const renderedConnections = useMemo(
    () => view.connections.map((connection) => ({ connection, path: connectionPath(connection, projects, months, columnWidth) })).filter((item) => item.path),
    [view.connections, projects, months, columnWidth],
  );

  return (
    <section className="plan-group-section">
      <div className="plan-group-summary">
        <div><strong>{view.name}</strong><span>{view.startDate} ~ {view.endDate}</span></div>
        <span>{renderedConnections.length} / {view.connections.length} 条有效连接</span>
      </div>
      <div className="plan-grid-shell">
        <div className="plan-fixed-column">
          <div className="plan-fixed-header" aria-hidden="true" />
          {projects.map((project) => (
            <button
              key={project.uuid}
              className="plan-project-cell"
              style={{ background: project.bgColor || "#ecf0f1", color: project.textColor || "#002733" }}
              onClick={() => onProjectClick(project.uuid)}
              title={project.detailRemark || project.name}
            >
              <span>{project.name}</span>
            </button>
          ))}
        </div>

        <div className="plan-grid-scroll">
          <div className="plan-grid-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
            <div className="plan-year-row">
              {yearBlocks.map((block) => <div key={block.year} style={{ left: block.start * columnWidth, width: block.count * columnWidth }}>{block.year}</div>)}
            </div>
            <div className="plan-month-row">
              {months.map((month, index) => <div key={month.key} style={{ left: index * columnWidth, width: columnWidth }}>{month.month}</div>)}
            </div>

            <div className="plan-grid-body">
              {projects.map((project) => (
                <div className="plan-grid-row" key={project.uuid} style={{ background: project.bgColor || "#fff" }}>
                  {months.map((month) => <div className="plan-month-cell" key={month.key} style={{ width: columnWidth }} />)}
                  {project.milestones.map((milestone) => {
                    const x = markerPosition(milestone, months, columnWidth);
                    if (x == null) return null;
                    const markerColor = resolveColor(milestone.color);
                    return (
                      <button
                        type="button"
                        className="grid-milestone"
                        key={milestone.id}
                        style={{ left: x }}
                        title={`${milestone.iteration} · ${milestone.releaseDate}${milestone.remark ? ` · ${milestone.remark}` : ""}`}
                        onClick={() => onMilestoneClick(project.uuid, milestone.id)}
                      >
                        <MarkerShape shape={milestone.shape} color={markerColor} />
                        <span className="grid-marker-label" style={{ color: milestone.textColor || "#1a1a1a" }}>{milestone.iteration}</span>
                        {milestone.remark && <span className="grid-marker-remark" style={{ color: milestone.textColor || "#1a1a1a" }}>{milestone.remark}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <svg className="plan-connection-layer" width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} aria-label="里程碑连接线">
              {renderedConnections.map(({ connection, path }) => path && (
                <path
                  key={connection.id}
                  d={path.d}
                  fill="none"
                  stroke={path.color}
                  strokeWidth={path.style.width}
                  strokeDasharray={path.style.dash || undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
