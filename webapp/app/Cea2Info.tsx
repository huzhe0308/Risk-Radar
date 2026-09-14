"use client";

import { useEffect, useMemo, useState } from "react";

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

type DataJson = {
  productGroups: Array<{ name: string; platform: string; powertrain: string; leading: string; derivatives: string[] }>;
  impactAnalysis: Array<{ pg: string; classification: string; ref: string; refCar: string; rationale: string }>;
  pepComparison: Array<{ type: string; scope: string; duration: string; status: string }>;
  pepCeaMilestones: Array<{ name: string; week: number; month: number; desc: string }>;
  ceaKeyMilestones: Array<{ name: string; week: number; desc: string; fnLevel?: string; isFreeze?: boolean; isHomoFreeze?: boolean }>;
  deliverables: Array<{ phase: string; isoPart: string; items: Array<{ id: string; activity: string; deliverable: string; annex?: string; isoRef: string; owner?: string; level?: string }> }>;
  safetyPepMapping: Array<{ safetyPhase: string; safetyActivity: string; pepMilestone: string; pepWeek: number; startWeek: number; endWeek: number; notes: string }>;
  componentManagement: {
    vehicles: string[];
    domains: string[];
    components: Array<{ domain: string; abbreviation: string; fullName: string; chineseName: string; fsm?: string; btv?: string; supplier?: string; asil?: string; fuSaDevelopedBy?: string; loadType?: string; powerSupply?: string; remark?: string }>;
  };
};

