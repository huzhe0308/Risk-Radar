"use client";

import React, { useEffect, useMemo, useState } from "react";

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
};

type CompData = {
  components: Component[];
  vehicles: string[];
  domains: string[];
  suppliers: string[];
};

const API = "/api/safety-plan?token=123456";

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

const ASIL_COLOR: Record<string, string> = {
  "D": "#da3633", "C": "#d29922", "B": "#1f6feb", "A": "#3fb950", "QM": "#8b949e", "/": "#484f58", "": "#484f58",
};

const CEA_VERSION_VEHICLES: Record<string, string[]> = {
  "2.0": ["CMP21 CS A SUV MY27", "A SUVe MY28", "CMP21 CN A Main SUV BEV", "CMP21 CN A NB PHEV"],
  "2.1": ["CSP31 CS B NB BEV", "MEB31 CN ID4 PA MY28", "CMP21 CN A NB BEV MY27", "CSP31 CN B SUV BEV 5S", "A COSe MY28"],
  "2.2": ["CSP31 CN B SUV EREV 6S", "CMP21 CS A SUV PHEV", "CSP31 CS B NB EREV", "CSP31 CN B SUV EREV 5S"],
  "2.3": ["CSP31 CS A+ SUV BEV", "CSP31 CS A+ SUV EREV", "CSP31 CN B NB BEV"],
  "2.4": ["CSP31 CN B NB EREV"],
  "ALL": [],
};

