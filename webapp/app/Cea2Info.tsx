"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CEA2_VEHICLES = [
  { code: "VW316/9CS_B1 2ECV6H", shortCode: "VW316/9CS_B1", name: "CMP21 CS A SUV MY27", changeLevel: "Facelift", role: "Leading", oem: "SVW", sopDate: "2027-06-18", prev: "CEA 1.3 → 1.4", cls: "carryover", desc: "2026 first ALS1(1.3) to ALS2(1.4) to MY27 upgrade CEA2.0" },
  { code: "VW316/8CM_B1 11H001", shortCode: "VW316/8CM_B1", name: "MEB31 CM A SUVe MY28", changeLevel: "Facelift", role: "Leading", oem: "VWA", sopDate: "2027-06-18", prev: "CEA 1.3 (from 1.0 ACOSe)", cls: "carryover", desc: "2026 first ALS1(1.3) to MY28 upgrade CEA2.0" },
  { code: "VW316/9CN_B 2EGV6H", shortCode: "VW316/9CN_B", name: "CMP21 CN A Main SUV BEV", changeLevel: "TBD", role: "Derivative", oem: "FAW", sopDate: "2027-07-30", prev: "-", cls: "newvar", desc: "FAW CMP21 Main SUV, new JV variant" },
  { code: "VW311/1CN_P 2EFV6H", shortCode: "VW311/1CN_P", name: "CMP21 CN A NB PHEV", changeLevel: "New Variant", role: "Leading", oem: "FAW", sopDate: "2027-09-03", prev: "-", cls: "newvar", desc: "New powertrain PHEV, CMP21 platform first PHEV" },
];

const CEA2_PGS = ["CMP21 BEV", "CMP21 PHEV", "MEB31 BEV"];

const CLS_TAG: Record<string, { label: string; color: string }> = {
  carryover: { label: "CARRY-OVER", color: "#238636" },
  newvar: { label: "NEW VARIANT", color: "#d29922" },
  allnew: { label: "ALL-NEW", color: "#da3633" },
};

const JV_COLOR: Record<string, string> = { SVW: "#1f6feb", FAW: "#238636", VWA: "#8957e5" };

const STATUS_CYCLE = ["", "planned", "progress", "done", "na"];

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  "": { label: "To Do", bg: "rgba(218,54,51,.12)", color: "#f85149" },
  planned: { label: "Planned", bg: "rgba(210,153,34,.12)", color: "#d29922" },
  progress: { label: "In Progress", bg: "rgba(31,111,235,.12)", color: "#58a6ff" },
  done: { label: "Done", bg: "rgba(35,134,54,.12)", color: "#3fb950" },
  na: { label: "N/A", bg: "rgba(139,148,158,.1)", color: "#8b949e" },
};

const TAILORING_CYCLE = ["Applicable", "Carry-over", "N/A", "Delta"];

const TAILORING_META: Record<string, { label: string; bg: string; color: string }> = {
  "Applicable": { label: "Applicable", bg: "rgba(35,134,54,.15)", color: "#3fb950" },
  "Carry-over": { label: "Carry-over", bg: "rgba(31,111,235,.15)", color: "#58a6ff" },
  "N/A": { label: "N/A", bg: "rgba(139,148,158,.12)", color: "#8b949e" },
  "Delta": { label: "Delta", bg: "rgba(210,153,34,.15)", color: "#d29922" },
};

const API = "/api/safety-plan?token=123456";

type Cea2Deliverable = {
  no: string;
  activity: string;
  deliverable: string;
  level: string;
  annex: string;
  isoRef: string;
  owner: string;
};

type Cea2Phase = {
  name: string;
  items: Cea2Deliverable[];
};

