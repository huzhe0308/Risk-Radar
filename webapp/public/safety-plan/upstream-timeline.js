// ============================================================
// SAFETY PLAN TIMELINE — matches fusa_plan_timeline.html exactly
// ============================================================

var TL_START = '2026-01-05';
var TL_WEEKS = 156;
var TL_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function tlWeekIndex(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var s = new Date(TL_START + 'T00:00:00');
  return Math.floor((d - s) / TL_WEEK_MS);
}

function tlDayOffset(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var day = d.getDay() || 7;
  return (day - 1) / 7;
}

function tlShortDate(s) {
  var p = s.split('-');
  return p.length === 3 ? p[1] + '/' + p[2] : s;
}

var TL_HUTS = [
  { sop:'2027-05', jv:'SVW', hut:'CMP21 CS A SUV MY27 VW316/9CS_B1 2ECV6H', cea:'CEA 2.0', cls:'carryover' },
  { sop:'2027-05', jv:'FAW', hut:'CMP21 CN A NB PHEV VW311/1CN_P 2EFV6H', cea:'CEA 2.0', cls:'newvar' },
  { sop:'2027-05', jv:'FAW', hut:'CMP21 CN A Main SUV BEV VW316/9CN_B 2EGV6H', cea:'CEA 2.0', cls:'newvar' },
  { sop:'2027-08', jv:'FAW', hut:'CMP21 CN A NB MY27 VW311/1CN_B1 2EF001', cea:'CEA 2.1', cls:'carryover' },
  { sop:'2027-08', jv:'SVW', hut:'CMP21 CS A SUV PHEV VW316/9CS_P 2EPV6K', cea:'CEA 2.2', cls:'newvar' },
  { sop:'2027-08', jv:'SVW', hut:'CSP31 CS B NB BEV VW423/1CS_B CS0V6K', cea:'CEA 2.1', cls:'allnew' },
  { sop:'2027-09', jv:'VWA', hut:'MEB31 CM A SUVe MY28 VW316/8CM_B1 11H001', cea:'CEA 2.0', cls:'carryover' },
  { sop:'2027-09', jv:'FAW', hut:'MEB31 CN ID4 PA MY28 VW316/6CN_B1 CN0001', cea:'CEA 2.1', cls:'carryover' },
  { sop:'2027-09', jv:'VWA', hut:'MEB31 CM A COSe MY28 VW313/2CM_B1 11M001', cea:'CEA 2.1', cls:'carryover' },
  { sop:'2027-10', jv:'FAW', hut:'CSP31 CN B SUV BEV 5S VW416/6CN_B CN5V6I', cea:'CEA 2.1', cls:'newvar' },
  { sop:'2027-10', jv:'SVW', hut:'CSP31 CS B NB EREV VW423/1CS_E CS0V6I', cea:'CEA 2.2', cls:'newvar' },
  { sop:'2027-11', jv:'FAW', hut:'CSP31 CN B SUV EREV 5S VW416/6CN_E CN5001', cea:'CEA 2.2', cls:'newvar' },
  { sop:'2028-01', jv:'SVW', hut:'CSP31 CS A+ SUV BEV VW326/6CS_B CS2V6E', cea:'CEA 2.3', cls:'allnew' },
  { sop:'2028-03', jv:'FAW', hut:'CSP31 CN B NB BEV VW423/1CN_B CN4V6E', cea:'CEA 2.3', cls:'newvar' },
  { sop:'2028-03', jv:'FAW', hut:'CSP31 CN B NB EREV VW423/1CN_E CN4V6F', cea:'CEA 2.4', cls:'newvar' },
  { sop:'2028-03', jv:'SVW', hut:'CSP31 CS A+ SUV EREV VW326/6CS_E CS2001', cea:'CEA 2.3', cls:'newvar' },
  { sop:'2028-10', jv:'FAW', hut:'CSP31 CN B SUV EREV 6S VW416/5CN_E CN2V6I', cea:'CEA 2.2', cls:'newvar' }
];

