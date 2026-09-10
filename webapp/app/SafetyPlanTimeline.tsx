"use client";

import { useEffect, useMemo, useState } from "react";

type MatrixVal = string | string[];

type UpstreamProject = {
  name: string;
  matrix: Record<string, MatrixVal>;
};

type UpstreamView = {
  iterations: string[];
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

const TIMELINE_START = new Date("2026-01-05T00:00:00");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOTAL_WEEKS = 156;

const SOP_COLORS = ["#e74c3c", "#e67e22", "#3498db", "#9b59b6", "#1abc9c", "#2ecc71", "#f39c12", "#e91e63"];

const HUT_DATA = [
  { sop: "2027-05", jv: "SVW", hut: "CMP21 CS A SUV MY27 VW316/9CS_B1 2ECV6H", cea: "CEA 2.0", cls: "carryover" },
  { sop: "2027-05", jv: "FAW", hut: "CMP21 CN A NB PHEV VW311/1CN_P 2EFV6H", cea: "CEA 2.0", cls: "newvar" },
  { sop: "2027-05", jv: "FAW", hut: "CMP21 CN A Main SUV BEV VW316/9CN_B 2EGV6H", cea: "CEA 2.0", cls: "newvar" },
  { sop: "2027-08", jv: "FAW", hut: "CMP21 CN A NB MY27 VW311/1CN_B1 2EF001", cea: "CEA 2.1", cls: "carryover" },
  { sop: "2027-08", jv: "SVW", hut: "CMP21 CS A SUV PHEV VW316/9CS_P 2EPV6K", cea: "CEA 2.2", cls: "newvar" },
  { sop: "2027-08", jv: "SVW", hut: "CSP31 CS B NB BEV VW423/1CS_B CS0V6K", cea: "CEA 2.1", cls: "allnew" },
  { sop: "2027-09", jv: "VWA", hut: "MEB31 CM A SUVe MY28 VW316/8CM_B1 11H001", cea: "CEA 2.0", cls: "carryover" },
  { sop: "2027-09", jv: "FAW", hut: "MEB31 CN ID4 PA MY28 VW316/6CN_B1 CN0001", cea: "CEA 2.1", cls: "carryover" },
  { sop: "2027-09", jv: "VWA", hut: "MEB31 CM A COSe MY28 VW313/2CM_B1 11M001", cea: "CEA 2.1", cls: "carryover" },
  { sop: "2027-10", jv: "FAW", hut: "CSP31 CN B SUV BEV 5S VW416/6CN_B CN5V6I", cea: "CEA 2.1", cls: "newvar" },
  { sop: "2027-10", jv: "SVW", hut: "CSP31 CS B NB EREV VW423/1CS_E CS0V6I", cea: "CEA 2.2", cls: "newvar" },
  { sop: "2027-11", jv: "FAW", hut: "CSP31 CN B SUV EREV 5S VW416/6CN_E CN5001", cea: "CEA 2.2", cls: "newvar" },
  { sop: "2028-01", jv: "SVW", hut: "CSP31 CS A+ SUV BEV VW326/6CS_B CS2V6E", cea: "CEA 2.3", cls: "allnew" },
  { sop: "2028-03", jv: "FAW", hut: "CSP31 CN B NB BEV VW423/1CN_B CN4V6E", cea: "CEA 2.3", cls: "newvar" },
  { sop: "2028-03", jv: "FAW", hut: "CSP31 CN B NB EREV VW423/1CN_E CN4V6F", cea: "CEA 2.4", cls: "newvar" },
  { sop: "2028-03", jv: "SVW", hut: "CSP31 CS A+ SUV EREV VW326/6CS_E CS2001", cea: "CEA 2.3", cls: "newvar" },
  { sop: "2028-10", jv: "FAW", hut: "CSP31 CN B SUV EREV 6S VW416/5CN_E CN2V6I", cea: "CEA 2.2", cls: "newvar" },
];

const FUSA_ROWS: { section: string; items: { name: string; desc: string }[] }[] = [
  {
    section: "System Level (14 Items)",
    items: [
      { name: "01 - Item Definition", desc: "ALL-NEW: full; VARIANT/CARRY-OVER: per IA" },
      { name: "02 - Impact Analysis", desc: "ALL-NEW: skip; VARIANT/CARRY-OVER: first" },
      { name: "03 - HARA", desc: "ALL-NEW: full; VARIANT: delta; CARRY-OVER: per IA" },
      { name: "04 - Safety Plan", desc: "Based on IA + HARA" },
      { name: "05 - FSC/TSC", desc: "After HARA" },
      { name: "06/07/08 - FMEA/FTA/DFA", desc: "After FSC/TSC" },
      { name: "09 - Integration & Test Strategy", desc: "After Safety Analysis" },
      { name: "10 - Integration & Test Case", desc: "After Strategy" },
      { name: "11 - Integration & Test Report", desc: "After VFF" },
      { name: "12 - Safety Validation Plan", desc: "Before validation" },
      { name: "13 - Safety Validation Report", desc: "After validation" },
      { name: "14 - Safety Case", desc: "Before 0S" },
    ],
  },
  {
    section: "GX / In-house Layer",
    items: [
      { name: "GX Safety Plan", desc: "Follows VCTC" },
      { name: "GX TSR/TSC/Design", desc: "Part 4" },
      { name: "GX HW Dev", desc: "Part 5" },
      { name: "GX SW Dev", desc: "Part 6" },
      { name: "GX Safety Case + Release", desc: "Consolidate" },
    ],
  },
  {
    section: "Supplier / BTV Layer",
    items: [
      { name: "DIA Signed", desc: "Prerequisite" },
      { name: "Supplier Safety Plan (3-1)", desc: "After DIA" },
      { name: "Supplier TSC (3-4)", desc: "After FSR" },
      { name: "Supplier Safety Analysis (3-5)", desc: "FMEA+FTA+DFA" },
      { name: "Supplier FMEDA (3-8)", desc: "After HW design" },
      { name: "Supplier Integration Test (3-6/3-7)", desc: "After integration" },
      { name: "Supplier Safety Case + Release (3-2/3-3)", desc: "Before BMG" },
      { name: "BMG Release", desc: "All prerequisites" },
    ],
  },
  {
    section: "Vehicle Release",
    items: [
      { name: "System Safety Case Consolidation", desc: "All layers -> system" },
      { name: "Vehicle Release", desc: "Per SOP node" },
    ],
  },
];

const PLATFORM_SHORT_NAMES: Record<string, string> = {
  "IPD Kick Off": "IPD Kick Off",
  "HW Baseline Freeze": "HW Baseline Freeze",
  "Function Dadian JIRA L3&PRD Freeze": "Func Dadian & PRD",
  "Specs &DBC Requirement Freeze": "Specs & DBC Req Freeze",
  "K-Matrix Release &SysRS Freeze": "K-Matrix & SysRS",
  "DI Start": "DI Start",
  "PI HW TBT": "PI HW TBT",
  "PI Start (1st SW Submit)": "PI Start (1st SW)",
  "IPD Platform Release Time": "IPD Release",
};

function weekIndex(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const diff = d.getTime() - TIMELINE_START.getTime();
  return Math.floor(diff / WEEK_MS);
}

function dayOffsetInWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay() || 7;
  return (dayOfWeek - 1) / 7;
}