export function EquipmentMatrixView() {
  const [compData, setCompData] = useState<CompData | null>(null);
  const [ceaVersion, setCeaVersion] = useState("ALL");
  const [domainFilter, setDomainFilter] = useState("");
  const [asilFilter, setAsilFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"matrix" | "supplier" | "detail">("matrix");

  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.data?.componentManagement) {
          setCompData(payload.data.componentManagement);
        } else {
          fetch("/safety-plan/data.json").then((r) => r.json()).then((d) => {
            if (d.componentManagement) setCompData(d.componentManagement);
          });
        }
      })
      .catch(() => {
        fetch("/safety-plan/data.json").then((r) => r.json()).then((d) => {
          if (d.componentManagement) setCompData(d.componentManagement);
        });
      });
  }, []);

  const filteredComponents = useMemo(() => {
    if (!compData) return [];
    return compData.components.filter((c) => {
      if (domainFilter && c.domain !== domainFilter) return false;
      if (asilFilter && c.asil !== asilFilter) return false;
      if (search) {
        const text = `${c.domain} ${c.abbreviation} ${c.fullName} ${c.chineseName} ${c.supplier} ${c.fsm} ${c.btv}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [compData, domainFilter, asilFilter, search]);

  const displayVehicles = useMemo(() => {
    if (!compData) return [];
    if (ceaVersion === "ALL") return compData.vehicles;
    return CEA_VERSION_VEHICLES[ceaVersion] || [];
  }, [compData, ceaVersion]);

  const domainGroups = useMemo(() => {
    const groups: Record<string, Component[]> = {};
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
  const totalVeh = compData.vehicles.length;
  const assigned = compData.components.filter((c) => c.supplier && c.supplier !== "/" && !c.supplier.includes("未定点")).length;

  const cellContent = (val: string) => {
    if (!val || !val.trim()) return <span style={{ color: "#484f58" }}>·</span>;
    if (val === "S" || val === "s") return <span style={{ color: "#f85149", fontWeight: 700, fontSize: 13 }}>✕</span>;
    if (val === "O" || val === "o") return <span style={{ color: "#d29922", fontWeight: 700, fontSize: 13 }}>●</span>;
    if (val === "/") return <span style={{ color: "#484f58" }}>/</span>;
    return <span style={{ color: "#58a6ff", fontSize: 10, fontWeight: 600 }}>{val}</span>;
  };

  return (
    <div style={{ padding: "16px 24px" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#58a6ff" }}>{totalComps}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>FuSa Components</div>
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#3fb950" }}>{totalVeh}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>Vehicle Projects</div>
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#8957e5" }}>{compData.domains.length}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>Domains</div>
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#d29922" }}>{assigned}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>Supplier Assigned</div>
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 12px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f85149" }}>{totalComps - assigned}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>Unassigned</div>
        </div>
      </div>

      {view === "matrix" && (
        <Card title={`Equipment Matrix — ${filteredComponents.length} components × ${displayVehicles.length} vehicles`} accent="#58a6ff">
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={ceaVersion} onChange={(e) => setCeaVersion(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}>
              <option value="ALL">All CEA Versions ({compData.vehicles.length} vehicles)</option>
              <option value="2.0">CEA 2.0 ({CEA_VERSION_VEHICLES["2.0"].length})</option>
              <option value="2.1">CEA 2.1 ({CEA_VERSION_VEHICLES["2.1"].length})</option>
              <option value="2.2">CEA 2.2 ({CEA_VERSION_VEHICLES["2.2"].length})</option>
              <option value="2.3">CEA 2.3 ({CEA_VERSION_VEHICLES["2.3"].length})</option>
              <option value="2.4">CEA 2.4 ({CEA_VERSION_VEHICLES["2.4"].length})</option>
            </select>
            <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}>
              <option value="">All Domains</option>
              {compData.domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={asilFilter} onChange={(e) => setAsilFilter(e.target.value)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}>
              <option value="">All ASIL</option>
              {asilOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search components..." style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 4, padding: "4px 8px", fontSize: 12, minWidth: 200 }} />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11, color: "#6e7681" }}>
            <span><span style={{ color: "#f85149", fontWeight: 700 }}>✕</span> = S (Standard)</span>
            <span><span style={{ color: "#d29922", fontWeight: 700 }}>●</span> = O (Optional)</span>
            <span><span style={{ color: "#484f58" }}>/</span> = Not applicable</span>
            <span><span style={{ color: "#484f58" }}>·</span> = Not defined</span>
          </div>

          <div style={{ overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th style={{ position: "sticky", left: 0, zIndex: 3, minWidth: 50 }}>Domain</Th>
                  <Th style={{ position: "sticky", left: 50, zIndex: 3, minWidth: 50 }}>Abbr</Th>
                  <Th style={{ position: "sticky", left: 100, zIndex: 3, minWidth: 160 }}>Full Name</Th>
                  <Th style={{ minWidth: 100 }}>Supplier</Th>
                  <Th style={{ width: 50 }}>ASIL</Th>
                  {displayVehicles.map((v) => (
                    <Th key={v} style={{ textAlign: "center", maxWidth: 80, fontSize: 10 }} title={v}>
                      {v.length > 10 ? v.substring(0, 8) + ".." : v}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(domainGroups).map(([domain, comps]) => (
                  <React.Fragment key={domain}>
                    <tr>
                      <td colSpan={5 + displayVehicles.length} style={{ background: "#21262d", color: "#79c0ff", padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>{domain} <span style={{ color: "#8b949e", fontWeight: 400, fontSize: 11 }}>· {comps.length} components</span></td>
                    </tr>
                    {comps.map((c, idx) => {
                      const supShort = (c.supplier || "").split("\n")[0].trim();
                      return (
                        <tr key={idx}>
                          <Td style={{ position: "sticky", left: 0, background: "#0d1117", fontSize: 10, color: "#6e7681" }}>{c.loadType || ""}</Td>
                          <Td style={{ position: "sticky", left: 50, background: "#0d1117", fontWeight: 700, color: "#58a6ff" }}>{c.abbreviation || ""}</Td>
                          <Td style={{ position: "sticky", left: 100, background: "#0d1117" }}>
                            <div>{c.fullName || ""}</div>
                            <div style={{ fontSize: 10, color: "#6e7681" }}>{c.chineseName || ""}</div>
                          </Td>
                          <Td style={{ fontSize: 11, color: "#8b949e" }}>{supShort || "—"}</Td>
                          <Td>{c.asil ? <span style={{ background: ASIL_COLOR[c.asil] || "#484f58", color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{c.asil}</span> : <span style={{ color: "#484f58" }}>—</span>}</Td>
                          {displayVehicles.map((v) => {
                            const val = (c.vehicleApplicability || {})[v] || "";
                            return (
                              <td key={v} style={{ textAlign: "center", borderBottom: "1px solid #30363d", padding: "4px 6px", background: val ? "rgba(31,111,235,.03)" : "transparent" }} title={`${v}: ${val || "not defined"}`}>
                                {cellContent(val)}
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
                {filteredComponents.map((c, i) => (
                  <tr key={i}>
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