const CEA2_DELIVERABLES: Cea2Phase[] = [
  {
    name: "Phase 1: FuSa Initialize (ISO 26262 Part 2 & 3)",
    items: [
      { no: "1.1", activity: "Item Definition", deliverable: "Item Definition", level: "Vehicle Item Level", annex: "Annex_09", isoRef: "ISO 26262-3, 5.5.1", owner: "VFSM" },
      { no: "1.2", activity: "Item Definition", deliverable: "Checklist — Item Definition", level: "Vehicle Item Level", annex: "Annex_78", isoRef: "ISO 26262-3", owner: "VFSM" },
      { no: "1.3", activity: "Impact Analysis", deliverable: "Impact Analysis Report (Item level)", level: "Vehicle Item Level", annex: "Annex_01", isoRef: "ISO 26262-2, 6.5.3", owner: "VFSM" },
      { no: "1.4", activity: "Impact Analysis", deliverable: "I3 Confirmation Review Proof of Impact Analysis", level: "Vehicle Item Level", annex: "-", isoRef: "ISO 26262-2", owner: "VFSM" },
      { no: "1.5", activity: "FuSa Audit", deliverable: "FuSa Audit Checklist & Report", level: "Vehicle Item Level", annex: "Annex_05", isoRef: "ISO 26262-2, 6.4.9", owner: "VFSM" },
      { no: "1.6", activity: "FuSa Assessment", deliverable: "FuSa Assessment Checklist & Report", level: "Vehicle Item Level", annex: "Annex_06", isoRef: "ISO 26262-2, 6.4.9", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 2: Concept Development (ISO 26262 Part 2 & 3)",
    items: [
      { no: "2.1", activity: "Safety Plan", deliverable: "Safety Plan (this document)", level: "Vehicle Item Level", annex: "Annex_03", isoRef: "ISO 26262-2, 6.5.3", owner: "VFSM" },
      { no: "2.2", activity: "Safety Plan", deliverable: "I3 Confirmation Review Proof of Safety Plan", level: "Vehicle Item Level", annex: "-", isoRef: "ISO 26262-2", owner: "VFSM" },
      { no: "2.3", activity: "HARA", deliverable: "Hazard Analysis & Risk Assessment (HARA)", level: "Vehicle Item Level", annex: "Annex_10", isoRef: "ISO 26262-3, 6.5.2", owner: "VFSM" },
      { no: "2.4", activity: "HARA", deliverable: "Checklist — HARA", level: "Vehicle Item Level", annex: "Annex_79", isoRef: "ISO 26262-3", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 3: System Development (ISO 26262 Part 3 & 4)",
    items: [
      { no: "3.1", activity: "FSC/FSR", deliverable: "Functional Safety Concept (System Concept Report)", level: "Product Group Level", annex: "Annex_11", isoRef: "ISO 26262-3, 7.5.1", owner: "VFSM" },
      { no: "3.2", activity: "FSC/FSR", deliverable: "Checklist — Functional Safety Concept", level: "Product Group Level", annex: "Annex_80", isoRef: "ISO 26262-3", owner: "VFSM" },
      { no: "3.7", activity: "System FMEA", deliverable: "System Safety FMEA", level: "Product Group Level", annex: "Annex_17", isoRef: "ISO 26262-4, 6.5.7", owner: "Domain" },
      { no: "3.8", activity: "System FMEA", deliverable: "Checklist — System FMEA", level: "Product Group Level", annex: "Annex_85", isoRef: "ISO 26262-4", owner: "Domain" },
      { no: "3.9", activity: "System FTA", deliverable: "System Safety FTA Report", level: "Product Group Level", annex: "Annex_19", isoRef: "ISO 26262-4, 6.5.7", owner: "Domain" },
      { no: "3.10", activity: "System FTA", deliverable: "Checklist — System FTA", level: "Product Group Level", annex: "Annex_87", isoRef: "ISO 26262-4", owner: "Domain" },
      { no: "3.11", activity: "DFA", deliverable: "Dependent Failure Analysis (DFA)", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4", owner: "Domain" },
    ],
  },
  {
    name: "Phase 4: Safety Validation (ISO 26262 Part 4)",
    items: [
      { no: "4.1", activity: "Integration & Test Strategy", deliverable: "HW/SW Integration Test Plan", level: "Product Group Level", annex: "Annex_20", isoRef: "ISO 26262-4, 7.4.2", owner: "Domain" },
      { no: "4.2", activity: "Integration & Test Strategy", deliverable: "Checklist — HW/SW Integration Test", level: "Product Group Level", annex: "Annex_88", isoRef: "ISO 26262-4", owner: "Domain" },
      { no: "4.3", activity: "Integration & Test Case", deliverable: "System Integration Test Specification", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4, 7.4.3", owner: "Domain" },
      { no: "4.4", activity: "Integration & Test Report", deliverable: "System Integration Test Report", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4, 7.4.3", owner: "Domain" },
      { no: "4.5", activity: "Integration & Test Report", deliverable: "Review Protocol of System Integration Test Report", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4", owner: "Domain" },
      { no: "4.6", activity: "Safety Validation Plan", deliverable: "System Validation Plan", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4, 8.4.3", owner: "VFSM" },
      { no: "4.7", activity: "Safety Validation Plan", deliverable: "Review Protocol of Validation Plan", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4", owner: "VFSM" },
      { no: "4.8", activity: "Safety Validation Plan", deliverable: "System Validation Test Specification", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4, 8.4.3", owner: "VFSM" },
      { no: "4.9", activity: "Safety Validation Report", deliverable: "Validation Report", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4, 8.4.4", owner: "VFSM" },
      { no: "4.10", activity: "Safety Validation Report", deliverable: "Review Protocol of Validation Report", level: "Product Group Level", annex: "-", isoRef: "ISO 26262-4", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 5: Release (ISO 26262 Part 4)",
    items: [
      { no: "5.1", activity: "Release", deliverable: "System Release Report", level: "Vehicle Item Level", annex: "-", isoRef: "ISO 26262-4", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 6: Safety Case (ISO 26262 Part 2)",
    items: [
      { no: "6.1", activity: "Safety Case", deliverable: "Vehicle-level Safety Case", level: "Vehicle Item Level", annex: "Annex_04", isoRef: "ISO 26262-2, 6.5.4", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 7: Supplier Management Track — Parallel (ISO 26262 Part 8)",
    items: [
      { no: "7.1", activity: "Supplier Inspection", deliverable: "Supplier Review Report", level: "Vehicle Item Level", annex: "Annex_59", isoRef: "ISO 26262-8, 5.5.2", owner: "VFSM" },
      { no: "7.2", activity: "Supplier Safety Case", deliverable: "Supplier Safety Case Collection & Assessment", level: "Vehicle Item Level", annex: "Annex_04", isoRef: "ISO 26262-8, 5.5.4", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 8: I3 Confirmation Review Track — Parallel (ISO 26262 Part 2)",
    items: [
      { no: "8.1", activity: "I3 CR Overview", deliverable: "I3 Confirmation Review Status Overview (tracked across all phases)", level: "Vehicle Item Level", annex: "-", isoRef: "ISO 26262-2", owner: "VFSM" },
    ],
  },
  {
    name: "Phase 4A: Component Dev — In-house / System Level (ISO 26262 Part 4)",
    items: [
      { no: "4A.1", activity: "System Design", deliverable: "System Design Specification", level: "Product Group Level", annex: "Annex_14", isoRef: "ISO 26262-4, 6.5.3", owner: "Domain" },
      { no: "4A.2", activity: "System Design", deliverable: "Hardware/Software Interface Specification", level: "Product Group Level", annex: "Annex_15", isoRef: "ISO 26262-4, 6.5.4", owner: "Domain" },
      { no: "4A.3", activity: "System Design", deliverable: "Checklist — HW/SW Interface", level: "Product Group Level", annex: "Annex_84", isoRef: "ISO 26262-4", owner: "Domain" },
      { no: "4A.4", activity: "System Integration", deliverable: "System Integration & Test Strategy", level: "Product Group Level", annex: "Annex_24", isoRef: "ISO 26262-4, 7.4.3", owner: "Domain" },
      { no: "4A.5", activity: "System Integration", deliverable: "System Integration Test Case & Report", level: "Product Group Level", annex: "Annex_25", isoRef: "ISO 26262-4, 7.4.3", owner: "Domain" },
      { no: "4A.6", activity: "System Integration", deliverable: "Checklist — System Integration Test (System)", level: "Product Group Level", annex: "Annex_89", isoRef: "ISO 26262-4", owner: "Domain" },
      { no: "4A.7", activity: "System Integration", deliverable: "Checklist — System Integration Test (Vehicle)", level: "Product Group Level", annex: "Annex_90", isoRef: "ISO 26262-4", owner: "Domain" },
    ],
  },
  {
    name: "Phase 5S: Supplier Deliverables (ISO 26262 Part 8)",
    items: [
      { no: "5S.1", activity: "Supplier Interface", deliverable: "Development Interface Agreement (DIA)", level: "<Supplier 1>", annex: "Annex_58", isoRef: "ISO 26262-8, 5.5.1", owner: "VFSM" },
      { no: "5S.2", activity: "Supplier Safety Case", deliverable: "Supplier Safety Case", level: "<Supplier 1>", annex: "Annex_04", isoRef: "ISO 26262-8, 5.5.4", owner: "Supplier" },
      { no: "5S.3", activity: "Supplier Deliverables", deliverable: "Supplier Safety Plan", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-2, 6.5.3", owner: "Supplier" },
      { no: "5S.4", activity: "Supplier Deliverables", deliverable: "Supplier Release Report", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-2, 6.5.6", owner: "Supplier" },
      { no: "5S.5", activity: "Supplier Deliverables", deliverable: "Supplier Technical Safety Concept", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-4, 6.5.2", owner: "Supplier" },
      { no: "5S.6", activity: "Supplier Deliverables", deliverable: "Safety Analysis Summary Report (FTA / FMEA / DFA)", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-4, 6.5.7", owner: "Supplier" },
      { no: "5S.7", activity: "Supplier Deliverables", deliverable: "HW/SW Integration & Test Report", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-4, 7.5.2", owner: "Supplier" },
      { no: "5S.8", activity: "Supplier Deliverables", deliverable: "System Integration & Test Report", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-4, 7.5.2", owner: "Supplier" },
      { no: "5S.9", activity: "Supplier Deliverables", deliverable: "FMEDA Summary Report", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-5, 8.5.1", owner: "Supplier" },
      { no: "5S.10", activity: "Supplier Deliverables", deliverable: "Production/Operation/Service/Decommissioning Requirements", level: "<Supplier 1>", annex: "-", isoRef: "ISO 26262-7, 5.5", owner: "Supplier" },
    ],
  },
];

function getTailoringPreset(item: Cea2Deliverable, cls: string): string {
  if (cls === "carryover") {
    if (item.activity.includes("Item Definition") || item.deliverable.includes("Checklist — Item Definition")) return "Carry-over";
    if (item.activity.includes("Impact Analysis") || item.deliverable.includes("I3 Confirmation Review Proof of Impact Analysis")) return "Carry-over";
    if (item.activity.includes("FuSa Audit") || item.activity.includes("FuSa Assessment")) return "Carry-over";
    if (item.activity.includes("DFA")) return "Carry-over";
    if (item.deliverable.includes("Checklist — Functional Safety Concept")) return "Carry-over";
    if (item.deliverable.includes("Checklist — HW/SW Interface") || item.deliverable.includes("Checklist — System Integration")) return "Carry-over";
    if (item.activity.includes("HARA") || item.deliverable.includes("Checklist — HARA")) return "Delta";
    if (item.activity.includes("FSC/FSR") || item.deliverable.includes("Functional Safety Concept")) return "Delta";
    if (item.activity.includes("System FMEA") || item.deliverable.includes("Checklist — System FMEA")) return "Delta";
    if (item.activity.includes("System FTA") || item.deliverable.includes("Checklist — System FTA")) return "Delta";
    if (item.activity.includes("Integration & Test Strategy") || item.deliverable.includes("Checklist — HW/SW Integration")) return "Delta";
    if (item.activity.includes("System Design")) return "Delta";
    if (item.activity.includes("System Integration") && !item.deliverable.includes("Checklist")) return "Delta";
    return "Applicable";
  }
  return "Applicable";
}

type SpEntry = {
  statuses: Record<string, string>;
  remarks: Record<string, string>;
  links?: Record<string, string>;
  plannedDates?: Record<string, string>;
  actualDates?: Record<string, string>;
  tailoring?: Record<string, string>;
};

type DataJson = {
  productGroups: Array<{ name: string; platform: string; powertrain: string; leading: string; derivatives: string[] }>;
  impactAnalysis: Array<{ pg: string; classification: string; ref: string; refCar: string; rationale: string }>;
  pepComparison: Array<{ type: string; scope: string; duration: string; status: string }>;
  pepCeaMilestones: Array<{ name: string; week: number; month: number; desc: string }>;
  ceaKeyMilestones: Array<{ name: string; week: number; desc: string; fnLevel?: string; isFreeze?: boolean; isHomoFreeze?: boolean }>;
  safetyPepMapping: Array<{ safetyPhase: string; safetyActivity: string; pepMilestone: string; pepWeek: number; startWeek: number; endWeek: number; notes: string }>;
  safetyPlanPerProject?: Record<string, SpEntry>;
};

export function Cea2Info() {
  const [data, setData] = useState<DataJson | null>(null);
  const [tab, setTab] = useState<"huts" | "deliverables" | "timeline">("huts");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<DataJson | null>(null);
  dataRef.current = data;

  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.data) {
          setData(payload.data);
        } else {
          fetch("/safety-plan/data.json").then((r) => r.json()).then(setData);
        }
      })
      .catch(() => {
        fetch("/safety-plan/data.json").then((r) => r.json()).then(setData);
      });
  }, []);

  const autoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const current = dataRef.current;
      if (!current) return;
      try {
        await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: current }) });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("idle");
      }
    }, 800);
  }, []);

  const mutateEntry = useCallback((vehicleCode: string, fn: (e: SpEntry) => SpEntry) => {
    setData((prev) => {
      if (!prev) return prev;
      const spp = { ...(prev.safetyPlanPerProject || {}) };
      const old = spp[vehicleCode] || { statuses: {}, remarks: {} };
      spp[vehicleCode] = fn({ ...old, statuses: { ...old.statuses }, remarks: { ...old.remarks }, links: { ...(old.links || {}) }, plannedDates: { ...(old.plannedDates || {}) }, actualDates: { ...(old.actualDates || {}) }, tailoring: { ...(old.tailoring || {}) } });
      return { ...prev, safetyPlanPerProject: spp };
    });
    autoSave();
  }, [autoSave]);

  const updateStatus = useCallback((vc: string, key: string, val: string) => mutateEntry(vc, (e) => { e.statuses[key] = val; return e; }), [mutateEntry]);
  const updateRemark = useCallback((vc: string, key: string, val: string) => mutateEntry(vc, (e) => { e.remarks[key] = val; return e; }), [mutateEntry]);
  const updateLink = useCallback((vc: string, key: string, val: string) => mutateEntry(vc, (e) => { e.links = e.links || {}; e.links[key] = val; return e; }), [mutateEntry]);
  const updateDate = useCallback((vc: string, key: string, field: "plannedDates" | "actualDates", val: string) => mutateEntry(vc, (e) => { e[field] = e[field] || {}; e[field][key] = val; return e; }), [mutateEntry]);
  const updateTailoring = useCallback((vc: string, key: string, val: string) => mutateEntry(vc, (e) => {
    e.tailoring = e.tailoring || {};
    e.tailoring[key] = val;
    e.statuses = e.statuses || {};
    if (val === "Carry-over") {
      e.statuses[key] = "done";
    } else if (val === "N/A") {
      e.statuses[key] = "na";
    } else if (val === "Applicable" || val === "Delta") {
      if (e.statuses[key] === "done" || e.statuses[key] === "na") {
        e.statuses[key] = "";
      }
    }
    return e;
  }), [mutateEntry]);

  const cea2Impact = useMemo(() => (data?.impactAnalysis || []).filter((ia) => CEA2_PGS.includes(ia.pg)), [data]);
  const cea2PGs = useMemo(() => (data?.productGroups || []).filter((pg) => CEA2_PGS.includes(pg.name)), [data]);
  const cea2Milestones = useMemo(() => (data?.ceaKeyMilestones || []).filter((m) => m.week <= -22 || m.name === "SOP"), [data]);

  if (!data) return <div style={{ padding: 40, color: "#8b949e" }}>Loading CEA 2.0 data…</div>;

  const tabs: Array<{ key: typeof tab; label: string; icon: string }> = [
    { key: "huts", label: "HUT 清单", icon: "📋" },
    { key: "deliverables", label: "交付物", icon: "📄" },
    { key: "timeline", label: "时间线", icon: "📅" },
  ];

  return (
    <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #30363d", padding: "0 16px", flexShrink: 0 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ background: "none", border: "none", borderBottom: tab === t.key ? "2px solid #58a6ff" : "2px solid transparent", color: tab === t.key ? "#58a6ff" : "#8b949e", padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 12, color: saveStatus === "saving" ? "#d29922" : saveStatus === "saved" ? "#3fb950" : "#484f58" }}>
          {saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "已保存" : ""}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {tab === "huts" && <HutTab vehicles={CEA2_VEHICLES} pgs={cea2PGs} impacts={cea2Impact} pepComparison={data.pepComparison} />}
        {tab === "deliverables" && (
          <DeliverablesTab spData={data.safetyPlanPerProject || {}} onStatusChange={updateStatus} onRemarkChange={updateRemark} onLinkChange={updateLink} onDateChange={updateDate} onTailoringChange={updateTailoring} />
        )}
        {tab === "timeline" && <TimelineTab milestones={cea2Milestones} pepCeaMilestones={data.pepCeaMilestones} mapping={data.safetyPepMapping} />}
      </div>
    </div>
  );
}

function StatusBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  const meta = STATUS_META[status] || STATUS_META[""];
  return (
    <span onClick={onClick} style={{ display: "inline-block", background: meta.bg, color: meta.color, padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: onClick ? "pointer" : "default" }}>
      {meta.label}
    </span>
  );
}

function EditableCell({ value, onSave, type = "text", placeholder }: {
  value: string; onSave: (v: string) => void; type?: "text" | "date" | "url"; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  if (editing) {
    return (
      <input ref={inputRef} type={type} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { setEditing(false); onSave(draft); }} onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onSave(draft); } if (e.key === "Escape") { setEditing(false); setDraft(value || ""); } }} style={{ width: "100%", background: "#0d1117", border: "1px solid #58a6ff", color: "#e6edf3", padding: "2px 6px", borderRadius: 4, fontSize: 12 }} />
    );
  }
  if (type === "url" && value) {
    return <a href={value} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#58a6ff", fontSize: 12, textDecoration: "underline" }}>打开链接</a>;
  }
  return <span onClick={() => { setDraft(value || ""); setEditing(true); }} style={{ cursor: "pointer", color: value ? "#e6edf3" : "#484f58", fontSize: 12 }}>{value || placeholder || "点击编辑…"}</span>;
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ background: "#21262d", color: "#f0f6fc", padding: "8px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", fontSize: 13, ...style }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "6px 10px", borderBottom: "1px solid #30363d", verticalAlign: "top", fontSize: 13, ...style }}>{children}</td>;
}
function Card({ children, title, accent }: { children: React.ReactNode; title?: string; accent?: string }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderLeft: accent ? `4px solid ${accent}` : undefined, borderRadius: 8, padding: 20, marginBottom: 16 }}>
      {title && <h3 style={{ color: "#79c0ff", fontSize: 16, marginBottom: 12 }}>{title}</h3>}
      {children}
    </div>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>;
}

function HutTab({ vehicles, pgs, impacts, pepComparison }: {
  vehicles: typeof CEA2_VEHICLES; pgs: DataJson["productGroups"]; impacts: DataJson["impactAnalysis"]; pepComparison: DataJson["pepComparison"];
}) {
  const sopGroups = vehicles.reduce<Record<string, typeof vehicles>>((acc, v) => { (acc[v.sopDate] = acc[v.sopDate] || []).push(v); return acc; }, {});
  return (
    <div>
      <Card title="CEA 2.0 车型明细（4 Vehicles in Scope）" accent="#58a6ff">
        <Table>
          <thead><tr><Th style={{ width: 30 }}>#</Th><Th style={{ width: 120 }}>Vehicle Code</Th><Th style={{ width: 50 }}>OEM</Th><Th>Vehicle Name</Th><Th style={{ width: 100 }}>Change Level</Th><Th style={{ width: 80 }}>Role</Th><Th style={{ width: 90 }}>SOP Date</Th><Th style={{ width: 110 }}>前序平台</Th><Th style={{ width: 110 }}>分类</Th><Th>说明</Th></tr></thead>
          <tbody>
            {vehicles.map((v, i) => (
              <tr key={i}><Td>{i + 1}</Td><Td style={{ fontWeight: 700, color: "#58a6ff", fontSize: 12 }}>{v.shortCode}</Td><Td><span style={{ background: JV_COLOR[v.oem] || "#484f58", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{v.oem}</span></Td><Td style={{ fontSize: 12 }}>{v.name}</Td><Td><span style={{ background: CLS_TAG[v.cls].color, color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{CLS_TAG[v.cls].label}</span></Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{v.role}</Td><Td style={{ fontWeight: 700 }}>{v.sopDate}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{v.prev}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{v.changeLevel}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{v.desc}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="产品组" accent="#238636">
          <Table><thead><tr><Th>产品组</Th><Th>平台</Th><Th>动力</Th><Th>Leading Car</Th></tr></thead><tbody>{pgs.map((pg) => (<tr key={pg.name}><Td style={{ fontWeight: 600 }}>{pg.name}</Td><Td>{pg.platform}</Td><Td>{pg.powertrain}</Td><Td style={{ fontSize: 12 }}>{pg.leading}</Td></tr>))}</tbody></Table>
        </Card>
        <Card title="Impact Analysis 分类" accent="#d29922">
          <Table><thead><tr><Th>产品组</Th><Th>分类</Th><Th>参考</Th></tr></thead><tbody>{impacts.map((ia) => (<tr key={ia.pg}><Td style={{ fontWeight: 600 }}>{ia.pg}</Td><Td><span style={{ background: ia.classification.includes("New") ? "#da3633" : "#d29922", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11 }}>{ia.classification}</span></Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{ia.ref} {ia.refCar}</Td></tr>))}</tbody></Table>
        </Card>
      </div>
      <Card title="按 SOP 节点分组" accent="#8957e5">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(sopGroups).map(([sop, groupVs], idx) => (
            <div key={sop} style={{ flex: "1 1 300px", background: "#0d1117", border: "1px solid #30363d", borderLeft: `4px solid ${["#da3633", "#d29922", "#1f6feb"][idx % 3]}`, borderRadius: 6, padding: 12 }}>
              <div style={{ fontWeight: 700, color: "#e6edf3", marginBottom: 8 }}>SOP {sop} <span style={{ color: "#8b949e", fontSize: 12, fontWeight: 400 }}>Release Node {idx + 1} · {groupVs.length} Vehicles</span></div>
              <Table><thead><tr><Th style={{ width: 50 }}>OEM</Th><Th>Vehicle</Th><Th style={{ width: 80 }}>Change Level</Th></tr></thead><tbody>{groupVs.map((v, i) => (<tr key={i}><Td><span style={{ background: JV_COLOR[v.oem] || "#484f58", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{v.oem}</span></Td><Td style={{ fontSize: 12 }}>{v.shortCode} — {v.name}</Td><Td><span style={{ background: CLS_TAG[v.cls].color, color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{CLS_TAG[v.cls].label}</span></Td></tr>))}</tbody></Table>
            </div>
          ))}
        </div>
      </Card>
      <Card title="PEP 类型对比" accent="#1f6feb">
        <Table><thead><tr><Th>PEP 类型</Th><Th>范围</Th><Th>周期</Th><Th>状态</Th></tr></thead><tbody>{pepComparison.map((p) => (<tr key={p.type} style={p.type === "PEP CEA" ? { background: "#1c2128" } : undefined}><Td style={{ fontWeight: p.type === "PEP CEA" ? 700 : 400 }}>{p.type}</Td><Td>{p.scope}</Td><Td>{p.duration}</Td><Td>{p.status}</Td></tr>))}</tbody></Table>
      </Card>
    </div>
  );
}

function DeliverablesTab({ spData, onStatusChange, onRemarkChange, onLinkChange, onDateChange, onTailoringChange }: {
  spData: Record<string, SpEntry>;
  onStatusChange: (vc: string, key: string, val: string) => void;
  onRemarkChange: (vc: string, key: string, val: string) => void;
  onLinkChange: (vc: string, key: string, val: string) => void;
  onDateChange: (vc: string, key: string, field: "plannedDates" | "actualDates", val: string) => void;
  onTailoringChange: (vc: string, key: string, val: string) => void;
}) {
  const [activeVehicle, setActiveVehicle] = useState(CEA2_VEHICLES[0].shortCode);
  const [subView, setSubView] = useState<"tailoring" | "general" | "compdev" | "supplier">("tailoring");

  const isGeneral = (name: string) => !name.includes("4A") && !name.includes("5S");
  const isCompDev = (name: string) => name.includes("4A");
  const isSupplier = (name: string) => name.includes("5S");

  const phasesByView = {
    general: CEA2_DELIVERABLES.filter((p) => isGeneral(p.name)),
    compdev: CEA2_DELIVERABLES.filter((p) => isCompDev(p.name)),
    supplier: CEA2_DELIVERABLES.filter((p) => isSupplier(p.name)),
  };

  const phasesToShow = subView === "tailoring" ? CEA2_DELIVERABLES : (phasesByView as Record<string, Cea2Phase[]>)[subView];
  const totalCount = phasesToShow.reduce((s, p) => s + p.items.length, 0);
  const vd = spData[activeVehicle] || { statuses: {}, remarks: {} };

  const subTabs: Array<{ key: typeof subView; label: string; count: number }> = [
    { key: "tailoring", label: "Tailoring Matrix", count: CEA2_DELIVERABLES.reduce((s, p) => s + p.items.length, 0) },
    { key: "general", label: "General (Phase 1-8)", count: phasesByView.general.reduce((s, p) => s + p.items.length, 0) },
    { key: "compdev", label: "Component Dev (4A)", count: phasesByView.compdev.reduce((s, p) => s + p.items.length, 0) },
    { key: "supplier", label: "Supplier (5S)", count: phasesByView.supplier.reduce((s, p) => s + p.items.length, 0) },
  ];

  const activeVehicleInfo = CEA2_VEHICLES.find((v) => v.shortCode === activeVehicle);

  if (subView === "tailoring") {
    return (
      <div>
        <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #30363d" }}>
            {subTabs.map((st) => (
              <button key={st.key} onClick={() => setSubView(st.key)} style={{ background: subView === st.key ? "#1f6feb" : "#161b22", color: subView === st.key ? "#fff" : "#8b949e", border: "none", padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{st.label} ({st.count})</button>
            ))}
          </div>
        </div>
        <TailoringMatrix spData={spData} onTailoringChange={onTailoringChange} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={activeVehicle} onChange={(e) => setActiveVehicle(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13, minWidth: 280 }}>
          {CEA2_VEHICLES.map((v) => (
            <option key={v.shortCode} value={v.shortCode}>{v.shortCode} — {v.name} ({v.oem}, SOP {v.sopDate})</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #30363d" }}>
          {subTabs.map((st) => (
            <button key={st.key} onClick={() => setSubView(st.key)} style={{ background: subView === st.key ? "#1f6feb" : "#161b22", color: subView === st.key ? "#fff" : "#8b949e", border: "none", padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{st.label} ({st.count})</button>
          ))}
        </div>
      </div>

      {activeVehicleInfo && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, fontSize: 12, color: "#8b949e" }}>
          当前车型：<span style={{ color: "#58a6ff", fontWeight: 700 }}>{activeVehicleInfo.shortCode}</span> · {activeVehicleInfo.name} · OEM: {activeVehicleInfo.oem} · SOP: {activeVehicleInfo.sopDate} · Change Level: {activeVehicleInfo.changeLevel} ({CLS_TAG[activeVehicleInfo.cls].label}) · 共 {totalCount} 项交付物
        </div>
      )}

      {phasesToShow.map((p) => (
        <Card key={p.name} title={p.name} accent="#58a6ff">
          <div style={{ overflowX: "auto" }}>
            <Table>
              <thead>
                <tr>
                  <Th style={{ width: 50 }}>No.</Th>
                  <Th style={{ width: 130 }}>Activity</Th>
                  <Th style={{ minWidth: 200 }}>Deliverable / Document</Th>
                  <Th style={{ width: 80 }}>Annex</Th>
                  <Th style={{ width: 130 }}>ISO 26262 Ref.</Th>
                  <Th style={{ width: 70 }}>Owner</Th>
                  <Th style={{ width: 110 }}>Level</Th>
                  <Th style={{ width: 95 }}>Tailoring</Th>
                  <Th style={{ width: 110 }}>Planned Date</Th>
                  <Th style={{ width: 110 }}>Actual Date</Th>
                  <Th style={{ width: 100 }}>Status</Th>
                  <Th style={{ width: 80 }}>Link</Th>
                  <Th style={{ width: 150 }}>Remark</Th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((item) => {
                  const key = item.no;
                  const tailoring = vd.tailoring?.[key] || getTailoringPreset(item, activeVehicleInfo?.cls || "newvar");
                  const rawStatus = vd.statuses[key] || "";
                  const status = tailoring === "Carry-over" ? "done" : tailoring === "N/A" ? "na" : rawStatus;
                  const remark = vd.remarks[key] || "";
                  const link = vd.links?.[key] || "";
                  const planned = vd.plannedDates?.[key] || "";
                  const actual = vd.actualDates?.[key] || "";
                  const isNA = tailoring === "N/A";
                  const tMeta = TAILORING_META[tailoring] || TAILORING_META["Applicable"];
                  const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length];
                  const rowStyle: React.CSSProperties = isNA ? { opacity: 0.4 } : {};
                  const noEdit = isNA;
                  return (
                    <tr key={item.no} style={rowStyle}>
                      <Td style={{ fontWeight: 700, color: "#58a6ff" }}>{item.no}</Td>
                      <Td style={{ fontSize: 12 }}>{item.activity}</Td>
                      <Td>{item.deliverable}</Td>
                      <Td style={{ fontSize: 11, color: "#bc8cff" }}>{item.annex !== "-" ? item.annex : "—"}</Td>
                      <Td style={{ fontSize: 11, color: "#bc8cff" }}>{item.isoRef}</Td>
                      <Td style={{ fontSize: 11 }}>{item.owner}</Td>
                      <Td style={{ fontSize: 11, color: "#8b949e" }}>{item.level}</Td>
                      <Td><span style={{ display: "inline-block", background: tMeta.bg, color: tMeta.color, padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{tMeta.label}</span></Td>
                      <Td>{noEdit ? <span style={{ color: "#484f58" }}>—</span> : <EditableCell value={planned} type="date" onSave={(v) => onDateChange(activeVehicle, key, "plannedDates", v)} placeholder="—" />}</Td>
                      <Td>{noEdit ? <span style={{ color: "#484f58" }}>—</span> : <EditableCell value={actual} type="date" onSave={(v) => onDateChange(activeVehicle, key, "actualDates", v)} placeholder="—" />}</Td>
                      <Td><StatusBadge status={status} onClick={noEdit ? undefined : () => onStatusChange(activeVehicle, key, nextStatus)} /></Td>
                      <Td>{noEdit ? <span style={{ color: "#484f58" }}>—</span> : <EditableCell value={link} type="url" onSave={(v) => onLinkChange(activeVehicle, key, v)} placeholder="—" />}</Td>
                      <Td>{noEdit ? <span style={{ color: "#484f58" }}>—</span> : <EditableCell value={remark} onSave={(v) => onRemarkChange(activeVehicle, key, v)} placeholder="点击编辑…" />}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TailoringMatrix({ spData, onTailoringChange }: {
  spData: Record<string, SpEntry>;
  onTailoringChange: (vc: string, key: string, val: string) => void;
}) {
  const legendItems = TAILORING_CYCLE.map((t) => ({ key: t, ...TAILORING_META[t] }));

  return (
    <div>
      <Card title="Tailoring Matrix — 裁剪矩阵（4 vehicles × 49 deliverables）" accent="#8957e5">
        <div style={{ display: "flex", gap: 16, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#8b949e" }}>Legend:</span>
          {legendItems.map((l) => (
            <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: l.bg, border: `1px solid ${l.color}`, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: l.color, fontWeight: 600 }}>{l.label}</span>
            </span>
          ))}
          <span style={{ fontSize: 11, color: "#6e7681", marginLeft: 8 }}>点击单元格循环切换状态 · Carry-over 车型已按规则智能预设</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 50 }}>No.</Th>
                <Th style={{ width: 140 }}>Activity</Th>
                <Th style={{ minWidth: 200 }}>Deliverable / Document</Th>
                {CEA2_VEHICLES.map((v) => (
                  <Th key={v.shortCode} style={{ textAlign: "center", fontSize: 11, maxWidth: 120 }}>
                    <div style={{ fontWeight: 700 }}>{v.shortCode}</div>
                    <div style={{ fontSize: 10, color: "#8b949e", fontWeight: 400 }}>{v.name}</div>
                    <div style={{ marginTop: 2 }}>
                      <span style={{ background: JV_COLOR[v.oem] || "#484f58", color: "#fff", padding: "0 4px", borderRadius: 3, fontSize: 9 }}>{v.oem}</span>
                      <span style={{ marginLeft: 3, fontSize: 9, color: CLS_TAG[v.cls].color }}>{CLS_TAG[v.cls].label}</span>
                    </div>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CEA2_DELIVERABLES.map((phase) => (
                <React.Fragment key={phase.name}>
                  <tr key={phase.name}>
                    <td colSpan={3 + CEA2_VEHICLES.length} style={{ background: "#21262d", color: "#79c0ff", padding: "6px 10px", fontSize: 12, fontWeight: 700, borderBottom: "1px solid #30363d" }}>{phase.name}</td>
                  </tr>
                  {phase.items.map((item) => (
                    <tr key={item.no}>
                      <Td style={{ fontWeight: 700, color: "#58a6ff", fontSize: 11 }}>{item.no}</Td>
                      <Td style={{ fontSize: 11 }}>{item.activity}</Td>
                      <Td style={{ fontSize: 12 }}>{item.deliverable}</Td>
                      {CEA2_VEHICLES.map((v) => {
                        const td = spData[v.shortCode]?.tailoring || {};
                        const val = td[item.no] || getTailoringPreset(item, v.cls);
                        const meta = TAILORING_META[val] || TAILORING_META["Applicable"];
                        const nextVal = TAILORING_CYCLE[(TAILORING_CYCLE.indexOf(val) + 1) % TAILORING_CYCLE.length];
                        return (
                          <td key={v.shortCode} style={{ textAlign: "center", borderBottom: "1px solid #30363d", padding: "4px 6px" }}>
                            <span onClick={() => onTailoringChange(v.shortCode, item.no, nextVal)} style={{ display: "inline-block", background: meta.bg, color: meta.color, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{meta.label}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

const SOP_DATE = new Date("2027-06-18");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weekToDate(week: number) {
  const d = new Date(SOP_DATE);
  d.setTime(d.getTime() + week * WEEK_MS);
  return d;
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function weekLabel(week: number) {
  if (week === 0) return "SOP";
  if (week > 0) return `SOP+${week}w`;
  return `SOP${week}w`;
}
function monthLabel(week: number) {
  const m = Math.round(week / 4.345);
  if (m === 0) return "SOP";
  if (m > 0) return `SOP+${m}m`;
  return `SOP${m}m`;
}

function VisualTimeline({ items }: { items: Array<{ name: string; week: number; color?: string; desc?: string }> }) {
  const minW = Math.min(...items.map((i) => i.week));
  const maxW = Math.max(...items.map((i) => i.week, 0));
  const range = maxW - minW || 1;
  const sopPct = ((0 - minW) / range) * 100;
  const ticks: number[] = [];
  for (let w = Math.ceil(minW / 26) * 26; w <= maxW; w += 26) ticks.push(w);
  return (
    <div style={{ position: "relative", margin: "20px 0 8px", height: 58, userSelect: "none" }}>
      <div style={{ position: "absolute", top: 28, left: 0, right: 0, height: 2, background: "#30363d" }} />
      {sopPct >= 0 && sopPct <= 100 && (
        <div style={{ position: "absolute", top: 14, left: `${sopPct}%`, height: 30, width: 2, background: "#f85149" }}>
          <span style={{ position: "absolute", top: -2, left: 4, fontSize: 10, color: "#f85149", fontWeight: 700, whiteSpace: "nowrap" }}>SOP</span>
        </div>
      )}
      {ticks.map((w) => {
        const pct = ((w - minW) / range) * 100;
        return (
          <div key={w} style={{ position: "absolute", top: 28, left: `${pct}%`, transform: "translateX(-50%)" }}>
            <div style={{ width: 1, height: 6, background: "#484f58", margin: "0 auto" }} />
            <span style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#6e7681", whiteSpace: "nowrap" }}>{weekLabel(w)}</span>
          </div>
        );
      })}
      {items.map((item, i) => {
        const pct = ((item.week - minW) / range) * 100;
        const col = item.color || (item.week === 0 ? "#f85149" : "#58a6ff");
        const above = i % 2 === 0;
        return (
          <div key={i} style={{ position: "absolute", left: `${pct}%`, top: above ? 0 : 36, transform: "translateX(-50%)" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, border: "2px solid #0d1117", margin: "0 auto", cursor: "pointer" }} title={`${item.name}: ${weekLabel(item.week)} (${fmtDate(weekToDate(item.week))})`} />
            <span style={{ position: "absolute", top: above ? 12 : -16, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: col, fontWeight: 700, whiteSpace: "nowrap" }}>{item.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function GanttBar({ startWeek, endWeek, minW, range }: { startWeek: number; endWeek: number; minW: number; range: number }) {
  const left = ((startWeek - minW) / range) * 100;
  const width = Math.max(((endWeek - startWeek) / range) * 100, 1);
  return <div style={{ position: "relative", height: 16, background: "#21262d", borderRadius: 3, overflow: "hidden" }}><div style={{ position: "absolute", left: `${left}%`, top: 0, height: "100%", width: `${width}%`, background: "linear-gradient(90deg,#1f6feb33,#1f6feb88)", borderLeft: "2px solid #58a6ff", borderRight: "2px solid #58a6ff" }} /></div>;
}

function TimelineTab({ milestones, pepCeaMilestones, mapping }: {
  milestones: DataJson["ceaKeyMilestones"]; pepCeaMilestones: DataJson["pepCeaMilestones"]; mapping: DataJson["safetyPepMapping"];
}) {
  const allWeeks = [...pepCeaMilestones.map((m) => m.week), ...milestones.map((m) => m.week), ...mapping.flatMap((m) => [m.startWeek, m.endWeek])];
  const minW = Math.min(...allWeeks);
  const maxW = Math.max(...allWeeks);
  const range = maxW - minW || 1;

  const fnLevelColor = (lvl: string) => {
    if (lvl.includes("Release") || lvl.includes("?")) return "#238636";
    if (lvl.startsWith("C")) return "#3fb950";
    if (lvl.startsWith("B")) return "#1f6feb";
    return "#8b949e";
  };

  return (
    <div>
      <Card title="PEP CEA 里程碑（35 个月，PS → SOP）" accent="#58a6ff">
        <div style={{ marginBottom: 12, fontSize: 12, color: "#8b949e" }}>SOP 基准日：{fmtDate(SOP_DATE)} · 所有时间相对 SOP 计算</div>
        <VisualTimeline items={pepCeaMilestones.map((m) => ({ name: m.name, week: m.week, desc: m.desc }))} />
        <Table>
          <thead><tr><Th style={{ width: 120 }}>里程碑</Th><Th style={{ width: 80 }}>相对 SOP</Th><Th style={{ width: 70 }}>月</Th><Th style={{ width: 70 }}>周</Th><Th style={{ width: 90 }}>日历日期</Th><Th>描述</Th></tr></thead>
          <tbody>{pepCeaMilestones.map((m) => (<tr key={m.name} style={m.name === "SOP" ? { background: "#1c2128" } : undefined}><Td style={{ fontWeight: 700, color: m.name === "SOP" ? "#f85149" : "#e6edf3" }}>{m.name}</Td><Td style={{ fontSize: 12, color: "#d29922", fontWeight: 600 }}>{weekLabel(m.week)}</Td><Td style={{ fontSize: 12 }}>{monthLabel(m.week)}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{m.week}w</Td><Td style={{ fontSize: 12, color: "#bc8cff" }}>{fmtDate(weekToDate(m.week))}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{m.desc}</Td></tr>))}</tbody>
        </Table>
      </Card>

      <Card title="CEA 开发关键里程碑（至 IPD 6.0 = CEA 2.0 HO 基线）" accent="#238636">
        <VisualTimeline items={milestones.map((m) => ({ name: m.name.replace(/\(.*?\)/g, "").trim(), week: m.week, desc: m.desc, color: m.isFreeze ? "#d29922" : m.isHomoFreeze ? "#da3633" : m.name === "IPD 6.0 (Homo)" ? "#3fb950" : "#58a6ff" }))} />
        <Table>
          <thead><tr><Th style={{ width: 160 }}>里程碑</Th><Th style={{ width: 80 }}>相对 SOP</Th><Th style={{ width: 70 }}>月</Th><Th style={{ width: 70 }}>周</Th><Th style={{ width: 90 }}>日历日期</Th><Th style={{ width: 90 }}>功能等级</Th><Th>描述</Th></tr></thead>
          <tbody>{milestones.map((m) => (<tr key={m.name} style={m.name === "IPD 6.0 (Homo)" ? { background: "#1c2128" } : undefined}><Td style={{ fontWeight: m.name === "IPD 6.0 (Homo)" ? 700 : 400, color: m.name === "IPD 6.0 (Homo)" ? "#3fb950" : "#e6edf3" }}>{m.name}</Td><Td style={{ fontSize: 12, color: "#d29922", fontWeight: 600 }}>{weekLabel(m.week)}</Td><Td style={{ fontSize: 12 }}>{monthLabel(m.week)}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{m.week}w</Td><Td style={{ fontSize: 12, color: "#bc8cff" }}>{fmtDate(weekToDate(m.week))}</Td><Td>{m.fnLevel ? <span style={{ background: fnLevelColor(m.fnLevel), color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 700 }}>{m.fnLevel.replace(/\?/g, " → ")}</span> : <span style={{ color: "#484f58" }}>—</span>}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{m.desc}{m.isFreeze && <span style={{ marginLeft: 6, color: "#d29922", fontSize: 11 }}>🔒 Freeze</span>}{m.isHomoFreeze && <span style={{ marginLeft: 6, color: "#da3633", fontSize: 11 }}>🔒 Homo HW Freeze</span>}</Td></tr>))}</tbody>
        </Table>
      </Card>

      <Card title="安全活动与 PEP 里程碑映射（甘特图）" accent="#d29922">
        <Table>
          <thead><tr><Th style={{ width: 160 }}>安全活动</Th><Th style={{ width: 150 }}>PEP 里程碑</Th><Th style={{ width: 90 }}>相对 SOP</Th><Th style={{ width: 80 }}>开始</Th><Th style={{ width: 80 }}>结束</Th><Th style={{ minWidth: 200 }}>时间窗口（SOP{minW}w ~ SOP{maxW}w）</Th><Th>说明</Th></tr></thead>
          <tbody>{mapping.map((m, i) => (<tr key={i}><Td style={{ fontWeight: 600, fontSize: 12 }}>{m.safetyActivity}</Td><Td style={{ fontSize: 12, color: "#bc8cff" }}>{m.pepMilestone.replace(/\s*\?\s*/g, " → ")}</Td><Td style={{ fontSize: 11, color: "#d29922", fontWeight: 600 }}>{weekLabel(m.pepWeek)}</Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{fmtDate(weekToDate(m.startWeek))}</Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{fmtDate(weekToDate(m.endWeek))}</Td><Td><GanttBar startWeek={m.startWeek} endWeek={m.endWeek} minW={minW} range={range} /></Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{m.notes}</Td></tr>))}</tbody>
        </Table>
      </Card>
    </div>
  );
}
