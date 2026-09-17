"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

type Component = {
  domain: string;
  loadType: string;
  abbreviation: string;
  fullName: string;
  chineseName: string;
  fsm: string;
  btv: string;
  supplier: string;
  asil: string;
  vehicleApplicability: Record<string, string>;
  [key: string]: any;
};

type CompData = {
  components: Component[];
  vehicles: string[];
  domains: string[];
  suppliers: string[];
};

type FullData = {
  componentManagement?: CompData;
  [key: string]: any;
};

const API = "/api/safety-plan?token=123456";

const OEM_COLOR: Record<string, string> = { SVW: "#1f6feb", FAW: "#238636", VWA: "#8957e5" };
const CEA_COLOR: Record<string, string> = { "2.0": "#1f6feb", "2.1": "#238636", "2.2": "#d29922", "2.3": "#8957e5", "2.4": "#da3633" };

const VEHICLE_COLS: Array<{ key: string; display: string; oem: string; cea: string; line: string }> = [
  { key: "CMP21 CS A SUV MY27", display: "CMP21 CS A SUV MY27 SVW", oem: "SVW", cea: "2.0", line: "Line 1" },
  { key: "A SUVe MY28", display: "MEB31 CM A SUVe MY28 VWA", oem: "VWA", cea: "2.0", line: "Line 1" },
  { key: "CMP21 CN A Main SUV BEV", display: "CMP21 CN A Main SUV BEV FAW", oem: "FAW", cea: "2.0", line: "Line 1" },
  { key: "CMP21 CN A NB PHEV", display: "CMP21 CN A NB PHEV FAW", oem: "FAW", cea: "2.0", line: "L1 21kW" },
  { key: "CSP31 CS B NB BEV", display: "CSP31 CS B NB BEV SVW", oem: "SVW", cea: "2.1", line: "Line 1" },
  { key: "MEB31 CN ID4 PA MY28", display: "MEB31 CN ID4 PA MY28 FAW", oem: "FAW", cea: "2.1", line: "Line 1" },
  { key: "CMP21 CN A NB BEV MY27", display: "CMP21 CN A NB BEV MY27 FAW", oem: "FAW", cea: "2.1", line: "Line 1" },
  { key: "CSP31 CN B SUV BEV 5S", display: "CSP31 CN B SUV BEV 5S FAW", oem: "FAW", cea: "2.1", line: "Line 1" },
  { key: "A COSe MY28", display: "MEB31 CM A COSe MY28 VWA", oem: "VWA", cea: "2.1", line: "Line 1" },
  { key: "CSP31 CN B SUV EREV 6S", display: "CSP31 CN B SUV EREV 6S FAW", oem: "FAW", cea: "2.2", line: "Line 1" },
  { key: "CMP21 CS A SUV PHEV", display: "CMP21 CS A SUV PHEV SVW", oem: "SVW", cea: "2.2", line: "Line 1" },
  { key: "CSP31 CS B NB EREV", display: "CSP31 CS B NB EREV SVW", oem: "SVW", cea: "2.2", line: "Line 1" },
  { key: "CSP31 CN B SUV EREV 5S", display: "CSP31 CN B SUV EREV 5S FAW", oem: "FAW", cea: "2.2", line: "Line 1" },
  { key: "CSP31 CS A+ SUV BEV", display: "CSP31 CS A+ SUV BEV SVW", oem: "SVW", cea: "2.3", line: "Line 1" },
  { key: "CSP31 CS A+ SUV EREV", display: "CSP31 CS A+ SUV EREV SVW", oem: "SVW", cea: "2.3", line: "Line 1" },
  { key: "CSP31 CN B NB BEV", display: "CSP31 CN B NB BEV FAW", oem: "FAW", cea: "2.3", line: "Line 1" },
  { key: "CSP31 CN B NB EREV", display: "CSP31 CN B NB EREV FAW", oem: "FAW", cea: "2.4", line: "Line 1" },
];

const CEA_GROUPS = [
  { version: "2.0", label: "CEA 2.0", color: CEA_COLOR["2.0"] },
  { version: "2.1", label: "CEA 2.1", color: CEA_COLOR["2.1"] },
  { version: "2.2", label: "CEA 2.2", color: CEA_COLOR["2.2"] },
  { version: "2.3", label: "CEA 2.3", color: CEA_COLOR["2.3"] },
  { version: "2.4", label: "CEA 2.4", color: CEA_COLOR["2.4"] },
];