var TL_SOP_COLORS = ['#e74c3c','#e67e22','#3498db','#2ecc71','#9b59b6','#1abc9c','#d35400','#16a085'];

var TL_PLATFORM_ROWS = [
  'IPD Kick Off',
  'HW Baseline Freeze',
  'Function Dadian JIRA L3&PRD Freeze',
  'Specs &DBC Requirement Freeze',
  'K-Matrix Release &SysRS Freeze',
  'DI Start',
  'PI HW TBT',
  'PI Start (1st SW Submit)',
  'IPD Platform Release Time'
];

var TL_FUSA_SECTIONS = [
  { section:'System Level (14 Items)', items:[
    {name:'01 - Item Definition', desc:'ALL-NEW: full; VARIANT/CARRY-OVER: per IA'},
    {name:'02 - Impact Analysis', desc:'ALL-NEW: skip; VARIANT/CARRY-OVER: first'},
    {name:'03 - HARA', desc:'ALL-NEW: full; VARIANT: delta; CARRY-OVER: per IA'},
    {name:'04 - Safety Plan', desc:'Based on IA + HARA'},
    {name:'05 - FSC/TSC', desc:'After HARA'},
    {name:'06/07/08 - FMEA/FTA/DFA', desc:'After FSC/TSC'},
    {name:'09 - Integration & Test Strategy', desc:'After Safety Analysis'},
    {name:'10 - Integration & Test Case', desc:'After Strategy'},
    {name:'11 - Integration & Test Report', desc:'After VFF'},
    {name:'12 - Safety Validation Plan', desc:'Before validation'},
    {name:'13 - Safety Validation Report', desc:'After validation'},
    {name:'14 - Safety Case', desc:'Before 0S'}
  ]},
  { section:'GX / In-house Layer', items:[
    {name:'GX Safety Plan', desc:'Follows VCTC'},
    {name:'GX TSR/TSC/Design', desc:'Part 4'},
    {name:'GX HW Dev', desc:'Part 5'},
    {name:'GX SW Dev', desc:'Part 6'},
    {name:'GX Safety Case + Release', desc:'Consolidate'}
  ]},
  { section:'Supplier / BTV Layer', items:[
    {name:'DIA Signed', desc:'Prerequisite'},
    {name:'Supplier Safety Plan (3-1)', desc:'After DIA'},
    {name:'Supplier TSC (3-4)', desc:'After FSR'},
    {name:'Supplier Safety Analysis (3-5)', desc:'FMEA+FTA+DFA'},
    {name:'Supplier FMEDA (3-8)', desc:'After HW design'},
    {name:'Supplier Integration Test (3-6/3-7)', desc:'After integration'},
    {name:'Supplier Safety Case + Release (3-2/3-3)', desc:'Before BMG'},
    {name:'BMG Release', desc:'All prerequisites'}
  ]},
  { section:'Vehicle Release', items:[
    {name:'System Safety Case Consolidation', desc:'All layers -> system'},
    {name:'Vehicle Release', desc:'Per SOP node'}
  ]}
];

