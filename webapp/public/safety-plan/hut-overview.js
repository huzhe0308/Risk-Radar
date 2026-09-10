// ============================================================
// HUT OVERVIEW TAB — fusa_plan_overview.html content
// ============================================================
function renderHutOverview() {
  renderHutStats();
  renderHutTable();
  renderSopGroups();
  renderHutMsTable();
  renderHutLayerTable();
  renderHutClsTable();
  renderHutIpdMsTable();
  renderHutPepCeaMsTable();
}

function renderHutStats() {
  document.getElementById('hut-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">17</div><div class="stat-label">Total Huts</div></div>
    <div class="stat-card red"><div class="stat-value">2</div><div class="stat-label">All-New</div></div>
    <div class="stat-card orange"><div class="stat-value">10</div><div class="stat-label">New Variant</div></div>
    <div class="stat-card green"><div class="stat-value">5</div><div class="stat-label">Carry-Over</div></div>
    <div class="stat-card purple"><div class="stat-value">8</div><div class="stat-label">SOP Nodes</div></div>
  `;
}

var HUT_DATA = [
  { sop: '2027-05', jv: 'SVW', hut: 'CMP21 CS A SUV MY27 VW316/9CS_B1 2ECV6H', cea: 'CEA 2.0', prev: 'CEA 1.3 to 1.4', cls: 'carryover', desc: '2026 first ALS1(1.3) to ALS2(1.4) to MY27 upgrade CEA2.0' },
  { sop: '2027-05', jv: 'FAW', hut: 'CMP21 CN A NB PHEV VW311/1CN_P 2EFV6H', cea: 'CEA 2.0', prev: '-', cls: 'newvar', desc: 'New powertrain PHEV, CMP21 platform first PHEV' },
  { sop: '2027-05', jv: 'FAW', hut: 'CMP21 CN A Main SUV BEV VW316/9CN_B 2EGV6H', cea: 'CEA 2.0', prev: '-', cls: 'newvar', desc: 'FAW CMP21 Main SUV, new JV variant' },
  { sop: '2027-08', jv: 'FAW', hut: 'CMP21 CN A NB MY27 VW311/1CN_B1 2EF001', cea: 'CEA 2.1', prev: 'CEA 1.4', cls: 'carryover', desc: '2026 first (1.4) to MY27 upgrade CEA2.1' },
  { sop: '2027-08', jv: 'SVW', hut: 'CMP21 CS A SUV PHEV VW316/9CS_P 2EPV6K', cea: 'CEA 2.2', prev: '-', cls: 'newvar', desc: 'New powertrain PHEV, SVW side' },
  { sop: '2027-08', jv: 'SVW', hut: 'CSP31 CS B NB BEV VW423/1CS_B CS0V6K', cea: 'CEA 2.1', prev: '-', cls: 'allnew', desc: 'CSP31 platform first vehicle, all-new EE topology' },
  { sop: '2027-09', jv: 'VWA', hut: 'MEB31 CM A SUVe MY28 VW316/8CM_B1 11H001', cea: 'CEA 2.0', prev: 'CEA 1.3 (from 1.0 ACOSe)', cls: 'carryover', desc: '2026 first ALS1(1.3) to MY28 upgrade CEA2.0' },
  { sop: '2027-09', jv: 'FAW', hut: 'MEB31 CN ID4 PA MY28 VW316/6CN_B1 CN0001', cea: 'CEA 2.1', prev: 'CEA 1.3 (from 1.0 ACOSe)', cls: 'carryover', desc: '2026 first (1.3) to MY28 upgrade CEA2.1' },
  { sop: '2027-09', jv: 'VWA', hut: 'MEB31 CM A COSe MY28 VW313/2CM_B1 11M001', cea: 'CEA 2.1', prev: 'CEA 1.3 to 1.4 (from 1.0 ACOSe)', cls: 'carryover', desc: '2026 first ALS1(1.3) to ALS2(1.4) to MY28 upgrade CEA2.1' },
  { sop: '2027-10', jv: 'FAW', hut: 'CSP31 CN B SUV BEV 5S VW416/6CN_B CN5V6I', cea: 'CEA 2.1', prev: '-', cls: 'newvar', desc: 'CSP31 platform SUV 5-seat variant' },
  { sop: '2027-10', jv: 'SVW', hut: 'CSP31 CS B NB EREV VW423/1CS_E CS0V6I', cea: 'CEA 2.2', prev: '-', cls: 'newvar', desc: 'New powertrain EREV, SVW NB' },
  { sop: '2027-11', jv: 'FAW', hut: 'CSP31 CN B SUV EREV 5S VW416/6CN_E CN5001', cea: 'CEA 2.2', prev: '-', cls: 'newvar', desc: 'New PT EREV + FAW SUV 5S' },
  { sop: '2028-01', jv: 'SVW', hut: 'CSP31 CS A+ SUV BEV VW326/6CS_B CS2V6E', cea: 'CEA 2.3', prev: '-', cls: 'allnew', desc: 'CSP31B platform A+ SUV first launch' },
  { sop: '2028-03', jv: 'FAW', hut: 'CSP31 CN B NB BEV VW423/1CN_B CN4V6E', cea: 'CEA 2.3', prev: '-', cls: 'newvar', desc: 'FAW CS B NB BEV' },
  { sop: '2028-03', jv: 'FAW', hut: 'CSP31 CN B NB EREV VW423/1CN_E CN4V6F', cea: 'CEA 2.4', prev: '-', cls: 'newvar', desc: 'FAW CS B NB + EREV' },
  { sop: '2028-03', jv: 'SVW', hut: 'CSP31 CS A+ SUV EREV VW326/6CS_E CS2001', cea: 'CEA 2.3', prev: '-', cls: 'newvar', desc: 'A+ SUV + EREV variant' },
  { sop: '2028-10', jv: 'FAW', hut: 'CSP31 CN B SUV EREV 6S VW416/5CN_E CN2V6I', cea: 'CEA 2.2', prev: '-', cls: 'newvar', desc: '5S to 6S body variant' }
];

function hutClsTag(cls) {
  if (cls === 'allnew') return '<span class="hut-cls-tag hut-cls-allnew">ALL-NEW</span>';
  if (cls === 'newvar') return '<span class="hut-cls-tag hut-cls-newvar">NEW VARIANT</span>';
  return '<span class="hut-cls-tag hut-cls-carryover">CARRY-OVER</span>';
}
function hutJvTag(jv) {
  return '<span class="hut-jv-tag hut-jv-' + jv.toLowerCase() + '">' + jv + '</span>';
}

function renderHutTable() {
  var html = '<thead><tr><th style="width:30px">#</th><th style="width:75px">SOP</th><th style="width:50px">JV</th><th>Hut Name</th><th style="width:80px">CEA 2.X</th><th style="width:100px">CEA 1.X Prev</th><th style="width:110px">Classification</th><th>Description</th></tr></thead><tbody>';
  HUT_DATA.forEach(function(h, i) {
    html += '<tr><td>' + (i+1) + '</td><td class="font-bold">' + h.sop + '</td><td>' + hutJvTag(h.jv) + '</td><td class="text-sm">' + h.hut + '</td><td><span class="hut-cea-tag">' + h.cea + '</span></td><td class="text-xs muted">' + h.prev + '</td><td>' + hutClsTag(h.cls) + '</td><td class="text-xs muted">' + h.desc + '</td></tr>';
  });
  html += '</tbody>';
  document.getElementById('hut-table').innerHTML = html;
}

function renderSopGroups() {
  var groups = {};
  HUT_DATA.forEach(function(h) {
    if (!groups[h.sop]) groups[h.sop] = [];
    groups[h.sop].push(h);
  });
  var sopDates = Object.keys(groups).sort();
  var html = '';
  sopDates.forEach(function(sop, idx) {
    var huts = groups[sop];
    var color = idx % 3 === 0 ? 'var(--red)' : idx % 3 === 1 ? 'var(--orange)' : 'var(--blue)';
    html += '<div class="hut-sop-group" style="border-left-color:' + color + '">';
    html += '<div class="hut-sop-header">SOP ' + sop + ' <span class="hut-sop-count">' + huts.length + ' Hut' + (huts.length > 1 ? 's' : '') + '</span> <span style="color:var(--muted);font-size:12px;font-weight:400">Release Node ' + (idx+1) + '</span></div>';
    html += '<table><thead><tr><th>JV</th><th>Hut</th><th>CEA</th><th>Classification</th></tr></thead><tbody>';
    huts.forEach(function(h) {
      html += '<tr><td>' + hutJvTag(h.jv) + '</td><td class="text-sm">' + h.hut.split(' VW')[0] + '</td><td><span class="hut-cea-tag">' + h.cea + '</span></td><td>' + hutClsTag(h.cls) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  });
  document.getElementById('sop-groups').innerHTML = html;
}

var HUT_ITERATIONS = ['IPD3.0','IPD4.0','IPD5.0','IPD6.0','IPD7.0','CEA 2.0','CEA 2.0.5','CEA 2.1','CEA 2.1.5','CEA 2.2','CEA 2.2.5','CEA 2.3','CEA 2.3.5','CEA 2.4','CEA 2.4.5','CEA 2.5','CEA 2.5.5','CEA 2.6'];
var HUT_MILESTONES = [
  { name: 'IPD Kick Off', dates: ['02-09','04-13','06-08','08-03','10-19','11-30','02-15','03-29','05-10','06-21','08-02','09-13','10-25','01-03','02-14','03-27','05-08','06-19'] },
  { name: 'HW Baseline Freeze', dates: ['03-06','05-01','06-26','08-07','10-23','12-04','02-19','04-02','05-14','06-25','08-06','09-17','10-29','01-07','02-18','03-31','05-12','06-23'] },
  { name: 'Function Dadian JIRA L3&PRD Freeze', dates: ['03-13','05-08','07-03','08-28','11-06','12-18','03-05','04-16','05-28','07-09','08-21','10-01','11-12','01-21','03-03','04-14','05-26','07-07'] },
  { name: 'Specs &DBC Requirement Freeze', dates: ['04-03','05-29','07-24','09-18','11-13','12-25','03-12','04-23','06-04','07-16','08-27','10-08','11-19','01-28','03-10','04-21','06-02','07-14'] },
  { name: 'K-Matrix Release &SysRS Freeze', dates: ['04-24','06-19','08-14','10-09','11-27','01-15','03-26','05-07','06-18','07-30','09-10','10-22','12-03','02-11','03-24','05-05','06-16','07-28'] },
  { name: 'DI Start', dates: ['06-05','07-31','09-25','11-13','12-25','03-12','04-23','06-04','07-16','08-27','10-08','11-19','01-28','03-10','04-21','06-02','07-14','08-25'] },
  { name: 'PI HW TBT', dates: ['06-05','07-31','09-25','11-13','12-25','03-12','04-23','06-04','07-16','08-27','10-08','11-19','01-28','03-10','04-21','06-02','07-14','08-25'] },
  { name: 'PI Start (1st SW Submit)', dates: ['06-19','08-14','10-09','11-27','01-15','03-26','05-07','06-18','07-30','09-09','10-22','12-03','02-11','03-24','05-05','06-16','07-28','09-08'] },
  { name: 'IPD Platform Release Time', dates: ['07-31','09-24','11-20','01-15','03-12','05-07','06-18','07-30','09-10','10-22','12-03','01-14','03-24','05-05','06-16','07-28','09-08','10-20'] }
];

function renderHutMsTable() {
  var html = '<thead><tr><th>Milestone / FuSa Activity</th>';
  HUT_ITERATIONS.forEach(function(it) {
    html += '<th>' + it + '</th>';
  });
  html += '</tr></thead><tbody>';
  HUT_MILESTONES.forEach(function(ms) {
    html += '<tr><td><strong>' + ms.name + '</strong></td>';
    ms.dates.forEach(function(d) {
      html += '<td><span class="hut-ms-date">' + d + '</span></td>';
    });
    html += '</tr>';
  });
  html += '<tr class="hut-ms-fusa-row"><td><strong>FuSa Activity Mapping</strong></td><td colspan="' + HUT_ITERATIONS.length + '" class="hut-ms-fusa-placeholder">To be filled: which FuSa activities and deliverables should be completed at each iteration node (System-level / GX / Supplier)</td></tr>';
  html += '</tbody>';
  document.getElementById('hut-ms-table').innerHTML = html;
}

var HUT_LAYERS = [
  { layer: 'System-Level', badge: 'sys', owner: 'System/Subsystem FSE\\nSafety managed by FSM', scope: 'ISO 26262 Part 3 + Part 4 (system-level), 14 deliverables (Item Def to HARA to FSC/TSC to Safety Analysis to Integration to Validation to Safety Case)' },
  { layer: 'GX Embedded', badge: 'gx', owner: 'GX Team (In-house)', scope: 'ISO 26262 Part 2 + Part 4 + Part 5 + Part 6 + Part 7 + Part 8, receives FSR then follows V-model, produces GX Safety Case' },
  { layer: 'Supplier', badge: 'sup', owner: 'External Supplier\\nManaged by BTV', scope: '9 deliverables before BMG release + Safety Case + Release Report' }
];

function renderHutLayerTable() {
  var html = '<thead><tr><th>Layer</th><th>Owner</th><th>Deliverable Scope</th></tr></thead><tbody>';
  HUT_LAYERS.forEach(function(l) {
    html += '<tr><td><span class="hut-layer-badge hut-layer-' + l.badge + '">' + l.layer + '</span></td><td class="text-sm">' + l.owner.replace(/\\n/g, '<br>') + '</td><td class="text-xs muted">' + l.scope + '</td></tr>';
  });
  html += '</tbody>';
  document.getElementById('hut-layer-table').innerHTML = html;
}

var HUT_CLASSIFICATIONS = [
  { cls: 'allnew', name: 'ALL-NEW', impact: 'Not required', scope: 'Full three-layer FuSa activities (System 14 items + GX Part 2-8 + Supplier 9 items), from Item Definition all new', count: 2 },
  { cls: 'newvar', name: 'NEW VARIANT', impact: 'Required', scope: 'Impact Analysis determines which activities to reuse and which to delta-develop across three layers', count: 10 },
  { cls: 'carryover', name: 'CARRY-OVER', impact: 'Required', scope: 'Impact Analysis first to determine which activities can be reused', count: 5 }
];

function renderHutClsTable() {
  var html = '<thead><tr><th>Classification</th><th>Impact Analysis</th><th>Coverage</th><th>Count</th></tr></thead><tbody>';
  HUT_CLASSIFICATIONS.forEach(function(c) {
    html += '<tr><td>' + hutClsTag(c.cls) + '</td><td class="text-sm">' + c.impact + '</td><td class="text-xs muted">' + c.scope + '</td><td class="font-bold">' + c.count + '</td></tr>';
  });
  html += '</tbody>';
  document.getElementById('hut-cls-table').innerHTML = html;
}

var HUT_IPD_MS = [
  { name: 'IPD Kick Off', desc: 'Iteration start' },
  { name: 'HW Baseline Freeze', desc: 'Hardware baseline freeze' },
  { name: 'Function Dadian JIRA L3&PRD Freeze', desc: 'Function milestone + L3/PRD freeze' },
  { name: 'Specs &DBC Requirement Freeze', desc: 'Specs + DBC requirements freeze' },
  { name: 'K-Matrix Release &SysRS Freeze', desc: 'K-matrix release + system requirements freeze' },
  { name: 'DI Start', desc: 'DI start' },
  { name: 'PI HW TBT', desc: 'PI hardware TBT' },
  { name: 'PI Start (1st SW Submit)', desc: 'PI start (first software submit)' },
  { name: 'IPD Platform Release Time', desc: 'IPD platform release' }
];

function renderHutIpdMsTable() {
  var html = '<thead><tr><th>PEP Milestone</th><th>Description</th><th>FuSa Activity / Deliverable</th></tr></thead><tbody>';
  HUT_IPD_MS.forEach(function(m) {
    html += '<tr><td class="font-bold">' + m.name + '</td><td class="text-sm">' + m.desc + '</td><td class="hut-tobefilled">To be filled</td></tr>';
  });
  html += '</tbody>';
  document.getElementById('hut-ipd-ms-table').innerHTML = html;
}

var HUT_PEPCEA_MS = [
  { name: 'Architecture Concept', week: '-144W', desc: 'Architecture concept' },
  { name: 'Architecture Freeze', week: '-124W', desc: 'Architecture freeze' },
  { name: 'System Design Freeze', week: '-100W', desc: 'System design freeze' },
  { name: 'SW Req. Freeze', week: '-90W', desc: 'Software requirements freeze' },
  { name: 'VP1.0 (AGT Wave I)', week: '-88W', desc: 'Vehicle prototype 1.0' },
  { name: 'VR1.0', week: '-70W', desc: 'Vehicle release 1.0' },
  { name: 'IPD 1.0', week: '-60W', desc: 'Integrated product development 1.0' },
  { name: 'IPD 2.0', week: '-52W', desc: 'Integrated product development 2.0' },
  { name: 'IPD 3.0', week: '-44W', desc: 'Integrated product development 3.0' },
  { name: 'IPD 4.0 (PRS)', week: '-36W', desc: 'Integrated product development 4.0' },
  { name: 'IPD 5.0', week: '-30W', desc: 'IPD 5.0 (Homo HW freeze)' },
  { name: 'IPD 6.0 (Homo)', week: '-24W', desc: 'IPD 6.0 (Homologation)' },
  { name: 'IPD 7.0 (0S)', week: '-18W', desc: 'IPD 7.0 (0-Serie)' },
  { name: 'IPD 7.5 (Bugfix)', week: '-12W', desc: 'IPD 7.5' },
  { name: 'IPD 8.0', week: '-6W', desc: 'IPD 8.0' },
  { name: 'SOP', week: '0W', desc: 'Start of Production' }
];

function renderHutPepCeaMsTable() {
  var html = '<thead><tr><th>PEP CEA Milestone</th><th>vs SOP</th><th>Description</th><th>FuSa Activity / Deliverable</th></tr></thead><tbody>';
  HUT_PEPCEA_MS.forEach(function(m) {
    html += '<tr><td class="font-bold">' + m.name + '</td><td class="text-xs muted">' + m.week + '</td><td class="text-sm">' + m.desc + '</td><td class="hut-tobefilled">To be filled</td></tr>';
  });
  html += '</tbody>';
  document.getElementById('hut-pepcea-ms-table').innerHTML = html;
}