const ASIL_COLOR: Record<string, string> = {
  D: "#da3633", C: "#d29922", B: "#1f6feb", A: "#3fb950", QM: "#8b949e", "/": "#484f58", "": "#484f58",
};

const DOMAIN_COLORS: Record<string, string> = {
  "ADAS System L2": "#1f6feb",
  "ADAS System L2++": "#8957e5",
  "ADAS System L3": "#da3633",
  "Body System": "#238636",
  "Chassis System": "#d29922",
  "Core Control Unit": "#58a6ff",
  "Powertrain": "#f85149",
};

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ background: "#21262d", color: "#f0f6fc", padding: "6px 8px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12, ...style }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "4px 8px", borderBottom: "1px solid #30363d", verticalAlign: "top", fontSize: 12, ...style }}>{children}</td>;
}
function Card({ children, title, accent }: { children: React.ReactNode; title?: string; accent?: string }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderLeft: accent ? `4px solid ${accent}` : undefined, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      {title && <h3 style={{ color: "#79c0ff", fontSize: 15, marginBottom: 10 }}>{title}</h3>}
      {children}
    </div>
  );
}

export function EquipmentMatrixView() {
  const [fullData, setFullData] = useState<FullData | null>(null);
  const [compData, setCompData] = useState<CompData | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<FullData | null>(null);
  const [ceaFilter, setCeaFilter] = useState("ALL");
  const [domainFilter, setDomainFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"matrix" | "supplier" | "detail">("matrix");

  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then((payload) => {
        const d: FullData = payload?.data || {};
        if (d.componentManagement) {
          setFullData(d);
          setCompData(d.componentManagement);
          dataRef.current = d;
        } else {
          fetch("/safety-plan/data.json").then((r) => r.json()).then((dj: FullData) => {
            setFullData(dj);
            setCompData(dj.componentManagement);
            dataRef.current = dj;
          });
        }
      })
      .catch(() => {
        fetch("/safety-plan/data.json").then((r) => r.json()).then((dj: FullData) => {
          setFullData(dj);
          setCompData(dj.componentManagement);
          dataRef.current = dj;
        });
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

  const toggleCell = useCallback((compIndex: number, vehicleKey: string) => {
    setFullData((prev) => {
      if (!prev?.componentManagement) return prev;
      const newComps = [...prev.componentManagement.components];
      const comp = { ...newComps[compIndex] };
      const va = { ...(comp.vehicleApplicability || {}) };
      const cur = va[vehicleKey] || "";
      va[vehicleKey] = cur === "S" || cur === "s" ? "" : "S";
      comp.vehicleApplicability = va;
      newComps[compIndex] = comp;
      const newData = { ...prev, componentManagement: { ...prev.componentManagement, components: newComps } };
      dataRef.current = newData;
      return newData;
    });
    setCompData((prev) => {
      if (!prev) return prev;
      const newComps = [...prev.components];
      const comp = { ...newComps[compIndex] };
      const va = { ...(comp.vehicleApplicability || {}) };
      const cur = va[vehicleKey] || "";
      va[vehicleKey] = cur === "S" || cur === "s" ? "" : "S";
      comp.vehicleApplicability = va;
      newComps[compIndex] = comp;
      return { ...prev, components: newComps };
    });
    autoSave();
  }, [autoSave]);

  const displayVehicles = useMemo(() => {
    if (ceaFilter === "ALL") return VEHICLE_COLS;
    return VEHICLE_COLS.filter((v) => v.cea === ceaFilter);
  }, [ceaFilter]);

  const filteredComponents = useMemo(() => {
    if (!compData) return [];
    return compData.components.map((c, idx) => ({ ...c, _idx: idx })).filter((c) => {
      if (domainFilter && c.domain !== domainFilter) return false;
      if (search) {
        const text = `${c.domain} ${c.abbreviation} ${c.fullName} ${c.chineseName} ${c.supplier} ${c.fsm} ${c.btv}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [compData, domainFilter, search]);

  const domainGroups = useMemo(() => {
    const groups: Record<string, Array<Component & { _idx: number }>> = {};
    filteredComponents.forEach((c) => {
      const d = c.domain || "Other";
      if (!groups[d]) groups[d] = [];
      groups[d].push(c);
    });
    return groups;
  }, [filteredComponents]);

  const asilOptions = useMemo(() => {
    if (!compData) return [];
    return [...new Set(compData.components.map((c) => c.asil).filter(Boolean))].sort();
  }, [compData]);

  if (!compData) return <div style={{ padding: 40, color: "#8b949e" }}>Loading Equipment Matrix…</div>;

  const totalComps = compData.components.length;
  const totalVeh = VEHICLE_COLS.length;
  const assigned = compData.components.filter((c) => c.supplier && c.supplier !== "/" && !c.supplier.includes("未定点")).length;

  const cellContent = (val: string) => {
    if (!val || !val.trim()) return "";
    if (val === "S" || val === "s") return "✕";
    if (val === "O" || val === "o") return "●";
    if (val === "/") return "/";
    return val;
  };

  return (
    <div style={{ padding: "16px 24px" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e6edf3", margin: 0 }}>Vehicle Equipment Matrix</h2>
        <p style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>Mark X to indicate which equipment variant is assembled on which production line.</p>
        {saveStatus !== "idle" && (
          <span style={{ fontSize: 11, color: saveStatus === "saving" ? "#d29922" : "#3fb950", marginLeft: 8 }}>
            {saveStatus === "saving" ? "Saving…" : "Saved ✓"}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #30363d" }}>
          {[
            { key: "matrix", label: "Equipment Matrix" },
            { key: "supplier", label: "Supplier View" },
            { key: "detail", label: "Component Detail" },
          ].map((t) => (
            <button key={t.key} onClick={() => setView(t.key as typeof view)} style={{ background: view === t.key ? "#1f6feb" : "#161b22", color: view === t.key ? "#fff" : "#8b949e", border: "none", padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{t.label}</button>
          ))}
        </div>
      </div>

      {view === "matrix" && (
        <Card title={`Equipment Matrix — ${filteredComponents.length} components × ${displayVehicles.length} vehicles`} accent="#58a6ff">
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={ceaFilter} onChange={(e) => setCeaFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}>
              <option value="ALL">All CEA Versions ({VEHICLE_COLS.length} vehicles)</option>
              {CEA_GROUPS.map((g) => {
                const cnt = VEHICLE_COLS.filter((v) => v.cea === g.version).length;
                return <option key={g.version} value={g.version}>{g.label} ({cnt})</option>;
              })}
            </select>
            <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}>
              <option value="">All Domains</option>
              {compData.domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search components..." style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12, minWidth: 200 }} />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11, color: "#6e7681" }}>
            <span>Click a cell to toggle <span style={{ color: "#f85149", fontWeight: 700 }}>✕</span> (Standard) on/off</span>
            <span><span style={{ color: "#484f58" }}>·</span> = Not defined</span>
          </div>

          <div style={{ overflow: "auto", maxHeight: "78vh", border: "1px solid #30363d", borderRadius: 6, position: "relative" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  {[
                    { label: "Equipment System", w: 130, left: 0 },
                    { label: "Variant", w: 80, left: 130 },
                    { label: "Full Name", w: 170, left: 210 },
                    { label: "Supplier", w: 100, left: 380 },
                    { label: "ASIL", w: 50, left: 480 },
                  ].map((col) => (
                    <th key={col.label} style={{
                      background: "#21262d", color: "#f0f6fc", padding: "8px 10px",
                      position: "sticky", top: 0, zIndex: 5,
                      left: col.left, minWidth: col.w, textAlign: "left", fontWeight: 600, fontSize: 12,
                      borderBottom: "2px solid #30363d", borderRight: "1px solid #30363d",
                    }}>
                      {col.label}
                    </th>
                  ))}
                  {displayVehicles.map((v) => (
                    <th key={v.key} style={{
                      position: "sticky", top: 0, zIndex: 5,
                      background: "#21262d", borderBottom: `3px solid ${CEA_COLOR[v.cea] || "#30363d"}`,
                      borderRight: "1px solid #30363d",
                      padding: "6px 8px", textAlign: "center", minWidth: 130, maxWidth: 150,
                      verticalAlign: "top",
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                        <span style={{
                          display: "inline-block", background: `${CEA_COLOR[v.cea]}22`, color: CEA_COLOR[v.cea],
                          padding: "1px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                        }}>
                          CEA {v.cea}
                        </span>
                        <span style={{ fontSize: 11, color: "#e6edf3", fontWeight: 600, lineHeight: 1.35, wordBreak: "break-word", whiteSpace: "normal" }}>
                          {v.display.replace(/ (SVW|FAW|VWA)$/, "")}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: OEM_COLOR[v.oem] }}>{v.oem}</span>
                        <span style={{ fontSize: 9, color: "#6e7681", marginTop: 1 }}>{v.line}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(domainGroups).map(([domain, comps]) => (
                  <React.Fragment key={domain}>
                    <tr>
                      <td colSpan={5 + displayVehicles.length} style={{
                        background: "#21262d", color: DOMAIN_COLORS[domain] || "#79c0ff",
                        padding: "5px 10px", fontSize: 12, fontWeight: 700,
                        position: "sticky", left: 0, zIndex: 2,
                        borderTop: "1px solid #30363d", borderBottom: "1px solid #30363d",
                      }}>
                        {domain} <span style={{ color: "#8b949e", fontWeight: 400, fontSize: 11 }}>· {comps.length} components</span>
                      </td>
                    </tr>
                    {comps.map((c) => {
                      const supShort = (c.supplier || "").split("\n")[0].trim();
                      return (
                        <tr key={c._idx} style={{ height: 32 }}>
                          <td style={{ position: "sticky", left: 0, background: "#0d1117", fontSize: 10, color: "#6e7681", padding: "4px 10px", borderBottom: "1px solid #30363d", borderRight: "1px solid #30363d", zIndex: 3 }}>{c.loadType || ""}</td>
                          <td style={{ position: "sticky", left: 130, background: "#0d1117", fontWeight: 700, color: "#58a6ff", padding: "4px 8px", borderBottom: "1px solid #30363d", borderRight: "1px solid #30363d", fontSize: 12, zIndex: 3 }}>{c.abbreviation || ""}</td>
                          <td style={{ position: "sticky", left: 210, background: "#0d1117", padding: "4px 8px", borderBottom: "1px solid #30363d", borderRight: "1px solid #30363d", zIndex: 3 }}>
                            <div style={{ fontSize: 12, color: "#e6edf3", whiteSpace: "normal", wordBreak: "break-word" }}>{c.fullName || ""}</div>
                            <div style={{ fontSize: 10, color: "#6e7681" }}>{c.chineseName || ""}</div>
                          </td>
                          <td style={{ position: "sticky", left: 380, background: "#0d1117", fontSize: 11, color: "#8b949e", padding: "4px 8px", borderBottom: "1px solid #30363d", borderRight: "1px solid #30363d", zIndex: 3 }}>{supShort || "—"}</td>
                          <td style={{ position: "sticky", left: 480, background: "#0d1117", textAlign: "center", padding: "4px 6px", borderBottom: "1px solid #30363d", borderRight: "1px solid #30363d", zIndex: 3 }}>
                            {c.asil ? <span style={{ background: ASIL_COLOR[c.asil] || "#484f58", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{c.asil}</span> : <span style={{ color: "#484f58" }}>—</span>}
                          </td>
                          {displayVehicles.map((v) => {
                            const val = (c.vehicleApplicability || {})[v.key] || "";
                            const isX = val === "S" || val === "s";
                            return (
                              <td
                                key={v.key}
                                onClick={() => toggleCell(c._idx, v.key)}
                                style={{
                                  textAlign: "center",
                                  borderBottom: "1px solid #30363d",
                                  borderRight: "1px solid #30363d",
                                  padding: 0,
                                  cursor: "pointer",
                                  background: isX ? "rgba(248,81,73,.18)" : "transparent",
                                  transition: "background .12s",
                                  userSelect: "none",
                                }}
                                onMouseEnter={(e) => { if (!isX) (e.currentTarget as HTMLTableCellElement).style.background = "rgba(88,166,255,.08)"; }}
                                onMouseLeave={(e) => { if (!isX) (e.currentTarget as HTMLTableCellElement).style.background = "transparent"; }}
                                title={`${v.display}: ${isX ? "✕ (Standard)" : "Not defined — click to toggle"}`}
                              >
                                {isX ? (
                                  <span style={{ color: "#f85149", fontWeight: 700, fontSize: 14, display: "inline-block", lineHeight: "32px" }}>✕</span>
                                ) : (
                                  <span style={{ color: "#484f58", fontSize: 12, display: "inline-block", lineHeight: "32px" }}>·</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === "supplier" && (
        <Card title={`Supplier View — ${compData.suppliers.length} suppliers`} accent="#238636">
          <div style={{ overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th style={{ minWidth: 150 }}>Supplier</Th>
                  <Th style={{ width: 60 }}>Count</Th>
                  <Th style={{ width: 80 }}>ASILs</Th>
                  <Th>Components</Th>
                </tr>
              </thead>
              <tbody>
                {compData.suppliers.map((sup) => {
                  const supComps = compData.components.filter((c) => (c.supplier || "").split("\n")[0].trim() === sup);
                  const asils = [...new Set(supComps.map((c) => c.asil).filter(Boolean))].sort();
                  return (
                    <tr key={sup}>
                      <Td style={{ fontWeight: 600, color: "#3fb950" }}>{sup}</Td>
                      <Td style={{ fontWeight: 700, color: "#58a6ff" }}>{supComps.length}</Td>
                      <Td>{asils.map((a) => <span key={a} style={{ background: ASIL_COLOR[a] || "#484f58", color: "#fff", padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 700, marginRight: 2 }}>{a}</span>)}</Td>
                      <Td style={{ fontSize: 11, color: "#8b949e" }}>{supComps.map((c) => c.abbreviation).join(", ")}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === "detail" && (
        <Card title="Component Detail" accent="#8957e5">
          <div style={{ marginBottom: 12 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, abbr, domain..." style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", maxWidth: 400 }} />
          </div>
          <div style={{ overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th style={{ width: 50 }}>Abbr</Th>
                  <Th style={{ minWidth: 180 }}>Full Name</Th>
                  <Th style={{ width: 100 }}>Domain</Th>
                  <Th style={{ width: 50 }}>ASIL</Th>
                  <Th style={{ width: 120 }}>FSM/FSE</Th>
                  <Th style={{ width: 120 }}>BTV</Th>
                  <Th style={{ width: 100 }}>Supplier</Th>
                  <Th style={{ width: 80 }}>Load Type</Th>
                  <Th style={{ width: 80 }}>Power Supply</Th>
                  <Th style={{ width: 100 }}>FuSa By</Th>
                  <Th>Remark</Th>
                </tr>
              </thead>
              <tbody>
                {filteredComponents.map((c) => (
                  <tr key={c._idx}>
                    <Td style={{ fontWeight: 700, color: "#58a6ff" }}>{c.abbreviation || "—"}</Td>
                    <Td>
                      <div>{c.fullName || "—"}</div>
                      <div style={{ fontSize: 10, color: "#6e7681" }}>{c.chineseName || ""}</div>
                    </Td>
                    <Td style={{ fontSize: 11, color: "#8b949e" }}>{c.domain || "—"}</Td>
                    <Td>{c.asil ? <span style={{ background: ASIL_COLOR[c.asil] || "#484f58", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{c.asil}</span> : "—"}</Td>
                    <Td style={{ fontSize: 10, color: "#8b949e" }}>{c.fsm || "—"}</Td>
                    <Td style={{ fontSize: 10, color: "#8b949e" }}>{c.btv || "—"}</Td>
                    <Td style={{ fontSize: 11, color: "#3fb950" }}>{(c.supplier || "").split("\n")[0].trim() || "—"}</Td>
                    <Td style={{ fontSize: 10, color: "#6e7681" }}>{c.loadType || "—"}</Td>
                    <Td style={{ fontSize: 10, color: "#6e7681" }}>{c.powerSupply || "—"}</Td>
                    <Td style={{ fontSize: 10, color: "#6e7681" }}>{c.fuSaDevelopedBy || "—"}</Td>
                    <Td style={{ fontSize: 11, color: "#8b949e" }}>{c.remark || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