function renderUpstreamTimeline() {
  var container = document.getElementById('upstream-timeline');
  if (!container) return;

  var up = DATA.upstreamPlan;
  if (!up || !up.views) {
    container.innerHTML = '<p class="muted">No upstream plan data available.</p>';
    return;
  }

  // Build weeks array
  var weeks = [];
  var cur = new Date(TL_START + 'T00:00:00');
  var prevMonth = -1;
  for (var i = 0; i < TL_WEEKS; i++) {
    var thursday = new Date(cur.getTime());
    thursday.setDate(cur.getDate() + 3);
    var m = thursday.getMonth() + 1;
    var isMonthStart = m !== prevMonth;
    weeks.push({ year: thursday.getFullYear(), month: m, isMonthStart: isMonthStart });
    prevMonth = m;
    cur.setDate(cur.getDate() + 7);
  }

  // Collect platform milestones
  var platView = up.views['CEA 2.X Platform'];
  var platRows = [];
  if (platView) {
    TL_PLATFORM_ROWS.forEach(function(name) {
      var proj = platView.projects.find(function(p) { return p.name === name; });
      var milestones = [];
      if (proj) {
        Object.keys(proj.matrix).forEach(function(iter) {
          var val = proj.matrix[iter];
          var dates = Array.isArray(val) ? val : [val];
          dates.forEach(function(d) {
            if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
              milestones.push({ date: d, label: iter });
            }
          });
        });
      }
      platRows.push({ name: name, milestones: milestones });
    });
  }

  // Collect hut milestones
  var hutRows = [];
  var sopGroups = {};
  TL_HUTS.forEach(function(h) {
    var viewName = { FAW:'FAW', SVW:'SVW', VWA:'VWA' }[h.jv];
    var view = up.views[viewName];
    var milestones = [];
    if (view) {
      var proj = view.projects.find(function(p) { return p.name === h.hut; });
      if (proj) {
        Object.keys(proj.matrix).forEach(function(iter) {
          if (!iter) return;
          var val = proj.matrix[iter];
          var dates = Array.isArray(val) ? val : [val];
          dates.forEach(function(d) {
            if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
              milestones.push({ date: d, label: iter });
            }
          });
        });
      }
    }
    var row = { hut: h, milestones: milestones };
    hutRows.push(row);
    if (!sopGroups[h.sop]) sopGroups[h.sop] = [];
    sopGroups[h.sop].push(row);
  });

  var totalMs = platRows.reduce(function(s,r){return s+r.milestones.length;},0) + hutRows.reduce(function(s,r){return s+r.milestones.length;},0);

  // Stats (hidden — not displayed in timeline view)

  var badge = document.getElementById('upstream-badge');
  if (badge) badge.textContent = '59 projects · 156 weeks';

  // Build HTML
  var html = '';
  html += '<div class="sptl-container">';
  html += '<div class="sptl-gbox"><div class="sptl-twrap" id="sptl-twrap">';

  // Today line (placed before table so top:0 = table top)
  var now = new Date();
  var yyyy = now.getFullYear();
  var mm = ('' + (now.getMonth() + 1)).padStart(2, '0');
  var dd = ('' + now.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;
  var todayIdx = tlWeekIndex(todayStr);
  if (todayIdx >= 0 && todayIdx < TL_WEEKS) {
    var todayDayOff = tlDayOffset(todayStr);
    var todayLeft = 200 + (todayIdx + todayDayOff) * 18;
    html += '<div class="sptl-today-line" style="left:' + todayLeft + 'px"></div>';
    html += '<div class="sptl-today-label" style="left:' + (todayLeft + 4) + 'px">Today</div>';
  }

  html += '<table class="sptl-g">';

  // Header
  html += '<thead>';
  html += '<tr><th class="sptl-rn" rowspan="2">Project / Hut</th>';
  html += '<th class="sptl-yr" colspan="52">2026</th>';
  html += '<th class="sptl-yr" colspan="52">2027</th>';
  html += '<th class="sptl-yr" colspan="52">2028</th>';
  html += '</tr>';
  html += '<tr>';
  for (var w = 0; w < TL_WEEKS; w++) {
    html += '<th class="sptl-wk' + (weeks[w].isMonthStart ? ' sptl-wk-m' : '') + '">' + (weeks[w].isMonthStart ? weeks[w].month : '') + '</th>';
  }
  html += '</tr>';
  html += '</thead><tbody>';

  // Platform rows
  platRows.forEach(function(row) {
    var shortName = row.name;
    if (shortName === 'Function Dadian JIRA L3&PRD Freeze') shortName = 'Func Dadian & PRD';
    if (shortName === 'Specs &DBC Requirement Freeze') shortName = 'Specs &DBC Requirement Freeze';
    if (shortName === 'K-Matrix Release &SysRS Freeze') shortName = 'K-Matrix & SysRS';
    if (shortName === 'PI Start (1st SW Submit)') shortName = 'PI Start (1st SW)';
    if (shortName === 'IPD Platform Release Time') shortName = 'IPD Release';

    html += '<tr><td class="sptl-rn" style="font-size:10px">' + shortName + '</td>';
    for (var w = 0; w < TL_WEEKS; w++) {
      var ms = row.milestones.filter(function(m) { return tlWeekIndex(m.date) === w; });
      var cellClass = weeks[w].isMonthStart ? 'sptl-month-border' : '';
      html += '<td class="' + cellClass + '" style="position:relative">';
      ms.forEach(function(m) {
        var off = tlDayOffset(m.date);
        html += '<div class="sptl-ms" style="left:' + (off * 100) + '%">';
        html += '<div class="sptl-tri" style="border-bottom-color:#4a9eff"></div>';
        html += '<div class="sptl-dl">' + tlShortDate(m.date) + '</div>';
        html += '<div class="sptl-il">' + m.label + '</div>';
        html += '</div>';
      });
      html += '</td>';
    }
    html += '</tr>';
  });

  // Separator
  html += '<tr class="sptl-sep-row"><td class="sptl-rn">=== HUTS BY SOP ===</td>';
  for (var w = 0; w < TL_WEEKS; w++) html += '<td></td>';
  html += '</tr>';

  // SOP groups
  var sopIdx = 0;
  Object.keys(sopGroups).sort().forEach(function(sopKey) {
    var group = sopGroups[sopKey];
    var color = TL_SOP_COLORS[sopIdx % TL_SOP_COLORS.length];
    sopIdx++;

    // SOP header
    html += '<tr class="sptl-sop-head"><td class="sptl-rn">';
    html += '<span class="sptl-sop-badge" style="background:' + color + '">SOP ' + sopKey + ' (' + group.length + ' Huts)</span>';
    html += '</td>';
    for (var w = 0; w < TL_WEEKS; w++) html += '<td></td>';
    html += '</tr>';

    // Hut rows
    group.forEach(function(row) {
      var h = row.hut;
      var clsLabel = h.cls === 'allnew' ? 'ALL-NEW' : h.cls === 'newvar' ? 'NEW VARIANT' : 'CARRY-OVER';
      var clsClass = h.cls === 'allnew' ? 'sptl-ct-an' : h.cls === 'newvar' ? 'sptl-ct-nv' : 'sptl-ct-co';

      html += '<tr><td class="sptl-rn" style="font-size:10px">';
      html += h.hut;
      html += '<div class="sptl-rsub"><span class="sptl-jtag sptl-j-' + h.jv.toLowerCase() + '">' + h.jv + '</span><span class="sptl-ctag ' + clsClass + '">' + clsLabel + '</span> SOP ' + h.sop + ' | ' + h.cea + '</div>';
      html += '</td>';

      for (var w = 0; w < TL_WEEKS; w++) {
        var ms = row.milestones.filter(function(m) { return tlWeekIndex(m.date) === w; });
        var cellClass = weeks[w].isMonthStart ? 'sptl-month-border' : '';
        html += '<td class="' + cellClass + '" style="position:relative">';
        html += '<div class="sptl-sop-bar" style="background:' + color + '"></div>';
        ms.forEach(function(m) {
          var off = tlDayOffset(m.date);
          var msColor = h.cls === 'allnew' ? '#e74c3c' : h.cls === 'newvar' ? '#e67e22' : '#3498db';
          html += '<div class="sptl-ms" style="left:' + (off * 100) + '%">';
          html += '<div class="sptl-tri" style="border-bottom-color:' + msColor + '"></div>';
          html += '<div class="sptl-dl">' + tlShortDate(m.date) + '</div>';
          html += '<div class="sptl-il">' + m.label + '</div>';
          html += '</div>';
        });
        html += '</td>';
      }
      html += '</tr>';
    });
  });

  // FuSa separator
  // (removed — not displayed)

  // Today line — placed inside the table via a absolutely positioned overlay
  // Using a data attribute so we can position it after render
  var now = new Date();
  var yyyy = now.getFullYear();
  var mm = ('' + (now.getMonth() + 1)).padStart(2, '0');
  var dd = ('' + now.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;
  var todayIdx = tlWeekIndex(todayStr);

  html += '</tbody></table>';

  html += '</div></div></div>';

  container.innerHTML = html;
}