export function Cea2Info() {
  const [data, setData] = useState<DataJson | null>(null);
  const [tab, setTab] = useState<"huts" | "components" | "deliverables" | "timeline">("huts");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [compSearch, setCompSearch] = useState("");

  useEffect(() => {
    fetch("/safety-plan/data.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const cea2Impact = useMemo(
    () => (data?.impactAnalysis || []).filter((ia) => CEA2_PGS.includes(ia.pg)),
    [data],
  );
  const cea2PGs = useMemo(
    () => (data?.productGroups || []).filter((pg) => CEA2_PGS.includes(pg.name)),
    [data],
  );
  const cea2Milestones = useMemo(
    () => (data?.ceaKeyMilestones || []).filter((m) => m.week <= -22 || m.name === "SOP"),
    [data],
  );
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

  if (!data) return <div style={{ padding: 40, color: "#8b949e" }}>Loading CEA 2.0 data…</div>;

  const tabs: Array<{ key: typeof tab; label: string; icon: string }> = [
    { key: "huts", label: "HUT 清单", icon: "📋" },
    { key: "components", label: "组件", icon: "⊞" },
    { key: "deliverables", label: "交付物", icon: "📄" },
    { key: "timeline", label: "时间线", icon: "📅" },
  ];

  return (
    <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="cea2-tabs" style={{ display: "flex", gap: 0, borderBottom: "1px solid #30363d", padding: "0 16px", flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none", border: "none", borderBottom: tab === t.key ? "2px solid #58a6ff" : "2px solid transparent",
              color: tab === t.key ? "#58a6ff" : "#8b949e", padding: "10px 16px", fontSize: 14, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {tab === "huts" && <HutTab huts={CEA2_HUTS} pgs={cea2PGs} impacts={cea2Impact} pepComparison={data.pepComparison} />}
        {tab === "components" && (
          <ComponentsTab
            components={filteredComponents}
            domains={data.componentManagement.domains}
            domainFilter={domainFilter}
            setDomainFilter={setDomainFilter}
            compSearch={compSearch}
            setCompSearch={setCompSearch}
          />
        )}
        {tab === "deliverables" && <DeliverablesTab deliverables={data.deliverables} />}
        {tab === "timeline" && <TimelineTab milestones={cea2Milestones} pepCeaMilestones={data.pepCeaMilestones} mapping={data.safetyPepMapping} />}
      </div>
    </div>
  );
}

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div style={{ display: "inline-block", background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "12px 20px", margin: 4, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>{label}</div>
    </div>
  );
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
  huts: typeof CEA2_HUTS;
  pgs: DataJson["productGroups"];
  impacts: DataJson["impactAnalysis"];
  pepComparison: DataJson["pepComparison"];
}) {
  const sopGroups = huts.reduce<Record<string, typeof huts>>((acc, h) => {
    (acc[h.sop] = acc[h.sop] || []).push(h);
    return acc;
  }, {});
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <StatCard value={huts.length} label="CEA 2.0 HUTs" color="#58a6ff" />
        <StatCard value={pgs.length} label="产品组" color="#238636" />
        <StatCard value={3} label="合资方" color="#d29922" />
        <StatCard value={Object.keys(sopGroups).length} label="SOP 节点" color="#8957e5" />
      </div>

      <Card title="CEA 2.0 HUT 明细" accent="#58a6ff">
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 30 }}>#</Th>
              <Th style={{ width: 75 }}>SOP</Th>
              <Th style={{ width: 50 }}>JV</Th>
              <Th>HUT 名称</Th>
              <Th style={{ width: 110 }}>前序平台</Th>
              <Th style={{ width: 110 }}>分类</Th>
              <Th>说明</Th>
            </tr>
          </thead>
          <tbody>
            {huts.map((h, i) => (
              <tr key={i} style={{ ":hover": {} } as React.CSSProperties}>
                <Td>{i + 1}</Td>
                <Td style={{ fontWeight: 700 }}>{h.sop}</Td>
                <Td><span style={{ background: JV_COLOR[h.jv] || "#484f58", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{h.jv}</span></Td>
                <Td style={{ fontSize: 12 }}>{h.hut}</Td>
                <Td style={{ fontSize: 12, color: "#8b949e" }}>{h.prev}</Td>
                <Td><span style={{ background: CLS_TAG[h.cls].color, color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{CLS_TAG[h.cls].label}</span></Td>
                <Td style={{ fontSize: 12, color: "#8b949e" }}>{h.desc}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="产品组" accent="#238636">
          <Table>
            <thead><tr><Th>产品组</Th><Th>平台</Th><Th>动力</Th><Th>Leading Car</Th></tr></thead>
            <tbody>
              {pgs.map((pg) => (
                <tr key={pg.name}>
                  <Td style={{ fontWeight: 600 }}>{pg.name}</Td>
                  <Td>{pg.platform}</Td>
                  <Td>{pg.powertrain}</Td>
                  <Td style={{ fontSize: 12 }}>{pg.leading}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Impact Analysis 分类" accent="#d29922">
          <Table>
            <thead><tr><Th>产品组</Th><Th>分类</Th><Th>参考</Th></tr></thead>
            <tbody>
              {impacts.map((ia) => (
                <tr key={ia.pg}>
                  <Td style={{ fontWeight: 600 }}>{ia.pg}</Td>
                  <Td><span style={{ background: ia.classification.includes("New") ? "#da3633" : "#d29922", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11 }}>{ia.classification}</span></Td>
                  <Td style={{ fontSize: 12, color: "#8b949e" }}>{ia.ref} {ia.refCar}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="按 SOP 节点分组" accent="#8957e5">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(sopGroups).map(([sop, groupHuts], idx) => (
            <div key={sop} style={{ flex: "1 1 300px", background: "#0d1117", border: "1px solid #30363d", borderLeft: `4px solid ${["#da3633", "#d29922", "#1f6feb"][idx % 3]}`, borderRadius: 6, padding: 12 }}>
              <div style={{ fontWeight: 700, color: "#e6edf3", marginBottom: 8 }}>SOP {sop} <span style={{ color: "#8b949e", fontSize: 12, fontWeight: 400 }}>Release Node {idx + 1} · {groupHuts.length} HUTs</span></div>
              <Table>
                <thead><tr><Th>JV</Th><Th>HUT</Th><Th>分类</Th></tr></thead>
                <tbody>
                  {groupHuts.map((h, i) => (
                    <tr key={i}>
                      <Td><span style={{ background: JV_COLOR[h.jv] || "#484f58", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{h.jv}</span></Td>
                      <Td style={{ fontSize: 12 }}>{h.hut.split(" VW")[0]}</Td>
                      <Td><span style={{ background: CLS_TAG[h.cls].color, color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>{CLS_TAG[h.cls].label}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </div>
      </Card>

      <Card title="PEP 类型对比" accent="#1f6feb">
        <Table>
          <thead><tr><Th>PEP 类型</Th><Th>范围</Th><Th>周期</Th><Th>状态</Th></tr></thead>
          <tbody>
            {pepComparison.map((p) => (
              <tr key={p.type} style={p.type === "PEP CEA" ? { background: "#1c2128" } : undefined}>
                <Td style={{ fontWeight: p.type === "PEP CEA" ? 700 : 400 }}>{p.type}</Td>
                <Td>{p.scope}</Td>
                <Td>{p.duration}</Td>
                <Td>{p.status}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function ComponentsTab({ components, domains, domainFilter, setDomainFilter, compSearch, setCompSearch }: {
  components: DataJson["componentManagement"]["components"];
  domains: string[];
  domainFilter: string;
  setDomainFilter: (v: string) => void;
  compSearch: string;
  setCompSearch: (v: string) => void;
}) {
  const grouped = domains.map((d) => ({ domain: d, items: components.filter((c) => c.domain === d) })).filter((g) => g.items.length > 0);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <StatCard value={components.length} label="组件总数" color="#58a6ff" />
        <StatCard value={domains.length} label="域" color="#238636" />
        <StatCard value={new Set(components.map((c) => c.supplier).filter(Boolean)).size} label="供应商" color="#d29922" />
        <StatCard value={components.filter((c) => c.asil).length} label="有 ASIL 标注" color="#da3633" />
      </div>

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
            <thead>
              <tr>
                <Th style={{ width: 90 }}>缩写</Th>
                <Th>全称</Th>
                <Th style={{ width: 100 }}>中文名</Th>
                <Th style={{ width: 50 }}>ASIL</Th>
                <Th style={{ width: 110 }}>FSM</Th>
                <Th style={{ width: 110 }}>BTV</Th>
                <Th style={{ width: 120 }}>供应商</Th>
                <Th style={{ width: 70 }}>FuSa</Th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((c) => (
                <tr key={c.abbreviation}>
                  <Td style={{ fontWeight: 700, color: "#58a6ff" }}>{c.abbreviation}</Td>
                  <Td style={{ fontSize: 12 }}>{c.fullName}</Td>
                  <Td style={{ fontSize: 12, color: "#8b949e" }}>{c.chineseName}</Td>
                  <Td>{c.asil ? <span style={{ background: "#da3633", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 700 }}>{c.asil}</span> : <span style={{ color: "#484f58" }}>—</span>}</Td>
                  <Td style={{ fontSize: 11 }}>{c.fsm || "—"}</Td>
                  <Td style={{ fontSize: 11 }}>{c.btv || "—"}</Td>
                  <Td style={{ fontSize: 11 }}>{c.supplier || "—"}</Td>
                  <Td style={{ fontSize: 11, color: "#8b949e" }}>{c.fuSaDevelopedBy || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

function DeliverablesTab({ deliverables }: { deliverables: DataJson["deliverables"] }) {
  const [phaseFilter, setPhaseFilter] = useState("all");
  const filtered = phaseFilter === "all" ? deliverables : deliverables.filter((p) => p.phase.startsWith(phaseFilter));
  const totalItems = deliverables.reduce((s, p) => s + p.items.length, 0);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <StatCard value={deliverables.length} label="Phase 数" color="#58a6ff" />
        <StatCard value={totalItems} label="交付物总数" color="#238636" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
          <option value="all">全部 Phase ({totalItems} 项)</option>
          {deliverables.map((p) => <option key={p.phase} value={p.phase.split(":")[0]}>{p.phase} ({p.items.length})</option>)}
        </select>
      </div>

      {filtered.map((p) => (
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
              </tr>
            </thead>
            <tbody>
              {p.items.map((item) => (
                <tr key={item.id}>
                  <Td style={{ fontWeight: 700, color: "#58a6ff" }}>{item.id}</Td>
                  <Td style={{ fontSize: 12 }}>{item.activity}</Td>
                  <Td>{item.deliverable}</Td>
                  <Td style={{ fontSize: 11, color: "#bc8cff" }}>{item.annex || "—"}</Td>
                  <Td style={{ fontSize: 11, color: "#bc8cff" }}>{item.isoRef}</Td>
                  <Td style={{ fontSize: 11 }}>{item.owner || "—"}</Td>
                  <Td style={{ fontSize: 11, color: "#8b949e" }}>{item.level || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

function TimelineTab({ milestones, pepCeaMilestones, mapping }: {
  milestones: DataJson["ceaKeyMilestones"];
  pepCeaMilestones: DataJson["pepCeaMilestones"];
  mapping: DataJson["safetyPepMapping"];
}) {
  return (
    <div>
      <Card title="PEP CEA 里程碑（32 个月，PS → SOP）" accent="#58a6ff">
        <Table>
          <thead><tr><Th style={{ width: 80 }}>里程碑</Th><Th style={{ width: 60 }}>月</Th><Th style={{ width: 60 }}>周</Th><Th>描述</Th></tr></thead>
          <tbody>
            {pepCeaMilestones.map((m) => (
              <tr key={m.name}>
                <Td style={{ fontWeight: 700 }}>{m.name}</Td>
                <Td>{m.month}M</Td>
                <Td>{m.week}W</Td>
                <Td style={{ fontSize: 12, color: "#8b949e" }}>{m.desc}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="CEA 开发关键里程碑（至 IPD 6.0 = CEA 2.0 HO 基线）" accent="#238636">
        <Table>
          <thead><tr><Th style={{ width: 160 }}>里程碑</Th><Th style={{ width: 60 }}>周</Th><Th style={{ width: 80 }}>功能等级</Th><Th>描述</Th></tr></thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.name} style={m.name === "IPD 6.0 (Homo)" ? { background: "#1c2128" } : undefined}>
                <Td style={{ fontWeight: m.name === "IPD 6.0 (Homo)" ? 700 : 400, color: m.name === "IPD 6.0 (Homo)" ? "#58a6ff" : "#e6edf3" }}>{m.name}</Td>
                <Td>{m.week}W</Td>
                <Td>{m.fnLevel ? <span style={{ background: m.fnLevel.includes("Release") ? "#238636" : "#1f6feb", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 700 }}>{m.fnLevel}</span> : <span style={{ color: "#484f58" }}>—</span>}</Td>
                <Td style={{ fontSize: 12, color: "#8b949e" }}>{m.desc}{m.isFreeze && <span style={{ marginLeft: 6, color: "#d29922", fontSize: 11 }}>🔒 Freeze</span>}{m.isHomoFreeze && <span style={{ marginLeft: 6, color: "#da3633", fontSize: 11 }}>🔒 Homo HW Freeze</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="安全活动与 PEP 里程碑映射" accent="#d29922">
        <Table>
          <thead><tr><Th style={{ width: 160 }}>安全活动</Th><Th style={{ width: 160 }}>PEP 里程碑</Th><Th style={{ width: 60 }}>PEP 周</Th><Th>时间窗口</Th><Th>说明</Th></tr></thead>
          <tbody>
            {mapping.map((m, i) => (
              <tr key={i}>
                <Td style={{ fontWeight: 600 }}>{m.safetyActivity}</Td>
                <Td style={{ fontSize: 12 }}>{m.pepMilestone}</Td>
                <Td>{m.pepWeek}W</Td>
                <Td style={{ fontSize: 11, color: "#8b949e" }}>{m.startWeek}W ~ {m.endWeek}W</Td>
                <Td style={{ fontSize: 11, color: "#8b949e" }}>{m.notes}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
