"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CEA2_HUTS = [
  { sop: "2027-05", jv: "SVW", hut: "CMP21 CS A SUV MY27 VW316/9CS_B1 2ECV6H", prev: "CEA 1.3 → 1.4", cls: "carryover", desc: "2026 first ALS1(1.3) to ALS2(1.4) to MY27 upgrade CEA2.0" },
  { sop: "2027-05", jv: "FAW", hut: "CMP21 CN A NB PHEV VW311/1CN_P 2EFV6H", prev: "-", cls: "newvar", desc: "New powertrain PHEV, CMP21 platform first PHEV" },
  { sop: "2027-05", jv: "FAW", hut: "CMP21 CN A Main SUV BEV VW316/9CN_B 2EGV6H", prev: "-", cls: "newvar", desc: "FAW CMP21 Main SUV, new JV variant" },
  { sop: "2027-09", jv: "VWA", hut: "MEB31 CM A SUVe MY28 VW316/8CM_B1 11H001", prev: "CEA 1.3 (from 1.0 ACOSe)", cls: "carryover", desc: "2026 first ALS1(1.3) to MY28 upgrade CEA2.0" },
];

const CEA2_PGS = ["CMP21 BEV", "CMP21 PHEV", "MEB31 BEV"];

const CLS_TAG: Record<string, { label: string; color: string }> = {
  carryover: { label: "CARRY-OVER", color: "#238636" },
  newvar: { label: "NEW VARIANT", color: "#d29922" },
  allnew: { label: "ALL-NEW", color: "#da3633" },
};

const JV_COLOR: Record<string, string> = { SVW: "#1f6feb", FAW: "#238636", VWA: "#8957e5" };

const PERCOMP_PHASE_PREFIXES = ["Phase 4B", "Phase 4C", "Phase 5S"];

const STATUS_CYCLE = ["", "planned", "progress", "done", "na"];

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  "": { label: "Pending", bg: "rgba(218,54,51,.12)", color: "#f85149" },
  planned: { label: "Planned", bg: "rgba(210,153,34,.12)", color: "#d29922" },
  progress: { label: "In Progress", bg: "rgba(31,111,235,.12)", color: "#58a6ff" },
  done: { label: "Done", bg: "rgba(35,134,54,.12)", color: "#3fb950" },
  na: { label: "N/A", bg: "rgba(139,148,158,.1)", color: "#8b949e" },
};

const API = "/api/safety-plan?token=123456";

type Deliverable = { id: string; activity: string; deliverable: string; annex?: string; isoRef: string; owner?: string; level?: string };
type Phase = { phase: string; isoPart: string; items: Deliverable[] };
type Component = { domain: string; abbreviation: string; fullName: string; chineseName: string; fsm?: string; btv?: string; supplier?: string; asil?: string; fuSaDevelopedBy?: string; loadType?: string; powerSupply?: string; remark?: string };

type DataJson = {
  productGroups: Array<{ name: string; platform: string; powertrain: string; leading: string; derivatives: string[] }>;
  impactAnalysis: Array<{ pg: string; classification: string; ref: string; refCar: string; rationale: string }>;
  pepComparison: Array<{ type: string; scope: string; duration: string; status: string }>;
  pepCeaMilestones: Array<{ name: string; week: number; month: number; desc: string }>;
  ceaKeyMilestones: Array<{ name: string; week: number; desc: string; fnLevel?: string; isFreeze?: boolean; isHomoFreeze?: boolean }>;
  deliverables: Phase[];
  safetyPepMapping: Array<{ safetyPhase: string; safetyActivity: string; pepMilestone: string; pepWeek: number; startWeek: number; endWeek: number; notes: string }>;
  componentManagement: { vehicles: string[]; domains: string[]; components: Component[] };
  safetyPlanPerProject?: Record<string, { statuses: Record<string, string>; remarks: Record<string, string> }>;
  compSafetyPlan?: Record<string, { statuses: Record<string, string>; remarks: Record<string, string> }>;
};