function shortDate(s: string): string {
  const parts = s.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : s;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

type WeekCell = { year: number; month: number; week: number; isMonthStart: boolean };
type Milestone = { date: string; label: string; color: string };

function buildWeeks(): WeekCell[] {
  const weeks: WeekCell[] = [];
  const cur = new Date(TIMELINE_START);
  let prevMonth = -1;
  for (let i = 0; i < TOTAL_WEEKS; i++) {
    const thursday = new Date(cur);
    thursday.setDate(cur.getDate() + 3);
    const m = thursday.getMonth() + 1;
    const isMonthStart = m !== prevMonth;
    weeks.push({ year: thursday.getFullYear(), month: m, week: getISOWeek(cur), isMonthStart });
    prevMonth = m;
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

const years = [2026, 2027, 2028];

function findHutView(jv: string, data: SafetyPlanData): UpstreamView | null {
  const map: Record<string, string> = { FAW: "FAW", SVW: "SVW", VWA: "VWA" };
  const name = map[jv];
  return data.upstreamPlan?.views?.[name] || null;
}

function findHutMilestones(hut: typeof HUT_DATA[0], data: SafetyPlanData): Milestone[] {
  const view = findHutView(hut.jv, data);
  if (!view) return [];
  const proj = view.projects.find((p) => p.name === hut.hut);
  if (!proj) return [];
  const result: Milestone[] = [];
  const color = hut.cls === "allnew" ? "#e74c3c" : hut.cls === "newvar" ? "#e67e22" : "#3498db";
  for (const [iter, val] of Object.entries(proj.matrix)) {
    if (!iter) continue;
    const dates = Array.isArray(val) ? val : [val];
    for (const d of dates) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      result.push({ date: d, label: iter, color });
    }
  }
  return result;
}

function findPlatformMilestones(projName: string, data: SafetyPlanData): Milestone[] {
  const view = data.upstreamPlan?.views?.["CEA 2.X Platform"];
  if (!view) return [];
  const proj = view.projects.find((p) => p.name === projName);
  if (!proj) return [];
  const result: Milestone[] = [];
  for (const [iter, val] of Object.entries(proj.matrix)) {
    const dates = Array.isArray(val) ? val : [val];
    for (const d of dates) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      result.push({ date: d, label: iter, color: "#002733" });
    }
  }
  return result;
}

const clsLabel: Record<string, string> = { allnew: "ALL-NEW", newvar: "NEW VARIANT", carryover: "CARRY-OVER" };
const clsClass: Record<string, string> = { allnew: "ct-an", newvar: "ct-nv", carryover: "ct-co" };
const jvClass: Record<string, string> = { FAW: "j-faw", SVW: "j-svw", VWA: "j-vwa" };

const SOP_GROUPS = (() => {
  const groups: Record<string, typeof HUT_DATA> = {};
  for (const h of HUT_DATA) {
    if (!groups[h.sop]) groups[h.sop] = [];
    groups[h.sop].push(h);
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
})();

const todayWeekIdx = (() => {
  const now = new Date();
  if (now < TIMELINE_START) return -1;
  const idx = weekIndex(now.toISOString().slice(0, 10));
  return idx >= 0 && idx < TOTAL_WEEKS ? idx : -1;
})();

export function SafetyPlanTimeline() {
  const [data, setData] = useState<SafetyPlanData | null>(null);
  const [error, setError] = useState("");

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
      } catch {}
      try {
        if (!parsed) {
          const res = await fetch("/safety-plan/data.json");
          if (res.ok) parsed = await res.json();
        }
      } catch {}
      if (cancelled) return;
      if (parsed?.upstreamPlan) setData(parsed);
      else setError("Safety Plan 数据加载失败");
    })();
    return () => { cancelled = true; };
  }, []);

  const weeks = useMemo(() => buildWeeks(), []);

  const platformRows = useMemo(() => {
    if (!data) return [];
    const view = data.upstreamPlan?.views?.["CEA 2.X Platform"];
    if (!view) return [];
    return view.projects.map((p) => ({
      name: PLATFORM_SHORT_NAMES[p.name] || p.name,
      milestones: findPlatformMilestones(p.name, data),
    }));
  }, [data]);

  const sopHutRows = useMemo(() => {
    if (!data) return [];
    return SOP_GROUPS.map(([sop, huts]) => ({
      sop,
      hutCount: huts.length,
      color: SOP_COLORS[0],
      huts: huts.map((h) => ({
        ...h,
        milestones: findHutMilestones(h, data),
      })),
    }));
  }, [data]);

  if (error) return <div className="sptl-empty"><p>{error}</p></div>;
  if (!data) return <div className="sptl-empty"><p>加载 Safety Plan 数据…</p></div>;

  const totalMs = platformRows.reduce((s, r) => s + r.milestones.length, 0) + sopHutRows.reduce((s, g) => s + g.huts.reduce((s2, h) => s2 + h.milestones.length, 0), 0);

  return (
    <div className="sptl-wrap">
      <div className="sptl-title">CEA 2.X Safety Plan Timeline</div>
      <div className="sptl-sub">17 Huts | 8 SOP Nodes | Weekly Calendar 2026-01-05 ~ 2028-12-25 | 156 weeks</div>
      <div className="sptl-stats">
        <div className="sptl-sc"><span className="n">17</span><span className="l">Huts</span></div>
        <div className="sptl-sc" style={{ borderBottomColor: "#e74c3c" }}><span className="n" style={{ color: "#e74c3c" }}>2</span><span className="l">All-New</span></div>
        <div className="sptl-sc" style={{ borderBottomColor: "#e67e22" }}><span className="n" style={{ color: "#e67e22" }}>10</span><span className="l">New Variant</span></div>
        <div className="sptl-sc" style={{ borderBottomColor: "#3498db" }}><span className="n" style={{ color: "#3498db" }}>5</span><span className="l">Carry-Over</span></div>
        <div className="sptl-sc"><span className="n">8</span><span className="l">SOP Nodes</span></div>
        <div className="sptl-sc"><span className="n">{totalMs}</span><span className="l">Milestones</span></div>
      </div>
      <div className="sptl-gbox">
        <div className="sptl-twrap">
          <table className="sptl-g">
            <thead>
              <tr>
                <th className="rn" rowSpan={2}>Project / Hut</th>
                {years.map((y) => <th key={y} className="yr" colSpan={52}>{y}</th>)}
              </tr>
              <tr>
                {weeks.map((w, i) => (
                  <th key={i} className={`wk${w.isMonthStart ? " m" : ""}`}>{w.isMonthStart ? w.month : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platformRows.map((row) => (
                <tr key={row.name}>
                  <td className="rn">{row.name}</td>
                  {weeks.map((_, wi) => {
                    const ms = row.milestones.filter((m) => weekIndex(m.date) === wi);
                    return (
                      <td key={wi} className={weeks[wi].isMonthStart ? "month-border" : ""} style={{ position: "relative" }}>
                        {ms.map((m, mi) => {
                          const off = dayOffsetInWeek(m.date);
                          return (
                            <div key={mi} className="ms" style={{ left: `${off * 100}%` }}>
                              <div className="tri" style={{ borderBottomColor: m.color }} />
                              <div className="dl">{shortDate(m.date)}</div>
                              <div className="il">{m.label}</div>
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr className="sep-row"><td className="rn">=== HUTS BY SOP ===</td>{weeks.map((_, i) => <td key={i} />)}</tr>

              {sopHutRows.map((group, gi) => {
                const color = SOP_COLORS[gi % SOP_COLORS.length];
                return (
                  <SopGroup key={group.sop} group={group} color={color} weeks={weeks} />
                );
              })}

              <tr className="fusa-sep"><td className="rn">=== FUSA ACTIVITY MAPPING (TO BE FILLED) ===</td>{weeks.map((_, i) => <td key={i} />)}</tr>

              {FUSA_ROWS.map((section) => (
                <FusaSection key={section.section} section={section} weeks={weeks} />
              ))}
            </tbody>
          </table>
          {todayWeekIdx >= 0 && (
            <>
              <div className="today-line" style={{ left: `calc(200px + ${todayWeekIdx * 18 + 9}px)` }} />
              <div className="today-label" style={{ left: `calc(200px + ${todayWeekIdx * 18 + 9}px)` }}>Today</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type HutRow = { sop: string; jv: string; hut: string; cea: string; cls: string; milestones: Milestone[] };

function SopGroup({ group, color, weeks }: { group: { sop: string; hutCount: number; huts: HutRow[] }; color: string; weeks: WeekCell[] }) {
  return (
    <>
      <tr className="sop-head">
        <td className="rn">
          <span className="sop-badge" style={{ background: color }}>SOP {group.sop} ({group.hutCount} Huts)</span>
        </td>
        {weeks.map((_, i) => <td key={i} />)}
      </tr>
      {group.huts.map((h) => (
        <tr key={h.hut}>
          <td className="rn" style={{ fontSize: "10px" }}>
            <span className={`jtag ${jvClass[h.jv] || ""}`}>{h.jv}</span>
            <span className={`ctag ${clsClass[h.cls] || ""}`}>{clsLabel[h.cls] || ""}</span>
            {h.hut}
            <div className="rsub">SOP {h.sop} | {h.cea}</div>
          </td>
          {weeks.map((_, wi) => {
            const ms = (h.milestones as Milestone[]).filter((m) => weekIndex(m.date) === wi);
            const isSopBar = wi < TOTAL_WEEKS;
            return (
              <td key={wi} className={weeks[wi].isMonthStart ? "month-border" : ""} style={{ position: "relative" }}>
                {isSopBar && <div className="sop-bar" style={{ background: color }} />}
                {ms.map((m, mi) => {
                  const off = dayOffsetInWeek(m.date);
                  return (
                    <div key={mi} className="ms" style={{ left: `${off * 100}%` }}>
                      <div className="tri" style={{ borderBottomColor: m.color }} />
                      <div className="dl">{shortDate(m.date)}</div>
                      <div className="il">{m.label}</div>
                    </div>
                  );
                })}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function FusaSection({ section, weeks }: { section: { section: string; items: { name: string; desc: string }[] }; weeks: WeekCell[] }) {
  return (
    <>
      <tr className="fusa-sep">
        <td className="rn">--- {section.section} ---</td>
        {weeks.map((_, i) => <td key={i} />)}
      </tr>
      {section.items.map((item) => (
        <tr key={item.name} className="fusa-row">
          <td className="rn" style={{ fontSize: "9px" }}>
            {item.name}
            <span className="fph"> {item.desc}</span>
          </td>
          {weeks.map((_, i) => <td key={i} />)}
        </tr>
      ))}
    </>
  );
}
