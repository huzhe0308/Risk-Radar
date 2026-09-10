// ============================================================
// SAFETY PLAN TIMELINE — weekly Gantt like fusa_plan_timeline.html
// ============================================================

var TIMELINE_WEEK_START = '2026-01-05';
var TIMELINE_WEEK_END = '2028-12-25';
var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weeksBetween(startDate, endDate) {
  var s = new Date(startDate + 'T00:00:00');
  var e = new Date(endDate + 'T00:00:00');
  return Math.round((e - s) / WEEK_MS);
}

function dateToWeekIndex(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var s = new Date(TIMELINE_WEEK_START + 'T00:00:00');
  var idx = Math.round((d - s) / WEEK_MS);
  if (idx < 0) idx = 0;
  return idx;
}

function getMondayDate(weekOffset) {
  var s = new Date(TIMELINE_WEEK_START + 'T00:00:00');
  var d = new Date(s.getTime() + weekOffset * WEEK_MS);
  var y = d.getFullYear();
  var m = ('' + (d.getMonth() + 1)).padStart(2, '0');
  var day = ('' + d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

var TIMELINE_MILESTONES = [
  { name: 'IPD Kick Off', color: '#26c6da' },
  { name: 'HW Baseline Freeze', color: '#42a5f5' },
  { name: 'Func Dadian & PRD', color: '#ab47bc' },
  { name: 'Specs & DBC Req Freeze', color: '#66bb6a' },
  { name: 'K-Matrix & SysRS', color: '#ffca28' },
  { name: 'DI Start', color: '#ff7043' },
  { name: 'PI HW TBT', color: '#8d6e63' },
  { name: 'PI Start (1st SW)', color: '#ec407a' },
  { name: 'IPD Release', color: '#5c6bc0' }
];

function renderUpstreamTimeline() {
  var up = DATA.upstreamPlan;
  if (!up || !up.views) {
    document.getElementById('upstream-timeline').innerHTML = '<p class="muted">No upstream plan data available.</p>';
    return;
  }

  var totalWeeks = weeksBetween(TIMELINE_WEEK_START, TIMELINE_WEEK_END) + 1;

  var allProjects = [];
  var allMilestoneDates = [];
  Object.keys(up.views).forEach(function(viewName) {
    up.views[viewName].projects.forEach(function(p) {
      var projectShort = p.name.replace(/VW\d+\/\d+\w+.*$/, '').trim();
      var jv = 'SVW';
      if (viewName === 'FAW') jv = 'FAW';
      if (viewName === 'VWA') jv = 'VWA';
      var msDates = {};
      up.views[viewName].iterations.forEach(function(it, idx) {
        var date = p.matrix[it];
        if (Array.isArray(date)) date = date[0];
        if (date) {
          msDates[idx] = date;
          allMilestoneDates.push(date);
        }
      });
      allProjects.push({
        name: projectShort,
        fullName: p.name,
        jv: jv,
        view: viewName,
        msDates: msDates,
        iterations: up.views[viewName].iterations
      });
    });
  });

  allMilestoneDates.sort();
  var dateRange = allMilestoneDates.length > 0 ? allMilestoneDates[0] + ' ~ ' + allMilestoneDates[allMilestoneDates.length - 1] : '—';

  var stats = document.getElementById('upstream-stats');
  if (stats) {
    stats.innerHTML =
      '<div class="stat-card blue"><div class="stat-value">' + allProjects.length + '</div><div class="stat-label">Projects</div></div>' +
      '<div class="stat-card purple"><div class="stat-value">' + allMilestoneDates.length + '</div><div class="stat-label">Total Milestones</div></div>' +
      '<div class="stat-card orange"><div class="stat-value" style="font-size:14px">' + dateRange + '</div><div class="stat-label">Date Range</div></div>' +
      '<div class="stat-card green"><div class="stat-value">' + totalWeeks + '</div><div class="stat-label">Weeks</div></div>';
  }

  var badge = document.getElementById('upstream-badge');
  if (badge) badge.textContent = allProjects.length + ' projects · ' + totalWeeks + ' weeks';

  var html = '';

  // Year header
  html += '<div class="tl-scroll"><table class="tl-table"><thead>';
  html += '<tr class="tl-year-row"><th class="tl-row-header" rowspan="2">Project / Hut</th>';
  var years = [2026, 2027, 2028];
  years.forEach(function(y) {
    html += '<th class="tl-year" colspan="52">' + y + '</th>';
  });
  html += '</tr>';

  // Week header
  html += '<tr>';
  for (var w = 0; w < totalWeeks; w++) {
    var monthDate = new Date(TIMELINE_WEEK_START + 'T00:00:00');
    monthDate.setDate(monthDate.getDate() + w * 7);
    var isMonthStart = monthDate.getDate() <= 7;
    var weekLabel = isMonthStart ? (monthDate.getMonth() + 1) + '月' : '';
    var cls = isMonthStart ? 'tl-wk tl-wk-month' : 'tl-wk';
    html += '<th class="' + cls + '" title="' + getMondayDate(w) + '">' + weekLabel + '</th>';
  }
  html += '</tr></thead><tbody>';

  // Milestone rows
  TIMELINE_MILESTONES.forEach(function(ms, msIdx) {
    html += '<tr class="tl-ms-row"><td class="tl-row-header tl-ms-name">' + ms.name + '</td>';
    for (var w = 0; w < totalWeeks; w++) {
      html += '<td class="tl-cell' + (w % 4 === 0 ? ' tl-cell-month' : '') + '"></td>';
    }
    html += '</tr>';
  });

  // Separator
  html += '<tr class="tl-sep-row"><td colspan="' + (totalWeeks + 1) + '">Huts by SOP</td></tr>';

  // Group projects by SOP date
  var sopGroups = {};
  allProjects.forEach(function(p) {
    var sopKey = '';
    var msDates = p.msDates;
    var keys = Object.keys(msDates);
    if (keys.length > 0) {
      var lastDate = msDates[keys[keys.length - 1]];
      if (lastDate) sopKey = lastDate.substring(0, 7);
    }
    if (!sopKey) sopKey = 'unknown';
    if (!sopGroups[sopKey]) sopGroups[sopKey] = [];
    sopGroups[sopKey].push(p);
  });

  var sopColors = ['#e74c3c', '#e67e22', '#3498db', '#2ecc71', '#9b59b6', '#1abc9c', '#d35400', '#16a085'];
  var sopIdx = 0;

  Object.keys(sopGroups).sort().forEach(function(sopKey) {
    var projects = sopGroups[sopKey];
    var color = sopColors[sopIdx % sopColors.length];
    sopIdx++;

    // SOP header row
    html += '<tr class="tl-sop-head"><td class="tl-row-header">';
    html += '<span class="tl-sop-badge" style="background:' + color + '">SOP ' + sopKey + ' (' + projects.length + ' Huts)</span>';
    html += '</td>';
    for (var w = 0; w < totalWeeks; w++) {
      html += '<td class="tl-cell' + (w % 4 === 0 ? ' tl-cell-month' : '') + '"></td>';
    }
    html += '</tr>';

    // Project rows
    projects.forEach(function(p) {
      var cls = 'co';
      if (p.fullName.indexOf('ALL-NEW') >= 0 || p.fullName.indexOf('All-New') >= 0) cls = 'an';
      else if (p.fullName.indexOf('NEW VARIANT') >= 0 || p.fullName.indexOf('New Variant') >= 0) cls = 'nv';

      // Determine classification from HUT_DATA if available
      if (typeof HUT_DATA !== 'undefined') {
        var hutMatch = HUT_DATA.find(function(h) { return h.hut === p.fullName || p.fullName.indexOf(h.hut.substring(0, 20)) >= 0; });
        if (hutMatch) {
          cls = hutMatch.cls === 'allnew' ? 'an' : hutMatch.cls === 'newvar' ? 'nv' : 'co';
        }
      }

      html += '<tr class="tl-project-row"><td class="tl-row-header tl-project-name">';
      html += '<span class="tl-jv tl-jv-' + p.jv.toLowerCase() + '">' + p.jv + '</span>';
      html += '<span class="tl-cls tl-cls-' + cls + '">' + (cls === 'an' ? 'ALL-NEW' : cls === 'nv' ? 'NEW VAR' : 'CARRY') + '</span>';
      html += p.name;
      html += '<div class="tl-rsub">SOP ' + sopKey + '</div>';
      html += '</td>';

      // Week cells
      var milestoneCells = {};
      Object.keys(p.msDates).forEach(function(itIdx) {
        var date = p.msDates[itIdx];
        if (date) {
          var weekIdx = dateToWeekIndex(date);
          if (weekIdx >= 0 && weekIdx < totalWeeks) {
            milestoneCells[weekIdx] = { date: date, iteration: p.iterations[parseInt(itIdx)] };
          }
        }
      });

      for (var w = 0; w < totalWeeks; w++) {
        var cellCls = 'tl-cell';
        if (w % 4 === 0) cellCls += ' tl-cell-month';
        if (milestoneCells[w]) {
          var ms = milestoneCells[w];
          var msDateShort = ms.date.substring(5).replace('-', '/');
          cellCls += ' tl-has-ms';
          html += '<td class="' + cellCls + '"><div class="tl-ms-marker"><div class="tl-tri" style="border-bottom-color:' + 'var(--blue)' + '"></div><div class="tl-ms-date">' + msDateShort + '</div><div class="tl-ms-iter">' + ms.iteration + '</div></div></td>';
        } else {
          html += '<td class="' + cellCls + '"></td>';
        }
      }
      html += '</tr>';
    });
  });

  // FuSa activity placeholder rows
  html += '<tr class="tl-fusa-sep"><td colspan="' + (totalWeeks + 1) + '">FuSa Activity Mapping (to be filled)</td></tr>';
  html += '<tr class="tl-fusa-row"><td class="tl-row-header tl-ms-name">FuSa Activities</td>';
  for (var w = 0; w < totalWeeks; w++) {
    html += '<td class="tl-cell' + (w % 4 === 0 ? ' tl-cell-month' : '') + '"></td>';
  }
  html += '</tr>';

  html += '</tbody></table></div>';

  document.getElementById('upstream-timeline').innerHTML = html;
}