export function Cea2Info() {
  const [data, setData] = useState<DataJson | null>(null);
  const [tab, setTab] = useState<"huts" | "components" | "deliverables" | "timeline">("huts");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [compSearch, setCompSearch] = useState("");
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

  const updateStatus = useCallback((projectName: string, key: string, value: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, safetyPlanPerProject: { ...(prev.safetyPlanPerProject || {}) } };
      if (!next.safetyPlanPerProject[projectName]) next.safetyPlanPerProject[projectName] = { statuses: {}, remarks: {} };
      const entry = { ...next.safetyPlanPerProject[projectName] };
      entry.statuses = { ...entry.statuses, [key]: value };
      next.safetyPlanPerProject[projectName] = entry;
      return next;
    });
    autoSave();
  }, [autoSave]);

  const updateRemark = useCallback((projectName: string, key: string, value: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, safetyPlanPerProject: { ...(prev.safetyPlanPerProject || {}) } };
      if (!next.safetyPlanPerProject[projectName]) next.safetyPlanPerProject[projectName] = { statuses: {}, remarks: {} };
      const entry = { ...next.safetyPlanPerProject[projectName] };
      entry.remarks = { ...entry.remarks, [key]: value };
      next.safetyPlanPerProject[projectName] = entry;
      return next;
    });
    autoSave();
  }, [autoSave]);

  const updateCompStatus = useCallback((dataKey: string, key: string, value: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, compSafetyPlan: { ...(prev.compSafetyPlan || {}) } };
      if (!next.compSafetyPlan[dataKey]) next.compSafetyPlan[dataKey] = { statuses: {}, remarks: {} };
      const entry = { ...next.compSafetyPlan[dataKey] };
      entry.statuses = { ...entry.statuses, [key]: value };
      next.compSafetyPlan[dataKey] = entry;
      return next;
    });
    autoSave();
  }, [autoSave]);

  const updateCompRemark = useCallback((dataKey: string, key: string, value: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, compSafetyPlan: { ...(prev.compSafetyPlan || {}) } };
      if (!next.compSafetyPlan[dataKey]) next.compSafetyPlan[dataKey] = { statuses: {}, remarks: {} };
      const entry = { ...next.compSafetyPlan[dataKey] };
      entry.remarks = { ...entry.remarks, [key]: value };
      next.compSafetyPlan[dataKey] = entry;
      return next;
    });
    autoSave();
  }, [autoSave]);

  const cea2Impact = useMemo(() => (data?.impactAnalysis || []).filter((ia) => CEA2_PGS.includes(ia.pg)), [data]);
  const cea2PGs = useMemo(() => (data?.productGroups || []).filter((pg) => CEA2_PGS.includes(pg.name)), [data]);
  const cea2Milestones = useMemo(() => (data?.ceaKeyMilestones || []).filter((m) => m.week <= -22 || m.name === "SOP"), [data]);
  const filteredComponents = useMemo(() => {
    if (!data) return [];
    let list = data.componentManagement.components;
    if (domainFilter !== "all") list = list.filter((c) => c.domain === domainFilter);
    if (compSearch.trim()) {
      const q = compSearch.toLowerCase();
      list = list.filter((c) => [c.abbreviation, c.fullName, c.chineseName, c.supplier, c.fsm, c.btv].join(" ").toLowerCase().includes(q));
    }
    return list;
  }, [data, domainFilter, compSearch]);

  const vehicleProjects = useMemo(() => {
    if (!data) return [];
    return CEA2_HUTS.map((h) => h.hut.split(" VW")[0]);
  }, [data]);

  if (!data) return <div style={{ padding: 40, color: "#8b949e" }}>Loading CEA 2.0 data…</div>;

  const tabs: Array<{ key: typeof tab; label: string; icon: string }> = [
    { key: "huts", label: "HUT 清单", icon: "📋" },
    { key: "components", label: "组件", icon: "⊞" },
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
        {tab === "huts" && <HutTab huts={CEA2_HUTS} pgs={cea2PGs} impacts={cea2Impact} pepComparison={data.pepComparison} />}
        {tab === "components" && (
          <ComponentsTab components={filteredComponents} domains={data.componentManagement.domains} domainFilter={domainFilter} setDomainFilter={setDomainFilter} compSearch={compSearch} setCompSearch={setCompSearch} />
        )}
        {tab === "deliverables" && (
          <DeliverablesTab deliverables={data.deliverables} projects={vehicleProjects} spData={data.safetyPlanPerProject || {}} onStatusChange={updateStatus} onRemarkChange={updateRemark} />
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

function RemarkCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  if (editing) {
    return (
      <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { setEditing(false); onSave(draft); }} onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onSave(draft); } if (e.key === "Escape") { setEditing(false); setDraft(value || ""); } }} style={{ width: "100%", background: "#0d1117", border: "1px solid #58a6ff", color: "#e6edf3", padding: "2px 6px", borderRadius: 4, fontSize: 12 }} />
    );
  }
  return <span onClick={() => { setDraft(value || ""); setEditing(true); }} style={{ cursor: "pointer", color: value ? "#e6edf3" : "#484f58", fontSize: 12 }}>{value || "点击编辑…"}</span>;
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

