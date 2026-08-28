"use client";

import { Fragment, useMemo, useState } from "react";
import type { Milestone, Project, View } from "./types";

type VersionRow = {
  key: string;
  name: string;
  tag: string;
  milestones: (Milestone & { _sourceProject: string })[];
};

type GroupDef = {
  id: string;
  label: string;
  icon: string;
  rows: VersionRow[];
};

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

function shapeClass(shape: string | undefined): string {
  if (!shape) return "shape-diamond";
  const s = shape.toLowerCase();
  if (s.includes("diamond")) return "shape-diamond";
  if (s.includes("triangle")) return "shape-triangle";
  if (s.includes("circle")) return "shape-circle";
  if (s.includes("flag")) return "shape-flag";
  if (s.includes("cross")) return "shape-cross";
  return "shape-diamond";
}

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
}

export function CeaVersionView({
  view: _view,
  projects,
  onMilestoneClick: _onMilestoneClick,
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

  const groups = useMemo<GroupDef[]>(() => {
    const map = new Map<string, VersionRow>();

    for (const project of projects) {
      for (const ms of project.milestones) {
        const key = normKey(ms.iteration);
        let row = map.get(key);
        if (!row) {
          row = {
            key,
            name: displayKey(key),
            tag: GROUP_DEFS.find((g) => g.id === groupId(key))?.label || "其他",
            milestones: [],
          };
          map.set(key, row);
        }
        row.milestones.push({ ...ms, _sourceProject: project.name });
      }
    }

    const allRows = [...map.values()].sort((a, b) => rawSort(a.key) - rawSort(b.key));
    return GROUP_DEFS.map((gd) => ({
      ...gd,
      rows: allRows.filter((r) => groupId(r.key) === gd.id),
    })).filter((g) => g.rows.length > 0);
  }, [projects]);

  const totalVersions = useMemo(() => groups.reduce((s, g) => s + g.rows.length, 0), [groups]);

  if (!totalVersions) {
    return (
      <div className="cea-version-empty">
        <p>当前视图没有里程碑数据。</p>
      </div>
    );
  }

  return (
    <section className="cea-version-view">
      <div className="cea-version-toolbar">
        <span className="cea-version-count">{totalVersions} 个版本 · {groups.length} 个分组</span>
      </div>
      <div className="cea-version-table-wrap">
        <table className="raw-table cea-version-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>版本</th>
              <th style={{ width: "10%" }}>日期</th>
              <th style={{ width: "14%" }}>来源项目</th>
              <th style={{ width: "9%" }}>周次</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const isCollapsed = collapsed[group.id];
              const colors = GROUP_COLORS[group.id] || GROUP_COLORS.other;
              const dates = group.rows.flatMap((r) => r.milestones.map((m) => m.releaseDate).filter(Boolean));
              const minDate = dates.length ? dates.sort()[0] : "";
              const maxDate = dates.length ? dates.sort()[dates.length - 1] : "";
              const msCount = group.rows.reduce((s, r) => s + r.milestones.length, 0);

              return (
                <Fragment key={group.id}>
                  <tr
                    className="cea-group-header"
                    style={{ background: colors.bg, color: colors.text }}
                    onClick={() => setCollapsed((p) => ({ ...p, [group.id]: !p[group.id] }))}
                  >
                    <td colSpan={5}>
                      <span className="cea-group-icon">{group.icon}</span>
                      <span className="cea-group-label">{group.label}</span>
                      <span className="cea-group-meta">
                        {group.rows.length} 版本 · {msCount} 里程碑
                        {minDate && ` · ${fmtDate(minDate)} ~ ${fmtDate(maxDate)}`}
                      </span>
                      <span className={`cea-chevron ${isCollapsed ? "collapsed" : ""}`}>▼</span>
                    </td>
                  </tr>
                  {!isCollapsed && group.rows.map((row) =>
                    row.milestones.length === 1 ? (
                      <tr key={row.key} className="cea-version-row">
                        <td>
                          <span className={`grid-marker-shape ${shapeClass(row.milestones[0].shape)}`} style={{ background: row.milestones[0].color }} />
                          <span className="cea-version-name">{row.name}</span>
                        </td>
                        <td>{fmtDate(row.milestones[0].releaseDate)}</td>
                        <td>{row.milestones[0]._sourceProject}</td>
                        <td className="mono">{row.milestones[0].remark || "—"}</td>
                        <td>{row.milestones[0].detailRemark || "—"}</td>
                      </tr>
                    ) : (
                      row.milestones.map((ms, i) => (
                        <tr key={`${row.key}_${i}`} className="cea-version-row">
                          <td>
                            {i === 0 && <span className="cea-version-name cea-version-name-bold">{row.name}</span>}
                            <span className={`grid-marker-shape ${shapeClass(ms.shape)}`} style={{ background: ms.color }} />
                          </td>
                          <td>{fmtDate(ms.releaseDate)}</td>
                          <td>{ms._sourceProject}</td>
                          <td className="mono">{ms.remark || "—"}</td>
                          <td>{ms.detailRemark || "—"}</td>
                        </tr>
                      ))
                    ),
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}


