"use client";

import { useCallback, useMemo } from "react";
import type { Milestone, PlanItem, Project, View } from "./types";

const HEADER_HEIGHT = 108;
const ROW_HEIGHT = 76;

type WeekCell = { year: number; month: number; week: number; key: string; startDate: Date };

type FrameWeekRange = {
  left: number;
  width: number;
  startIndex: number;
  endIndex: number;
  start: WeekCell;
  end: WeekCell;
};

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function weeksBetween(startDate: string, endDate: string): WeekCell[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const weeks: WeekCell[] = [];
  const current = getMondayOfWeek(start);
  
  while (current <= end && weeks.length < 520) {
    const thursday = new Date(current);
    thursday.setDate(current.getDate() + 3);
    const weekNum = getISOWeek(current);
    
    weeks.push({ 
      year: thursday.getFullYear(), 
      month: thursday.getMonth() + 1, 
      week: weekNum, 
      key: `${thursday.getFullYear()}-${thursday.getMonth() + 1}-${weekNum}`,
      startDate: new Date(current)
    });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function positionFor(milestone: Milestone, weeks: WeekCell[], weekWidth: number): number | null {
  if (milestone.week != null && milestone.year != null) {
    const year4 = milestone.year < 100 ? 2000 + milestone.year : milestone.year;
    const index = weeks.findIndex((w) => w.year === year4 && w.week === milestone.week);
    if (index >= 0) return index * weekWidth + weekWidth / 2;
  }
  const date = new Date(`${milestone.releaseDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return null;
  const milestoneWeek = getISOWeek(date);
  const index = weeks.findIndex((w) => w.year === date.getFullYear() && w.week === milestoneWeek);
  if (index < 0) return null;
  const dayOfWeek = date.getDay() || 7;
  return index * weekWidth + ((dayOfWeek - 1) / 7) * weekWidth;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function frameWeekRange(item: PlanItem, weeks: WeekCell[], weekWidth: number): FrameWeekRange | null {
  if (!weeks.length) return null;

  let startIndex = -1;
  let endIndex = -1;
  if (item.startWeek && item.startYear && item.endWeek && item.endYear) {
    startIndex = weeks.findIndex((week) => week.year === normalizeYear(item.startYear!) && week.week === item.startWeek);
    endIndex = weeks.findIndex((week) => week.year === normalizeYear(item.endYear!) && week.week === item.endWeek);
  }

  if (startIndex < 0 || endIndex < 0) {
    startIndex = Math.max(0, Math.min(weeks.length - 1, Math.round(item.x / weekWidth)));
    const endBoundary = Math.max(startIndex + 1, Math.min(weeks.length, Math.round((item.x + item.width) / weekWidth)));
    endIndex = endBoundary - 1;
  }

  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  return {
    left: startIndex * weekWidth,
    width: (endIndex - startIndex + 1) * weekWidth,
    startIndex,
    endIndex,
    start: weeks[startIndex],
    end: weeks[endIndex],
  };
}

function frameRangePatch(range: FrameWeekRange): Partial<PlanItem> {
  return {
    x: range.left,
    width: range.width,
    startWeek: range.start.week,
    startYear: range.start.year,
    endWeek: range.end.week,
    endYear: range.end.year,
  };
}

function textDisplayHeight(item: PlanItem): number {
  if (item.kind !== "text") return item.height;
  if (item.manualSize) return item.height;
  const fontSize = item.fontSize || 13;
  return Math.max(30, item.text.split("\n").length * fontSize * 1.35 + 12);
}

export function ProjectPlanCanvas({
  view,
  projects,
  onProjectClick,
  onMilestoneClick,
  arrowMode,
  arrowStart,
  onArrowMilestone,
  onUpdateProject,
  onUpdateItem,
  onSelectItem,
  selectedItemId,
  onConnectionClick,
  selectedConnectionId,
  onColumnWidthChange,
  readOnly = false,
  highlightedProjectNames = [],
  highlightedMilestoneKeys = [],
  connectionColor,
}: {
  view: View;
  projects: Project[];
  onProjectClick: (id: string) => void;
  onMilestoneClick: (projectId: string, milestoneId: string) => void;
  arrowMode: boolean;
  arrowStart: { projectId: string; milestoneId: string } | null;
  onArrowMilestone: (projectId: string, milestoneId: string) => void;
  onUpdateProject: (projectId: string, patch: Partial<Project>) => void;
  onUpdateItem: (id: string, patch: Partial<PlanItem>) => void;
  onSelectItem: (id: string | null) => void;
  selectedItemId: string | null;
  onConnectionClick: (id: string | null) => void;
  selectedConnectionId: string | null;
  onColumnWidthChange: (delta: number) => void;
  readOnly?: boolean;
  highlightedProjectNames?: string[];
  highlightedMilestoneKeys?: string[];
  connectionColor?: string;
}) {
  const weeks = useMemo(() => weeksBetween(view.startDate, view.endDate), [view.startDate, view.endDate]);
  const weekWidth = view.columnWidth || 20;
  const years = useMemo(() => {
    const items: Array<{ year: number; start: number; count: number }> = [];
    weeks.forEach((week, index) => {
      const current = items.at(-1);
      if (current?.year === week.year) current.count += 1;
      else items.push({ year: week.year, start: index, count: 1 });
    });
    return items;
  }, [weeks]);
  const months = useMemo(() => {
    const items: Array<{ year: number; month: number; start: number; count: number }> = [];
    weeks.forEach((week, index) => {
      const current = items.at(-1);
      if (current?.year === week.year && current?.month === week.month) current.count += 1;
      else items.push({ year: week.year, month: week.month, start: index, count: 1 });
    });
    return items;
  }, [weeks]);
  const width = Math.max(960, weeks.length * weekWidth);
  const rowTop = useCallback((rowIndex: number) => projects.slice(0, rowIndex).reduce((total, project) => total + (project.rowHeight || ROW_HEIGHT), HEADER_HEIGHT), [projects]);
  const height = Math.max(620, HEADER_HEIGHT + projects.reduce((total, project) => total + (project.rowHeight || ROW_HEIGHT), 0) + 100);
  const items = view.planItems || [];
  const changedProjects = useMemo(() => new Set(highlightedProjectNames), [highlightedProjectNames]);
  const changedMilestones = useMemo(() => new Set(highlightedMilestoneKeys), [highlightedMilestoneKeys]);
  const renderedArrows = useMemo(() => view.connections.flatMap((connection) => {
    const fromRow = projects.findIndex((project) => project.name === connection.fromProject);
    const toRow = projects.findIndex((project) => project.name === connection.toProject);
    const from = projects[fromRow]?.milestones.find((milestone) => milestone.id === connection.fromMsId);
    const to = projects[toRow]?.milestones.find((milestone) => milestone.id === connection.toMsId);
    const x1 = from ? positionFor(from, weeks, weekWidth) : null;
    const x2 = to ? positionFor(to, weeks, weekWidth) : null;
    if (fromRow < 0 || toRow < 0 || x1 == null || x2 == null) return [];
    const y1 = rowTop(fromRow) + 20;
    const y2 = rowTop(toRow) + 20;
    return [{ id: connection.id, d: `M ${x1} ${y1} L ${x2} ${y2}`, color: connectionColor || connection.color || "#d8ff3e", dashed: connection.lineType.includes("dash") }];
  }), [view.connections, projects, weeks, weekWidth, rowTop, connectionColor]);

  const startRowResize = (event: React.PointerEvent, project: Project) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = project.rowHeight || ROW_HEIGHT;
    const move = (moveEvent: PointerEvent) => onUpdateProject(project.uuid, { rowHeight: Math.max(42, Math.min(180, startHeight + moveEvent.clientY - startY)) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startColumnResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    let lastUpdate = startX;
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - lastUpdate;
      if (Math.abs(dx) >= 2) {
        onColumnWidthChange(dx);
        lastUpdate = moveEvent.clientX;
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startPointerAction = (
    event: React.PointerEvent,
    item: PlanItem,
    action: "move" | "resize",
    rendered?: { x: number; y: number; width: number; height: number },
  ) => {
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = rendered || { x: item.x, y: item.y, width: item.width, height: item.height };
    const initialFrameRange = item.kind === "frame"
      ? frameWeekRange({ ...item, x: start.x, width: start.width }, weeks, weekWidth)
      : null;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (item.kind === "frame" && initialFrameRange) {
        if (action === "move") {
          const span = initialFrameRange.endIndex - initialFrameRange.startIndex + 1;
          const maxStartIndex = Math.max(0, weeks.length - span);
          const nextStartIndex = Math.max(0, Math.min(maxStartIndex, Math.round((start.x + dx) / weekWidth)));
          const nextRange: FrameWeekRange = {
            left: nextStartIndex * weekWidth,
            width: span * weekWidth,
            startIndex: nextStartIndex,
            endIndex: nextStartIndex + span - 1,
            start: weeks[nextStartIndex],
            end: weeks[nextStartIndex + span - 1],
          };
          onUpdateItem(item.id, {
            ...frameRangePatch(nextRange),
            y: item.projectId ? item.y : Math.max(HEADER_HEIGHT + 4, item.y + dy),
          });
        } else {
          const endBoundaryIndex = Math.max(
            initialFrameRange.startIndex + 1,
            Math.min(weeks.length, Math.round((start.x + start.width + dx) / weekWidth)),
          );
          const nextRange: FrameWeekRange = {
            left: initialFrameRange.left,
            width: (endBoundaryIndex - initialFrameRange.startIndex) * weekWidth,
            startIndex: initialFrameRange.startIndex,
            endIndex: endBoundaryIndex - 1,
            start: weeks[initialFrameRange.startIndex],
            end: weeks[endBoundaryIndex - 1],
          };
          onUpdateItem(item.id, {
            ...frameRangePatch(nextRange),
            height: 34,
            manualSize: true,
          });
        }
      } else if (action === "move") {
        onUpdateItem(item.id, { x: Math.max(0, start.x + dx), y: Math.max(HEADER_HEIGHT + 4, start.y + dy) });
      } else {
        onUpdateItem(item.id, { width: Math.max(50, start.width + dx), height: Math.max(24, start.height + dy), manualSize: true });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section className="project-plan">
      <div className="project-plan-note"><strong>{view.content || view.name}</strong><span>PROJECT PLAN CANVAS</span><small>{readOnly ? "更新版 Excel · 只读时间线预览" : "Click text to edit · Drag blocks to arrange · Drag the corner to resize"}</small></div>
      <div className="project-plan-shell">
        <aside className="project-plan-lanes">
          <div className="project-plan-lane-head">Workstream</div>
          {projects.map((project) => <button key={project.uuid} style={{ height: project.rowHeight || ROW_HEIGHT, background: project.bgColor && project.bgColor !== "transparent" ? project.bgColor : "#00323c", color: project.bgColor && project.bgColor !== "transparent" ? (project.textColor || "#ffffff") : "#ffffff" }} onClick={() => !readOnly && onProjectClick(project.uuid)}>{project.name}{!readOnly && <span className="project-plan-row-resize" title="调整行高" onPointerDown={(event) => startRowResize(event, project)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} />}</button>)}
          {!readOnly && <span className="project-plan-col-resize" title="拖动调整列宽" onPointerDown={startColumnResize} />}
          {changedProjects.size > 0 && <div className="project-change-overlays" aria-label="Changed projects">{projects.map((project, index) => changedProjects.has(project.name) && <span key={project.uuid} style={{ top: rowTop(index) - HEADER_HEIGHT, height: project.rowHeight || ROW_HEIGHT }} />)}</div>}
        </aside>
        <div className="project-plan-scroll">
          <div className="project-plan-surface" style={{ width, height }} onPointerDown={() => { onSelectItem(null); onConnectionClick(null); }}>
            <svg className="project-plan-arrow-layer" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Milestone links">
              <defs>{renderedArrows.map((arrow) => <marker key={arrow.id} id={`plan-arrow-head-${arrow.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={arrow.color} /></marker>)}</defs>
              {renderedArrows.map((arrow) => (
                <g key={arrow.id}>
                  <path d={arrow.d} fill="none" stroke="transparent" strokeWidth="12" className={`project-plan-arrow-hit ${readOnly ? "read-only" : ""}`} onClick={(event) => { event.stopPropagation(); if (!readOnly) onConnectionClick(arrow.id === selectedConnectionId ? null : arrow.id); }} />
                  <path d={arrow.d} fill="none" stroke={arrow.color} strokeWidth="1.5" strokeDasharray={arrow.dashed ? "5 3" : undefined} markerEnd={`url(#plan-arrow-head-${arrow.id})`} className={`project-plan-arrow-path ${arrow.id === selectedConnectionId ? "selected" : ""}`} />
                </g>
              ))}
            </svg>
            <div className="project-plan-years">{years.map((year) => <span key={year.year} style={{ left: year.start * weekWidth, width: year.count * weekWidth }}>{year.year}</span>)}</div>
            <div className="project-plan-months">{months.map((month) => <span key={`${month.year}-${month.month}`} style={{ left: month.start * weekWidth, width: month.count * weekWidth }}>{month.month}</span>)}</div>
            <div className="project-plan-weeks">{weeks.map((week, index) => <span key={week.key} style={{ left: index * weekWidth, width: weekWidth }}>{week.week}</span>)}</div>
            <div className="project-plan-rows">
              {projects.map((project) => <div className="project-plan-row" key={project.uuid} style={{ height: project.rowHeight || ROW_HEIGHT, background: project.bgColor && project.bgColor !== "transparent" ? project.bgColor : "#00323c" }}>{weeks.map((week) => <i key={week.key} style={{ width: weekWidth }} />)}</div>)}
            </div>
            {projects.map((project, index) => project.showSeparatorAbove && <div key={`sep-${project.uuid}`} className="project-plan-separator" style={{ top: rowTop(index) - 1 }} />)}
            {projects.flatMap((project, rowIndex) => project.milestones.map((milestone) => ({ project, milestone, rowIndex }))).map(({ project, milestone, rowIndex }) => {
              const x = positionFor(milestone, weeks, weekWidth);
              if (x == null) return null;
              const isArrowStart = arrowStart?.projectId === project.uuid && arrowStart.milestoneId === milestone.id;
              return <button className={`project-plan-milestone ${arrowMode ? "arrow-target" : ""} ${isArrowStart ? "arrow-start" : ""} ${readOnly ? "read-only" : ""}`} key={milestone.id} style={{ left: x, top: rowTop(rowIndex) + 14, color: milestone.textColor || "#d8ff3e" }} onClick={(event) => { event.stopPropagation(); if (readOnly) return; if (arrowMode) onArrowMilestone(project.uuid, milestone.id); else onMilestoneClick(project.uuid, milestone.id); }}><b className={`grid-marker-shape shape-${milestone.shape || "diamond"}`} style={{ "--marker-color": milestone.color } as React.CSSProperties} /><span>{milestone.iteration}</span>{milestone.remark && <small>{milestone.remark}</small>}</button>;
            })}
            {projects.flatMap((project, rowIndex) => project.milestones.map((milestone) => ({ project, milestone, rowIndex }))).map(({ project, milestone, rowIndex }) => {
              const x = positionFor(milestone, weeks, weekWidth);
              if (x == null || !changedMilestones.has(`${project.name}::${milestone.iteration}`)) return null;
              return <span key={`changed-${project.uuid}-${milestone.id}`} className="milestone-change-overlay" style={{ left: x, top: rowTop(rowIndex) + 7 }} aria-label={`${project.name} ${milestone.iteration} changed`}>变更</span>;
            })}
            {items.map((item) => (
              (() => {
                const fontSize = item.fontSize || 13;
                const lines = item.text.split("\n");
                const autoHeight = textDisplayHeight(item);
                const longestLine = Math.max(1, ...lines.map((line) => line.length));
                const autoWidth = item.kind === "text" ? Math.max(80, Math.min(640, longestLine * fontSize * .66 + 20)) : item.width;
                const useManualSize = item.kind === "text" && item.manualSize;
                const renderedWidth = useManualSize ? item.width : autoWidth;
                const renderedHeight = useManualSize ? item.height : autoHeight;

                // Every frame is aligned to complete week columns. Existing saved
                // week/year values win; legacy pixel-only frames are inferred here.
                let left = item.x;
                let top = item.y;
                let width = renderedWidth;
                const height = item.kind === "frame" ? 34 : renderedHeight;
                const range = item.kind === "frame" ? frameWeekRange(item, weeks, weekWidth) : null;
                const isWeekBound = range != null;
                const boundTexts = item.kind === "frame" ? items.filter((candidate) => candidate.kind === "text" && candidate.parentFrameId === item.id) : [];

                if (range) {
                  left = range.left;
                  width = range.width;
                  const frameIndex = item.projectId ? projects.findIndex((p) => p.uuid === item.projectId) : -1;
                  if (frameIndex >= 0) top = rowTop(frameIndex) + 22;
                }

                const renderedGeometry = { x: left, y: top, width, height };
                const syncFrameRange = () => {
                  if (range) onUpdateItem(item.id, frameRangePatch(range));
                };

                return <div
                key={item.id}
                className={`project-plan-item ${item.kind} ${item.id === selectedItemId ? "selected" : ""} ${isWeekBound ? "week-bound" : ""} ${item.parentFrameId ? "bound-child" : ""} ${item.parentFrameId === selectedItemId || boundTexts.some((child) => child.id === selectedItemId) ? "relationship-active" : ""}`}
                style={{ left, top, width, height, "--plan-item-color": item.color, "--plan-font-size": `${fontSize}px` } as React.CSSProperties}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (readOnly) return;
                  onSelectItem(item.id);
                  syncFrameRange();
                  if (!(event.target as HTMLElement).closest(".project-plan-item-editor, .project-plan-resize, .project-plan-move-zone")) {
                    startPointerAction(event, item, "move", renderedGeometry);
                  }
                }}
              >
                {item.kind === "frame" ? (
                  <div className="project-plan-item-text project-plan-frame-label" onDoubleClick={(event) => { event.stopPropagation(); if (readOnly) return; const next = window.prompt("编辑虚线框文字", item.text); if (next !== null) onUpdateItem(item.id, { text: next }); }}>
                    {range ? (
                      <span className="frame-week-label-text">W{range.start.week}/{range.start.year}<i>→</i>W{range.end.week}/{range.end.year}</span>
                    ) : (
                      item.text
                    )}
                  </div>
                ) : (
                  <textarea className="project-plan-item-text project-plan-item-editor" value={item.text} readOnly={readOnly} onChange={(event) => !readOnly && onUpdateItem(item.id, { text: event.target.value })} onPointerDown={(event) => { if (!readOnly) onSelectItem(item.id); event.stopPropagation(); }} aria-label={readOnly ? "计划文字" : "编辑计划文字"} />
                )}
                {!readOnly && <span className="project-plan-move-zone" aria-hidden="true" onPointerDown={(event) => { syncFrameRange(); startPointerAction(event, item, "move", renderedGeometry); }} />}
                {!readOnly && <button className="project-plan-resize" aria-label="Resize item" onPointerDown={(event) => { syncFrameRange(); startPointerAction(event, item, "resize", renderedGeometry); }} />}
              </div>;
              })()
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