function HutTab({ huts, pgs, impacts, pepComparison }: {
  huts: typeof CEA2_HUTS; pgs: DataJson["productGroups"]; impacts: DataJson["impactAnalysis"]; pepComparison: DataJson["pepComparison"];
}) {
  const sopGroups = huts.reduce<Record<string, typeof huts>>((acc, h) => { (acc[h.sop] = acc[h.sop] || []).push(h); return acc; }, {});
  return (
    <div>
      <Card title="CEA 2.0 HUT 明细" accent="#58a6ff">
        <Table>
          <thead><tr><Th style={{ width: 30 }}>#</Th><Th style={{ width: 75 }}>SOP</Th><Th style={{ width: 50 }}>JV</Th><Th>HUT 名称</Th><Th style={{ width: 110 }}>前序平台</Th><Th style={{ width: 110 }}>分类</Th><Th>说明</Th></tr></thead>
          <tbody>
            {huts.map((h, i) => (
              <tr key={i}><Td>{i + 1}</Td><Td style={{ fontWeight: 700 }}>{h.sop}</Td><Td><span style={{ background: JV_COLOR[h.jv] || "#484f58", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{h.jv}</span></Td><Td style={{ fontSize: 12 }}>{h.hut}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{h.prev}</Td><Td><span style={{ background: CLS_TAG[h.cls].color, color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{CLS_TAG[h.cls].label}</span></Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{h.desc}</Td></tr>
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
          {Object.entries(sopGroups).map(([sop, groupHuts], idx) => (
            <div key={sop} style={{ flex: "1 1 300px", background: "#0d1117", border: "1px solid #30363d", borderLeft: `4px solid ${["#da3633", "#d29922", "#1f6feb"][idx % 3]}`, borderRadius: 6, padding: 12 }}>
              <div style={{ fontWeight: 700, color: "#e6edf3", marginBottom: 8 }}>SOP {sop} <span style={{ color: "#8b949e", fontSize: 12, fontWeight: 400 }}>Release Node {idx + 1} · {groupHuts.length} HUTs</span></div>
              <Table><thead><tr><Th>JV</Th><Th>HUT</Th><Th>分类</Th></tr></thead><tbody>{groupHuts.map((h, i) => (<tr key={i}><Td><span style={{ background: JV_COLOR[h.jv] || "#484f58", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{h.jv}</span></Td><Td style={{ fontSize: 12 }}>{h.hut.split(" VW")[0]}</Td><Td><span style={{ background: CLS_TAG[h.cls].color, color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{CLS_TAG[h.cls].label}</span></Td></tr>))}</tbody></Table>
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

function ComponentsTab({ components, domains, domainFilter, setDomainFilter, compSearch, setCompSearch }: {
  components: Component[]; domains: string[]; domainFilter: string; setDomainFilter: (v: string) => void; compSearch: string; setCompSearch: (v: string) => void;
}) {
  const grouped = domains.map((d) => ({ domain: d, items: components.filter((c) => c.domain === d) })).filter((g) => g.items.length > 0);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
          <option value="all">全部域 ({components.length})</option>
          {domains.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input value={compSearch} onChange={(e) => setCompSearch(e.target.value)} placeholder="搜索缩写/名称/供应商/FSM/BTV…" style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13, flex: 1, minWidth: 250 }} />
      </div>
      {grouped.map((g) => (
        <Card key={g.domain} title={`${g.domain} (${g.items.length})`} accent="#1f6feb">
          <Table>
            <thead><tr><Th style={{ width: 90 }}>缩写</Th><Th>全称</Th><Th style={{ width: 100 }}>中文名</Th><Th style={{ width: 50 }}>ASIL</Th><Th style={{ width: 110 }}>FSM</Th><Th style={{ width: 110 }}>BTV</Th><Th style={{ width: 120 }}>供应商</Th><Th style={{ width: 70 }}>FuSa</Th></tr></thead>
            <tbody>{g.items.map((c) => (<tr key={c.abbreviation}><Td style={{ fontWeight: 700, color: "#58a6ff" }}>{c.abbreviation}</Td><Td style={{ fontSize: 12 }}>{c.fullName}</Td><Td style={{ fontSize: 12, color: "#8b949e" }}>{c.chineseName}</Td><Td>{c.asil ? <span style={{ background: "#da3633", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 700 }}>{c.asil}</span> : <span style={{ color: "#484f58" }}>—</span>}</Td><Td style={{ fontSize: 11 }}>{c.fsm || "—"}</Td><Td style={{ fontSize: 11 }}>{c.btv || "—"}</Td><Td style={{ fontSize: 11 }}>{c.supplier || "—"}</Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{c.fuSaDevelopedBy || "—"}</Td></tr>))}</tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

function DeliverablesTab({ deliverables, projects, spData, onStatusChange, onRemarkChange }: {
  deliverables: Phase[]; projects: string[]; spData: NonNullable<DataJson["safetyPlanPerProject"]>; onStatusChange: (project: string, key: string, val: string) => void; onRemarkChange: (project: string, key: string, val: string) => void;
}) {
  const [activeProject, setActiveProject] = useState(projects[0] || "");
  const [subView, setSubView] = useState<"general" | "percomp">("general");
  const [phaseFilter, setPhaseFilter] = useState("all");

  const isPerComp = (phase: string) => PERCOMP_PHASE_PREFIXES.some((p) => phase.startsWith(p));
  const generalPhases = deliverables.filter((p) => !isPerComp(p.phase));
  const perCompPhases = deliverables.filter((p) => isPerComp(p.phase));

  const phasesToShow = subView === "general" ? generalPhases : perCompPhases;
  const filtered = phaseFilter === "all" ? phasesToShow : phasesToShow.filter((p) => p.phase.startsWith(phaseFilter));
  const projectData = spData[activeProject] || { statuses: {}, remarks: {} };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={activeProject} onChange={(e) => setActiveProject(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13, maxWidth: 350 }}>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #30363d" }}>
          <button onClick={() => setSubView("general")} style={{ background: subView === "general" ? "#1f6feb" : "#161b22", color: subView === "general" ? "#fff" : "#8b949e", border: "none", padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>General</button>
          <button onClick={() => setSubView("percomp")} style={{ background: subView === "percomp" ? "#1f6feb" : "#161b22", color: subView === "percomp" ? "#fff" : "#8b949e", border: "none", padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Per-Component (4B/4C/5S)</button>
        </div>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
          <option value="all">全部 Phase ({phasesToShow.reduce((s, p) => s + p.items.length, 0)} 项)</option>
          {phasesToShow.map((p) => <option key={p.phase} value={p.phase.split(":")[0]}>{p.phase} ({p.items.length})</option>)}
        </select>
      </div>

      {filtered.map((p) => {
        const phasePrefix = p.phase.split(":")[0];
        return (
          <Card key={p.phase} title={`${p.phase} — ${p.isoPart}`} accent="#58a6ff">
            <Table>
              <thead>
                <tr>
                  <Th style={{ width: 50 }}>ID</Th>
                  <Th style={{ width: 140 }}>活动</Th>
                  <Th>交付物</Th>
                  <Th style={{ width: 80 }}>Annex</Th>
                  <Th>ISO 参考</Th>
                  <Th style={{ width: 60 }}>Owner</Th>
                  <Th style={{ width: 100 }}>Level</Th>
                  <Th style={{ width: 110 }}>Status</Th>
                  <Th style={{ width: 200 }}>Remark</Th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((item, idx) => {
                  const key = `${phasePrefix}-${idx}`;
                  const status = projectData.statuses[key] || "";
                  const remark = projectData.remarks[key] || "";
                  const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length];
                  return (
                    <tr key={item.id}>
                      <Td style={{ fontWeight: 700, color: "#58a6ff" }}>{item.id}</Td>
                      <Td style={{ fontSize: 12 }}>{item.activity}</Td>
                      <Td>{item.deliverable}</Td>
                      <Td style={{ fontSize: 11, color: "#bc8cff" }}>{item.annex || "—"}</Td>
                      <Td style={{ fontSize: 11, color: "#bc8cff" }}>{item.isoRef}</Td>
                      <Td style={{ fontSize: 11 }}>{item.owner || "—"}</Td>
                      <Td style={{ fontSize: 11, color: "#8b949e" }}>{item.level || "—"}</Td>
                      <Td><StatusBadge status={status} onClick={() => onStatusChange(activeProject, key, nextStatus)} /></Td>
                      <Td><RemarkCell value={remark} onSave={(v) => onRemarkChange(activeProject, key, v)} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}

const SOP_DATE = new Date("2027-05-01");
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
        <div style={{ marginBottom: 12, fontSize: 12, color: "#8b949e" }}>SOP 基准日：{fmtDate(SOP_DATE)}（2027-05）· 所有时间相对 SOP 计算</div>
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
          <tbody>{mapping.map((m, i) => (<tr key={i}><Td style={{ fontWeight: 600, fontSize: 12 }}>{m.safetyActivity}</Td><Td style={{ fontSize: 12, color: "#bc8cff" }}>{m.pepMilestone}</Td><Td style={{ fontSize: 11, color: "#d29922", fontWeight: 600 }}>{weekLabel(m.pepWeek)}</Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{fmtDate(weekToDate(m.startWeek))}</Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{fmtDate(weekToDate(m.endWeek))}</Td><Td><GanttBar startWeek={m.startWeek} endWeek={m.endWeek} minW={minW} range={range} /></Td><Td style={{ fontSize: 11, color: "#8b949e" }}>{m.notes}</Td></tr>))}</tbody>
        </Table>
      </Card>
    </div>
  );
}
