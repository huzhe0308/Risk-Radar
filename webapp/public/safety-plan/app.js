// ============================================================
// CEA 2.X Safety Plan Dashboard — App Logic
// ============================================================

let DATA = null;
let isDirty = false;
const TOKEN = '123456';
const API = '/api/safety-plan?token=' + TOKEN;

// --- API helpers ---
async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function loadData() {
  try {
    const resp = await fetch(API);
    if (resp.ok) {
      const payload = await resp.json();
      DATA = payload.data;
    }
    if (!DATA) {
      const staticData = await fetchJSON('/safety-plan/data.json');
      DATA = staticData;
    }
  } catch (e) {
    showToast('Failed to load data: ' + e.message, 'error');
    return false;
  }
  return true;
}

function markDirty() {
  isDirty = true;
  document.getElementById('dirty-indicator').classList.add('show');
}

function markClean() {
  isDirty = false;
  document.getElementById('dirty-indicator').classList.remove('show');
}

async function saveAllData() {
  if (!DATA) return;
  try {
    await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: DATA })
    });
    markClean();
    showToast('Data saved successfully', 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

async function exportData() {
  if (!DATA) return;
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'safety_plan_data.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function resetData() {
  if (!confirm('Reset all data to backup? Unsaved changes will be lost.')) return;
  try {
    DATA = await fetchJSON('/safety-plan/data_backup.json');
    markClean();
    renderAll();
    showToast('Data reset to backup', 'info');
  } catch (e) {
    showToast('Reset failed: ' + e.message, 'error');
  }
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// --- Constants from data ---
function TL() { return { min: DATA.tlMinWeek, max: DATA.tlMaxWeek, range: DATA.tlMaxWeek - DATA.tlMinWeek }; }

// --- Helpers ---
function weekToPercent(week) {
  const t = TL();
  return ((week - t.min) / t.range * 100);
}

function ownerBadge(owner) {
  if (owner === 'VFSM') return '<span class="badge-status badge-vfsm">VFSM</span>';
  if (owner === 'Domain') return '<span class="badge-status badge-domain">Domain</span>';
  if (owner === 'Supplier') return '<span class="badge-status badge-supplier">Supplier</span>';
  return owner;
}

function fnLevelClass(level) {
  if (level === 'B1') return 'fn-B1';
  if (level === 'C1') return 'fn-C1';
  if (level === 'C2') return 'fn-C2';
  if (level === 'D') return 'fn-D';
  if (level && level.includes('Release')) return 'fn-C2';
  return '';
}

function getAllDeliverables() {
  const all = [];
  DATA.deliverables.forEach(phase => {
    phase.items.forEach(item => {
      all.push({ ...item, phase: phase.phase, isoPart: phase.isoPart });
    });
  });
  return all;
}

function mapColor(phase) {
  return phase.includes('Phase 1') ? 'var(--blue)' :
    phase.includes('Phase 2') ? 'var(--green)' :
      phase.includes('Phase 3') ? 'var(--purple)' :
        phase.includes('Phase 4A') ? 'var(--cyan)' :
          phase.includes('Phase 4B') ? 'var(--orange)' :
            phase.includes('Phase 4C') ? '#e91e63' :
              phase.includes('Phase 4:') ? 'var(--yellow)' :
                phase.includes('Phase 5') ? '#00bcd4' :
                  phase.includes('Phase 6') ? '#8bc34a' :
                    phase.includes('Phase 7') ? 'var(--orange)' :
                      phase.includes('Phase 8') ? 'var(--red)' : 'var(--muted)';
}

// ============================================================
// INLINE EDITING
// ============================================================
function makeEditable(td, section, index, field, type = 'text') {
  td.classList.add('editable-cell');
  td.dataset.section = section;
  td.dataset.index = index;
  td.dataset.field = field;
  td.onclick = function () { startEdit(this, type); };
}

function startEdit(cell, type) {
  if (cell.classList.contains('editing')) return;
  cell.classList.add('editing');
  const section = cell.dataset.section;
  const index = parseInt(cell.dataset.index);
  const field = cell.dataset.field;
  const currentValue = getNestedValue(section, index, field);
  const oldValue = currentValue != null ? String(currentValue) : '';

  let inputEl;
  if (type === 'select-owner') {
    inputEl = document.createElement('select');
    ['VFSM', 'Domain', 'Supplier'].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      if (o === oldValue) opt.selected = true;
      inputEl.appendChild(opt);
    });
  } else if (type === 'select-level') {
    inputEl = document.createElement('select');
    ['Vehicle Item', 'Product Group', 'Component', 'Supplier'].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      if (o === oldValue) opt.selected = true;
      inputEl.appendChild(opt);
    });
  } else if (type === 'textarea') {
    inputEl = document.createElement('textarea');
    inputEl.value = oldValue;
    inputEl.rows = 2;
  } else {
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.value = oldValue;
  }
  inputEl.style.width = '100%';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-save-btn'; saveBtn.textContent = 'OK';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn'; cancelBtn.textContent = 'X';

  const origHTML = cell.innerHTML;
  cell.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '4px';
  const inputWrapper = document.createElement('div');
  inputWrapper.style.flex = '1';
  inputWrapper.appendChild(inputEl);
  wrapper.appendChild(inputWrapper);
  const btnWrapper = document.createElement('div');
  btnWrapper.style.display = 'flex';
  btnWrapper.style.gap = '2px';
  btnWrapper.appendChild(saveBtn);
  btnWrapper.appendChild(cancelBtn);
  wrapper.appendChild(btnWrapper);
  cell.appendChild(wrapper);
  inputEl.focus();
  if (inputEl.select) inputEl.select();

  function save() {
    const newVal = inputEl.value;
    setNestedValue(section, index, field, newVal);
    cell.classList.remove('editing');
    cell.innerHTML = origHTML;
    // Re-render the changed cell display
    updateCellDisplay(cell, section, index, field, newVal);
    markDirty();
    // Mark row as modified
    const row = cell.closest('tr');
    if (row) row.classList.add('row-modified');
  }
  function cancel() {
    cell.classList.remove('editing');
    cell.innerHTML = origHTML;
  }
  saveBtn.onclick = save;
  cancelBtn.onclick = cancel;
  inputEl.onkeydown = function (e) {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };
}

function getNestedValue(section, index, field) {
  if (section === 'deliverables') {
    // index is "phaseIdx-itemIdx"
    const [pi, ii] = index.split('-').map(Number);
    return DATA.deliverables[pi].items[ii][field];
  }
  if (section === 'mapping') {
    return DATA.safetyPepMapping[index][field];
  }
  if (section === 'productGroups') {
    return DATA.productGroups[index][field];
  }
  if (section === 'impactAnalysis') {
    return DATA.impactAnalysis[index][field];
  }
  if (section === 'ceaMilestones') {
    return DATA.ceaKeyMilestones[index][field];
  }
  if (section === 'pep29Milestones') {
    return DATA.pep29Milestones[index][field];
  }
  if (section === 'pepCeaMilestones') {
    return DATA.pepCeaMilestones[index][field];
  }
  if (section === 'syncPoints') {
    return DATA.syncPoints[index][field];
  }
  if (section === 'tbtMilestones') {
    return DATA.tbtMilestones[index][field];
  }
  if (section === 'pepComparison') {
    return DATA.pepComparison[index][field];
  }
  return null;
}

function setNestedValue(section, index, field, value) {
  getNestedValue(section, index, field); // validate
  if (section === 'deliverables') {
    const [pi, ii] = index.split('-').map(Number);
    DATA.deliverables[pi].items[ii][field] = value;
  } else if (section === 'mapping') {
    DATA.safetyPepMapping[index][field] = value;
  } else if (section === 'productGroups') {
    DATA.productGroups[index][field] = value;
  } else if (section === 'impactAnalysis') {
    DATA.impactAnalysis[index][field] = value;
  } else if (section === 'ceaMilestones') {
    DATA.ceaKeyMilestones[index][field] = isNaN(value) ? value : Number(value);
  } else if (section === 'pep29Milestones') {
    DATA.pep29Milestones[index][field] = isNaN(value) ? value : Number(value);
  } else if (section === 'pepCeaMilestones') {
    DATA.pepCeaMilestones[index][field] = isNaN(value) ? value : Number(value);
  } else if (section === 'syncPoints') {
    DATA.syncPoints[index][field] = isNaN(value) ? value : Number(value);
  } else if (section === 'tbtMilestones') {
    DATA.tbtMilestones[index][field] = isNaN(value) ? value : Number(value);
  } else if (section === 'pepComparison') {
    DATA.pepComparison[index][field] = value;
  }
}

function updateCellDisplay(cell, section, index, field, value) {
  // For select fields, show badge
  if (field === 'owner') {
    cell.innerHTML = ownerBadge(value);
  } else if (field === 'level') {
    cell.innerHTML = `<span class="badge-level">${value}</span>`;
  } else if (field === 'fnLevel') {
    cell.innerHTML = value ? `<span class="tag ${fnLevelClass(value)}">${value}</span>` : '—';
  } else if (field === 'week') {
    cell.textContent = value + 'W';
  } else if (field === 'classification') {
    const cls = value === 'New development' ? '<span class="red">New development</span>' : '<span class="orange">Modification with safety-related changes</span>';
    cell.innerHTML = cls;
  } else {
    cell.textContent = value;
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function switchTab(tabName) {
  var btn = document.querySelector('.nav-btn[data-tab="' + tabName + '"]');
  if (btn) btn.click();
}

window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'switch-tab' && e.data.tab) {
    switchTab(e.data.tab);
  }
});

// ============================================================
// OVERVIEW TAB
// ============================================================
function renderOverview() {
  const totalDeliverables = getAllDeliverables().length;
  const totalPGDeliverables = totalDeliverables * DATA.productGroups.length;
  const phases = DATA.deliverables.length;

  document.getElementById('overview-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${DATA.productGroups.length}</div><div class="stat-label">Product Groups</div></div>
    <div class="stat-card green"><div class="stat-value">21</div><div class="stat-label">Vehicle Models</div></div>
    <div class="stat-card purple"><div class="stat-value">${totalDeliverables}</div><div class="stat-label">Deliverables per Product Group</div></div>
    <div class="stat-card orange"><div class="stat-value">${totalPGDeliverables}</div><div class="stat-label">Total Deliverables (all groups)</div></div>
    <div class="stat-card blue"><div class="stat-value">${phases}</div><div class="stat-label">Safety Lifecycle Phases</div></div>
    <div class="stat-card green"><div class="stat-value">3</div><div class="stat-label">PEP Types (PEP24/29/CEA)</div></div>
  `;

  // Product Groups table
  let pgHtml = '<thead><tr><th>#</th><th>Product Group</th><th>Platform</th><th>Powertrain</th><th>Leading Car</th><th>Derivatives</th><th>Total</th></tr></thead><tbody>';
  DATA.productGroups.forEach((pg, i) => {
    pgHtml += `<tr><td>${i + 1}</td><td><span class="tag ${pg.tagClass}">${pg.name}</span></td><td>${pg.platform}</td><td>${pg.powertrain}</td><td class="text-sm">${pg.leading}</td><td class="text-sm">${pg.derivatives.map(d => `<div>${d}</div>`).join('')}</td><td>${pg.derivatives.length + 1}</td></tr>`;
  });
  pgHtml += `<tr style="font-weight:700"><td colspan="6">Total</td><td>21</td></tr></tbody>`;
  document.getElementById('product-groups-table').innerHTML = pgHtml;

  // PEP Comparison
  let pepHtml = '<thead><tr><th>PEP Type</th><th>Scope</th><th>Duration</th><th>Status</th></tr></thead><tbody>';
  DATA.pepComparison.forEach((p, i) => {
    pepHtml += `<tr>
      <td class="font-bold">${p.type}</td>
      <td class="editable-cell" data-section="pepComparison" data-index="${i}" data-field="scope">${p.scope}</td>
      <td class="editable-cell" data-section="pepComparison" data-index="${i}" data-field="duration">${p.duration}</td>
      <td class="editable-cell" data-section="pepComparison" data-index="${i}" data-field="status">${p.status}</td>
    </tr>`;
  });
  pepHtml += '</tbody>';
  document.getElementById('pep-comparison-table').innerHTML = pepHtml;

  // Impact Analysis
  let iaHtml = '<thead><tr><th>#</th><th>Product Group</th><th>Classification</th><th>Reference Project</th><th>Reference Car</th><th>Rationale</th></tr></thead><tbody>';
  DATA.impactAnalysis.forEach((ia, i) => {
    const cls = ia.classification === 'New development' ? '<span class="red">New development</span>' : '<span class="orange">Modification with safety-related changes</span>';
    iaHtml += `<tr>
      <td>${i + 1}</td>
      <td><span class="font-bold">${ia.pg}</span></td>
      <td class="editable-cell" data-section="impactAnalysis" data-index="${i}" data-field="classification">${cls}</td>
      <td class="editable-cell" data-section="impactAnalysis" data-index="${i}" data-field="ref">${ia.ref}</td>
      <td class="editable-cell" data-section="impactAnalysis" data-index="${i}" data-field="refCar">${ia.refCar}</td>
      <td class="text-sm muted editable-cell" data-section="impactAnalysis" data-index="${i}" data-field="rationale">${ia.rationale}</td>
    </tr>`;
  });
  iaHtml += '</tbody>';
  document.getElementById('impact-analysis-table').innerHTML = iaHtml;

  // Attach editable handlers
  attachEditableHandlers();
}

// ============================================================
// TIMELINE TAB
// ============================================================
function renderTimeline() {
  const container = document.getElementById('timeline-container');
  const laneHeight = 70;
  const totalLaneHeight = 28 + laneHeight * 3;
  const lanes = [
    { label: 'PEP29 — Platform & Hut (29M)', color: 'var(--pep29)', milestones: DATA.pep29Milestones },
    { label: 'PEP CEA — E/E Architecture (32M)', color: 'var(--pepCea)', milestones: DATA.pepCeaMilestones },
    { label: 'CEA Development Milestones', color: 'var(--ceaMilestone)', milestones: DATA.ceaKeyMilestones }
  ];

  let html = `<div class="timeline" style="min-width:2400px;padding:0 40px;position:relative">`;

  lanes.forEach((lane, i) => {
    const top = 28 + i * laneHeight;
    html += `<div style="position:absolute;left:40px;top:${top + laneHeight / 2}px;transform:translateY(-50%);font-size:12px;font-weight:600;color:${lane.color};white-space:nowrap;width:150px;text-align:right">${lane.label}</div>`;
  });

  html += `<div style="position:relative;margin-left:160px;height:${totalLaneHeight}px">`;

  html += '<div style="position:relative;height:28px;border-bottom:1px solid var(--border2)">';
  for (let w = -170; w <= 15; w += 10) {
    const pct = weekToPercent(w);
    html += `<div style="position:absolute;left:${pct}%;top:0;bottom:0;width:1px;background:var(--border)"></div>`;
    if (w % 20 === 0 || w === 0) {
      html += `<div style="position:absolute;left:${pct}%;top:4px;transform:translateX(-50%);font-size:10px;color:var(--muted);white-space:nowrap">${w}W</div>`;
    }
  }
  html += '</div>';

  DATA.ceaKeyMilestones.filter(m => m.isFreeze).forEach(f => {
    const pct = weekToPercent(f.week);
    html += `<div style="position:absolute;left:${pct}%;top:0;height:${totalLaneHeight}px;width:1px;background:var(--freeze);opacity:.25;z-index:0"></div>`;
    html += `<div style="position:absolute;left:${pct}%;top:0;transform:translateX(-50%);font-size:8px;color:var(--freeze);white-space:nowrap;font-weight:600;background:var(--bg);padding:0 2px;z-index:5">${f.name.replace(' FREEZE', '')}</div>`;
  });

  const homoPct = weekToPercent(-30);
  html += `<div style="position:absolute;left:${homoPct}%;top:0;height:${totalLaneHeight}px;width:1px;background:var(--orange);opacity:.2;z-index:0"></div>`;

  DATA.syncPoints.forEach(sp => {
    const pct = weekToPercent(sp.week);
    html += `<div style="position:absolute;left:${pct}%;top:0;height:${totalLaneHeight}px;width:2px;background:var(--sync);opacity:.35;z-index:1"></div>`;
    html += `<div style="position:absolute;left:${pct}%;top:0;transform:translateX(4px);font-size:8px;color:var(--sync);white-space:nowrap;font-weight:600;background:var(--bg);padding:1px 4px;border-radius:3px;z-index:10">${sp.from}→${sp.to}</div>`;
  });

  lanes.forEach((lane, laneIdx) => {
    const laneTop = 28 + laneIdx * laneHeight;
    html += `<div style="position:absolute;left:0;top:${laneTop}px;width:100%;height:${laneHeight}px;border-bottom:1px solid var(--border)">`;
    if (laneIdx === 0) {
      DATA.agtPhases.forEach(agt => {
        const sp = weekToPercent(agt.startWeek);
        const ep = weekToPercent(agt.endWeek);
        html += `<div style="position:absolute;left:${sp}%;width:${ep - sp}%;top:6px;bottom:6px;background:rgba(255,213,79,.12);border:1px dashed rgba(255,213,79,.4);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:rgba(255,213,79,.8)" title="${agt.name}: ${agt.desc}">${agt.name}</div>`;
      });
    }
    lane.milestones.forEach((m, i) => {
      const pct = weekToPercent(m.week);
      const labelTop = i % 2 === 0;
      let dotColor = lane.color;
      if (m.isFreeze) dotColor = 'var(--freeze)';
      if (m.isHomoFreeze) dotColor = 'var(--orange)';
      html += `<div style="position:absolute;left:${pct}%;top:50%;transform:translate(-50%,-50%);cursor:pointer;z-index:5" title="${m.name} (${m.week}W): ${m.desc}${m.fnLevel ? ' [Fn: ' + m.fnLevel + ']' : ''}">
        <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};border:2px solid var(--bg);box-shadow:0 0 0 2px ${dotColor}"></div>
        <div style="position:absolute;left:50%;${labelTop ? 'bottom:14px' : 'top:14px'};transform:translateX(-50%);font-size:9px;white-space:nowrap;font-weight:600;color:${dotColor}">${m.name}</div>
      </div>`;
      if (laneIdx === 2 && m.fnLevel) {
        html += `<div style="position:absolute;left:${pct}%;top:80%;transform:translate(-50%,0);z-index:4"><span class="tag ${fnLevelClass(m.fnLevel)}" style="font-size:7px;padding:0 3px">${m.fnLevel}</span></div>`;
      }
    });
    html += '</div>';
  });

  const sopPct = weekToPercent(0);
  html += `<div style="position:absolute;left:${sopPct}%;top:0;bottom:0;width:2px;background:var(--blue);opacity:.4;z-index:0"></div>`;

  html += '</div></div>';
  container.innerHTML = html;

  // CEA Milestones table
  let mHtml = '<thead><tr><th>Milestone</th><th>Week</th><th>Month</th><th>Description</th><th>Function Level</th><th>Type</th></tr></thead><tbody>';
  DATA.ceaKeyMilestones.forEach((m, i) => {
    const month = m.week ? Math.round(m.week / 4.33) : 0;
    const fnBadge = m.fnLevel ? `<span class="tag ${fnLevelClass(m.fnLevel)}">${m.fnLevel}</span>` : '—';
    const type = m.isFreeze ? '<span class="red">FREEZE</span>' : m.isHomoFreeze ? '<span class="orange">HOMO FREEZE</span>' : 'Milestone';
    mHtml += `<tr>
      <td class="font-bold editable-cell" data-section="ceaMilestones" data-index="${i}" data-field="name">${m.name}</td>
      <td class="editable-cell" data-section="ceaMilestones" data-index="${i}" data-field="week">${m.week}W</td>
      <td>${month}M</td>
      <td class="text-sm editable-cell" data-section="ceaMilestones" data-index="${i}" data-field="desc">${m.desc}</td>
      <td>${fnBadge}</td>
      <td>${type}</td>
    </tr>`;
  });
  mHtml += '</tbody>';
  document.getElementById('cea-milestones-table').innerHTML = mHtml;

  // Sync table
  let sHtml = '<thead><tr><th>From</th><th>To</th><th>Week</th><th>Description</th></tr></thead><tbody>';
  DATA.syncPoints.forEach((sp, i) => {
    sHtml += `<tr>
      <td class="font-bold editable-cell" data-section="syncPoints" data-index="${i}" data-field="from">${sp.from}</td>
      <td class="font-bold editable-cell" data-section="syncPoints" data-index="${i}" data-field="to">${sp.to}</td>
      <td class="editable-cell" data-section="syncPoints" data-index="${i}" data-field="week">${sp.week}W</td>
      <td class="text-sm editable-cell" data-section="syncPoints" data-index="${i}" data-field="desc">${sp.desc}</td>
    </tr>`;
  });
  sHtml += '</tbody>';
  document.getElementById('sync-table').innerHTML = sHtml;

  // TBT table
  let tHtml = '<thead><tr><th>Milestone</th><th>Week</th></tr></thead><tbody>';
  DATA.tbtMilestones.forEach((t, i) => {
    tHtml += `<tr>
      <td class="font-bold editable-cell" data-section="tbtMilestones" data-index="${i}" data-field="name">${t.name}</td>
      <td class="editable-cell" data-section="tbtMilestones" data-index="${i}" data-field="week">${t.week}W</td>
    </tr>`;
  });
  tHtml += '</tbody>';
  document.getElementById('tbt-table').innerHTML = tHtml;

  attachEditableHandlers();
}

// ============================================================
// DELIVERABLES TAB
// ============================================================
function renderDeliverables() {
  const pgSelect = document.getElementById('filter-pg');
  DATA.productGroups.forEach(pg => {
    pgSelect.innerHTML += `<option value="${pg.name}">${pg.name}</option>`;
  });
  const phaseSelect = document.getElementById('filter-phase');
  DATA.deliverables.forEach(phase => {
    phaseSelect.innerHTML += `<option value="${phase.phase}">${phase.phase}</option>`;
  });
  document.getElementById('filter-owner').innerHTML += '<option value="VFSM">VFSM</option><option value="Domain">Domain</option><option value="Supplier">Supplier</option>';

  updateDeliverablesTable();

  ['filter-pg', 'filter-phase', 'filter-owner', 'filter-search'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateDeliverablesTable);
  });
}

function updateDeliverablesTable() {
  const pg = document.getElementById('filter-pg').value;
  const phaseFilter = document.getElementById('filter-phase').value;
  const ownerFilter = document.getElementById('filter-owner').value;
  const search = document.getElementById('filter-search').value.toLowerCase();

  let html = '<thead><tr><th>ID</th><th>Phase</th><th>Activity</th><th>Deliverable / Document</th><th>Annex</th><th>ISO 26262 Ref.</th><th>Owner</th><th>Level</th></tr></thead><tbody>';
  let count = 0;

  DATA.deliverables.forEach((phase, pi) => {
    const phaseMatches = !phaseFilter || phase.phase === phaseFilter;
    const items = phase.items.filter((item, ii) => {
      if (phaseFilter && phase.phase !== phaseFilter) return false;
      if (ownerFilter && item.owner !== ownerFilter) return false;
      if (search) {
        const text = (item.id + ' ' + item.activity + ' ' + item.deliverable + ' ' + item.annex + ' ' + item.isoRef + ' ' + item.owner).toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
    if (items.length === 0) return;

    const pgLabel = pg ? `<span class="tag tag-bev">${pg}</span>` : '';
    html += `<tr class="phase-row"><td colspan="8">${phase.phase} <span class="muted text-xs">(${phase.isoPart})</span> ${pgLabel} <span class="badge" style="margin-left:8px">${items.length} items</span></td></tr>`;

    items.forEach(item => {
      const ii = phase.items.indexOf(item);
      const editIdx = `${pi}-${ii}`;
      html += `<tr>
        <td class="font-bold">${item.id}</td>
        <td class="text-xs muted">${phase.phase.split(':')[0]}</td>
        <td class="editable-cell" data-section="deliverables" data-index="${editIdx}" data-field="activity">${item.activity}</td>
        <td class="editable-cell" data-section="deliverables" data-index="${editIdx}" data-field="deliverable">${item.deliverable}</td>
        <td class="text-xs editable-cell" data-section="deliverables" data-index="${editIdx}" data-field="annex">${item.annex}</td>
        <td class="text-xs editable-cell" data-section="deliverables" data-index="${editIdx}" data-field="isoRef">${item.isoRef}</td>
        <td class="editable-cell" data-section="deliverables" data-index="${editIdx}" data-field="owner" data-edit-type="select-owner">${ownerBadge(item.owner)}</td>
        <td class="editable-cell" data-section="deliverables" data-index="${editIdx}" data-field="level" data-edit-type="select-level"><span class="badge-level">${item.level}</span></td>
      </tr>`;
      count++;
    });
  });
  html += '</tbody>';
  document.getElementById('deliverables-table').innerHTML = html;
  document.getElementById('deliv-count').textContent = `${count} deliverables${pg ? ' · ' + pg : ''}`;

  attachEditableHandlers();
}

// ============================================================
// MAPPING TAB
// ============================================================
function renderMapping() {
  let html = `<thead>
    <tr>
      <th style="width:180px">Safety Phase</th>
      <th style="width:250px">Safety Activity</th>
      <th style="width:200px">PEP Milestone</th>
      <th style="width:80px">PEP Week</th>
      <th style="width:120px">Activity Window</th>
      <th>Alignment Notes</th>
    </tr>
  </thead><tbody>`;

  let currentPhase = '';
  DATA.safetyPepMapping.forEach((m, i) => {
    if (m.safetyPhase !== currentPhase) {
      currentPhase = m.safetyPhase;
      html += `<tr class="phase-row"><td colspan="6">${currentPhase}</td></tr>`;
    }
    const startPct = Math.max(0, Math.min(100, ((m.startWeek - TL().min) / TL().range * 100)));
    const endPct = Math.max(0, Math.min(100, ((m.endWeek - TL().min) / TL().range * 100)));
    const barWidth = endPct - startPct;
    const color = mapColor(m.safetyPhase);
    html += `<tr>
      <td class="text-xs muted">${m.safetyPhase.split(':')[0]}</td>
      <td class="font-bold editable-cell" data-section="mapping" data-index="${i}" data-field="safetyActivity">${m.safetyActivity}</td>
      <td class="map-pep-cell editable-cell" data-section="mapping" data-index="${i}" data-field="pepMilestone">${m.pepMilestone}</td>
      <td class="map-week-cell">${m.pepWeek}W</td>
      <td>
        <div class="text-xs muted">${m.startWeek}W → ${m.endWeek}W</div>
        <div class="progress-bar" style="margin-top:2px"><div class="progress-fill" style="width:${barWidth}%;margin-left:${startPct}%;background:${color}"></div></div>
      </td>
      <td class="text-xs editable-cell" data-section="mapping" data-index="${i}" data-field="notes" data-edit-type="textarea">${m.notes}</td>
    </tr>`;
  });
  html += '</tbody>';
  document.getElementById('mapping-table').innerHTML = html;

  renderMappingTimeline();
  attachEditableHandlers();
}

function renderMappingTimeline() {
  const container = document.getElementById('mapping-timeline-container');
  const phaseGroups = {};
  DATA.safetyPepMapping.forEach(m => {
    if (!phaseGroups[m.safetyPhase]) phaseGroups[m.safetyPhase] = [];
    phaseGroups[m.safetyPhase].push(m);
  });

  const laneH = 32;
  const numLanes = Object.keys(phaseGroups).length;
  const totalHeight = 28 + laneH * numLanes;

  let html = `<div style="min-width:2400px;padding:0 40px;position:relative">`;

  let laneIdx = 0;
  Object.keys(phaseGroups).forEach(phase => {
    const top = 28 + laneIdx * laneH;
    html += `<div style="position:absolute;left:40px;top:${top + laneH / 2}px;transform:translateY(-50%);font-size:10px;font-weight:600;color:${mapColor(phase)};white-space:nowrap;width:150px;text-align:right">${phase.split(':')[0]}</div>`;
    laneIdx++;
  });

  html += `<div style="position:relative;margin-left:160px;height:${totalHeight}px">`;

  html += '<div style="position:relative;height:28px;border-bottom:1px solid var(--border2)">';
  for (let w = -170; w <= 15; w += 10) {
    const pct = weekToPercent(w);
    html += `<div style="position:absolute;left:${pct}%;top:0;bottom:0;width:1px;background:var(--border)"></div>`;
    if (w % 20 === 0 || w === 0) {
      html += `<div style="position:absolute;left:${pct}%;top:4px;transform:translateX(-50%);font-size:10px;color:var(--muted);white-space:nowrap">${w}W</div>`;
    }
  }
  html += '</div>';

  const sopPct = weekToPercent(0);
  html += `<div style="position:absolute;left:${sopPct}%;top:0;height:${totalHeight}px;width:2px;background:var(--blue);opacity:.4;z-index:0"></div>`;
  html += `<div style="position:absolute;left:${sopPct}%;top:0;transform:translateX(4px);font-size:10px;color:var(--blue);font-weight:700;z-index:10">SOP</div>`;

  laneIdx = 0;
  Object.entries(phaseGroups).forEach(([phase, mappings]) => {
    const top = 28 + laneIdx * laneH;
    const color = mapColor(phase);
    html += `<div style="position:absolute;left:0;top:${top}px;width:100%;height:${laneH}px;border-bottom:1px solid var(--border)">`;
    mappings.forEach(m => {
      const startPct = weekToPercent(m.startWeek);
      const endPct = weekToPercent(m.endWeek);
      const width = endPct - startPct;
      html += `<div style="position:absolute;left:${startPct}%;top:8px;height:16px;width:${width}%;background:${color};opacity:.5;border-radius:3px;border:1px solid ${color}" title="${m.safetyActivity} (${m.startWeek}W→${m.endWeek}W)\nPEP: ${m.pepMilestone}"></div>`;
    });
    html += '</div>';
    laneIdx++;
  });

  html += '</div></div>';
  container.innerHTML = html;
}

// ============================================================
// DASHBOARD TAB
// ============================================================
function renderDashboard() {
  const allDeliverables = getAllDeliverables();
  const total = allDeliverables.length;
  const totalAll = total * DATA.productGroups.length;

  const vfsmCount = allDeliverables.filter(d => d.owner === 'VFSM').length;
  const domainCount = allDeliverables.filter(d => d.owner === 'Domain').length;
  const supplierCount = allDeliverables.filter(d => d.owner === 'Supplier').length;
  const componentLevel = allDeliverables.filter(d => d.level === 'Component').length;

  document.getElementById('dashboard-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${total}</div><div class="stat-label">Deliverables per Product Group</div></div>
    <div class="stat-card green"><div class="stat-value">${totalAll}</div><div class="stat-label">Total Deliverables (×5 groups)</div></div>
    <div class="stat-card purple"><div class="stat-value">${vfsmCount}</div><div class="stat-label">VFSM-Owned</div></div>
    <div class="stat-card orange"><div class="stat-value">${domainCount}</div><div class="stat-label">Domain-Owned</div></div>
    <div class="stat-card blue"><div class="stat-value">${componentLevel}</div><div class="stat-label">Component-Level (per comp.)</div></div>
    <div class="stat-card green"><div class="stat-value">${DATA.deliverables.length}</div><div class="stat-label">Lifecycle Phases</div></div>
  `;

  let phaseHtml = '';
  const maxPhaseCount = Math.max(...DATA.deliverables.map(p => p.items.length));
  DATA.deliverables.forEach(phase => {
    const count = phase.items.length;
    const pct = count / maxPhaseCount * 100;
    const color = mapColor(phase.phase);
    phaseHtml += `<div style="margin-bottom:8px">
      <div class="flex justify-between text-xs mb-8"><span class="font-bold">${phase.phase}</span><span class="muted">${count} items · ${phase.isoPart}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  });
  document.getElementById('chart-by-phase').innerHTML = phaseHtml;

  const owners = [{ name: 'VFSM', count: vfsmCount, color: 'var(--blue)' }, { name: 'Domain', count: domainCount, color: 'var(--purple)' }, { name: 'Supplier', count: supplierCount, color: 'var(--orange)' }];
  const maxOwner = Math.max(...owners.map(o => o.count));
  let ownerHtml = '';
  owners.forEach(o => {
    const pct = o.count / maxOwner * 100;
    ownerHtml += `<div style="margin-bottom:12px">
      <div class="flex justify-between text-xs mb-8"><span class="font-bold">${o.name}</span><span class="muted">${o.count} items</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${o.color}"></div></div>
    </div>`;
  });
  ownerHtml += `<div class="section-divider"></div><div class="text-xs muted">VFSM: ${Math.round(vfsmCount / total * 100)}% · Domain: ${Math.round(domainCount / total * 100)}% · Supplier: ${Math.round(supplierCount / total * 100)}%</div>`;
  document.getElementById('chart-by-owner').innerHTML = ownerHtml;

  let pgHtml = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">';
  DATA.productGroups.forEach(pg => {
    pgHtml += `<div style="background:var(--card2);border-radius:8px;padding:16px;text-align:center">
      <div class="text-xs muted mb-8">${pg.name}</div>
      <div style="font-size:24px;font-weight:700;color:var(--blue)">${total}</div>
      <div class="text-xs muted">deliverables</div>
      <div class="section-divider" style="margin:8px 0"></div>
      <div class="text-xs muted">${pg.derivatives.length + 1} vehicles</div>
      <div class="text-xs muted">${pg.platform} · ${pg.powertrain}</div>
    </div>`;
  });
  pgHtml += '</div>';
  document.getElementById('chart-by-pg').innerHTML = pgHtml;

  const isoParts = {};
  DATA.deliverables.forEach(phase => {
    if (!isoParts[phase.isoPart]) isoParts[phase.isoPart] = { count: 0, phases: [] };
    isoParts[phase.isoPart].count += phase.items.length;
    isoParts[phase.isoPart].phases.push(phase.phase);
  });
  let isoHtml = '<thead><tr><th>ISO 26262 Part</th><th>Deliverables</th><th>Phases</th></tr></thead><tbody>';
  Object.entries(isoParts).sort((a, b) => b[1].count - a[1].count).forEach(([part, d]) => {
    isoHtml += `<tr><td class="font-bold">${part}</td><td>${d.count}</td><td class="text-xs muted">${d.phases.join(', ')}</td></tr>`;
  });
  isoHtml += '</tbody>';
  document.getElementById('iso-parts-table').innerHTML = isoHtml;
}

// ============================================================
// COMPONENT MANAGEMENT TAB
// ============================================================
function getCompData() { return DATA.componentManagement || {}; }

function renderComponents() {
  const cm = getCompData();
  if (!cm.components) return;
  const comps = cm.components;
  const vehicles = cm.vehicles || [];
  const domains = cm.domains || [];
  const suppliers = cm.suppliers || [];

  // Stats
  const totalComps = comps.length;
  const totalVeh = vehicles.length;
  const totalSup = suppliers.length;
  const assigned = comps.filter(c => c.supplier && c.supplier !== '/' && c.supplier !== '' && !c.supplier.includes('未定点')).length;
  const unassigned = totalComps - assigned;

  document.getElementById('comp-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${totalComps}</div><div class="stat-label">FuSa Components</div></div>
    <div class="stat-card green"><div class="stat-value">${totalVeh}</div><div class="stat-label">Vehicle Projects</div></div>
    <div class="stat-card purple"><div class="stat-value">${domains.length}</div><div class="stat-label">Domains</div></div>
    <div class="stat-card orange"><div class="stat-value">${totalSup}</div><div class="stat-label">Suppliers</div></div>
    <div class="stat-card green"><div class="stat-value">${assigned}</div><div class="stat-label">Supplier Assigned</div></div>
    <div class="stat-card orange"><div class="stat-value">${unassigned}</div><div class="stat-label">Unassigned</div></div>
  `;
  document.getElementById('comp-count-badge').textContent = totalComps + ' components / ' + totalVeh + ' vehicles';

  // Populate filters
  const domSel = document.getElementById('comp-filter-domain');
  domSel.innerHTML = '<option value="">All</option>';
  domains.forEach(d => { domSel.innerHTML += '<option value="' + d + '">' + d + '</option>'; });

  const asilSel = document.getElementById('comp-filter-asil');
  const asilSet = [...new Set(comps.map(c => c.asil).filter(a => a && a !== '/'))].sort();
  asilSel.innerHTML = '<option value="">All</option>';
  asilSet.forEach(a => { asilSel.innerHTML += '<option value="' + a + '">' + a + '</option>'; });

  const supSel = document.getElementById('comp-filter-supplier');
  supSel.innerHTML = '<option value="">All</option>';
  suppliers.forEach(s => { supSel.innerHTML += '<option value="' + s + '">' + s + '</option>'; });

  // Vehicle select
  const vehSel = document.getElementById('comp-vehicle-select');
  vehSel.innerHTML = '';
  vehicles.forEach(v => { vehSel.innerHTML += '<option value="' + v + '">' + v + '</option>'; });

  // Remove old listeners by cloning
  ['comp-filter-domain','comp-filter-asil','comp-filter-supplier','comp-filter-search'].forEach(id => {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('input', updateCompMatrix);
  });
  const vehSelEl = document.getElementById('comp-vehicle-select');
  const vehClone = vehSelEl.cloneNode(true);
  vehSelEl.parentNode.replaceChild(vehClone, vehSelEl);
  vehClone.addEventListener('change', renderCompVehicleDetail);

  // Sub-tab switching
  document.querySelectorAll('.comp-subtab').forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      document.querySelectorAll('.comp-subtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.comp-subtab-content').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
      clone.classList.add('active');
      const target = document.getElementById('comp-subtab-' + clone.dataset.subtab);
      target.classList.add('active');
      target.style.display = 'block';
    });
  });

  updateCompMatrix();
  renderCompSupplierView();
  renderCompVehicleDetail();
  renderCompECU();
}

function vehCellClass(val) {
  if (val === 'S' || val === 's') return 'veh-S';
  if (val === 'O' || val === 'o') return 'veh-O';
  if (val === '/') return 'veh-slash';
  if (val && val.trim()) return 'veh-text';
  return 'veh-empty';
}

function updateCompMatrix() {
  const cm = getCompData();
  const comps = cm.components || [];
  const vehicles = cm.vehicles || [];
  const domainF = document.getElementById('comp-filter-domain').value;
  const asilF = document.getElementById('comp-filter-asil').value;
  const supF = document.getElementById('comp-filter-supplier').value;
  const search = document.getElementById('comp-filter-search').value.toLowerCase();

  const filtered = comps.filter(c => {
    if (domainF && c.domain !== domainF) return false;
    if (asilF && c.asil !== asilF) return false;
    if (supF) {
      const s = (c.supplier || '').split('\n')[0].trim();
      if (s !== supF) return false;
    }
    if (search) {
      const text = (c.domain + ' ' + c.abbreviation + ' ' + c.fullName + ' ' + c.chineseName + ' ' + c.supplier + ' ' + c.fsm + ' ' + c.btv).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  // Group by domain
  const domainGroups = {};
  filtered.forEach(c => {
    const d = c.domain || 'Other';
    if (!domainGroups[d]) domainGroups[d] = [];
    domainGroups[d].push(c);
  });

  let html = '<thead><tr><th style="position:sticky;left:0;z-index:3;background:var(--card2)">Domain</th><th style="position:sticky;left:60px;z-index:3;background:var(--card2)">Abbr</th><th style="position:sticky;left:120px;z-index:3;background:var(--card2);min-width:180px">Full Name</th><th>Supplier</th><th>ASIL</th><th>FSM/FSE</th><th>BTV</th>';
  vehicles.forEach(v => {
    const short = v.length > 12 ? v.substring(0, 10) + '..' : v;
    html += '<th class="veh-col" title="' + v + '">' + short + '</th>';
  });
  html += '</tr></thead><tbody>';

  Object.keys(domainGroups).forEach(domain => {
    html += '<tr class="phase-row"><td colspan="' + (7 + vehicles.length) + '">' + domain + ' <span class="badge" style="margin-left:8px">' + domainGroups[domain].length + '</span></td></tr>';
    domainGroups[domain].forEach((c, idx) => {
      const globalIdx = comps.indexOf(c);
      const supShort = (c.supplier || '').split('\n')[0].trim();
      html += '<tr>';
      html += '<td class="text-xs muted" style="position:sticky;left:0;z-index:2;background:var(--card)">' + (c.loadType || '') + '</td>';
      html += '<td class="font-bold" style="position:sticky;left:60px;z-index:2;background:var(--card)">' + (c.abbreviation || '') + '</td>';
      html += '<td class="text-sm" style="position:sticky;left:120px;z-index:2;background:var(--card);min-width:180px"><div>' + (c.fullName || '') + '</div><div class="text-xs muted">' + (c.chineseName || '') + '</div></td>';
      html += '<td class="text-xs">' + (supShort || '—') + '</td>';
      html += '<td>' + (c.asil ? '<span class="tag tag-asil-' + (c.asil || '').toLowerCase() + '">' + c.asil + '</span>' : '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.fsm || '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.btv || '—') + '</td>';
      vehicles.forEach(v => {
        const val = (c.vehicleApplicability || {})[v] || '';
        html += '<td class="veh-cell ' + vehCellClass(val) + '" title="' + v + ': ' + val + '">' + (val || '') + '</td>';
      });
      html += '</tr>';
    });
  });
  html += '</tbody>';
  document.getElementById('comp-matrix-table').innerHTML = html;
}

function renderCompSupplierView() {
  const cm = getCompData();
  const comps = cm.components || [];
  const vehicles = cm.vehicles || [];

  // Build supplier -> components map
  const supMap = {};
  comps.forEach(c => {
    const rawSup = (c.supplier || '').split('\n')[0].trim();
    if (!rawSup || rawSup === '/') return;
    const isUnassigned = rawSup.includes('未定点');
    const key = isUnassigned ? '未定点 (Unassigned)' : rawSup;
    if (!supMap[key]) supMap[key] = { components: [], isUnassigned };
    supMap[key].components.push(c);
  });

  const sortedKeys = Object.keys(supMap).sort((a, b) => {
    if (a === '未定点 (Unassigned)') return 1;
    if (b === '未定点 (Unassigned)') return -1;
    return supMap[b].components.length - supMap[a].components.length;
  });

  let html = '<thead><tr><th>#</th><th>Supplier</th><th>Components</th><th>Domains</th><th>Vehicle Coverage</th><th>Status</th></tr></thead><tbody>';
  sortedKeys.forEach((key, i) => {
    const group = supMap[key];
    const domains = [...new Set(group.components.map(c => c.domain).filter(Boolean))];
    const vehSet = new Set();
    group.components.forEach(c => {
      vehicles.forEach(v => {
        const val = (c.vehicleApplicability || {})[v] || '';
        if (val && val !== '/' && val.trim()) vehSet.add(v);
      });
    });
    const status = group.isUnassigned ? '<span class="red">Unassigned</span>' : '<span class="green">Assigned</span>';
    html += '<tr>';
    html += '<td>' + (i + 1) + '</td>';
    html += '<td class="font-bold">' + key + '</td>';
    html += '<td>' + group.components.length + '</td>';
    html += '<td class="text-xs muted">' + domains.join(', ') + '</td>';
    html += '<td class="text-xs">' + vehSet.size + ' / ' + vehicles.length + ' vehicles</td>';
    html += '<td>' + status + '</td>';
    html += '</tr>';
  });
  html += '</tbody>';
  document.getElementById('comp-supplier-table').innerHTML = html;
}

function renderCompVehicleDetail() {
  const cm = getCompData();
  const comps = cm.components || [];
  const sel = document.getElementById('comp-vehicle-select');
  if (!sel) return;
  const vehicle = sel.value;
  if (!vehicle) return;

  const vehicleComps = comps.filter(c => {
    const val = (c.vehicleApplicability || {})[vehicle] || '';
    return val && val.trim();
  });

  // Group by domain
  const domainGroups = {};
  vehicleComps.forEach(c => {
    const d = c.domain || 'Other';
    if (!domainGroups[d]) domainGroups[d] = [];
    domainGroups[d].push(c);
  });

  let html = '<thead><tr><th>Domain</th><th>Abbr</th><th>Full Name</th><th>Supplier</th><th>Applicability</th><th>ASIL</th><th>FSM/FSE</th><th>BTV</th><th>Power Supply</th><th>FuSa by</th><th>Remark</th></tr></thead><tbody>';
  Object.keys(domainGroups).forEach(domain => {
    html += '<tr class="phase-row"><td colspan="11">' + domain + ' <span class="badge" style="margin-left:8px">' + domainGroups[domain].length + '</span></td></tr>';
    domainGroups[domain].forEach(c => {
      const val = (c.vehicleApplicability || {})[vehicle] || '';
      const supShort = (c.supplier || '').split('\n')[0].trim();
      html += '<tr>';
      html += '<td class="text-xs muted">' + (c.loadType || '') + '</td>';
      html += '<td class="font-bold">' + (c.abbreviation || '') + '</td>';
      html += '<td class="text-sm"><div>' + (c.fullName || '') + '</div><div class="text-xs muted">' + (c.chineseName || '') + '</div></td>';
      html += '<td class="text-xs">' + (supShort || '—') + '</td>';
      html += '<td class="veh-cell ' + vehCellClass(val) + '">' + val + '</td>';
      html += '<td>' + (c.asil ? '<span class="tag tag-asil-' + (c.asil || '').toLowerCase() + '">' + c.asil + '</span>' : '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.fsm || '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.btv || '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.powerSupply || '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.fuSaDevelopedBy || '—') + '</td>';
      html += '<td class="text-xs muted">' + (c.remark || '') + '</td>';
      html += '</tr>';
    });
  });
  html += '</tbody>';
  document.getElementById('comp-vehicle-table').innerHTML = html;
}

function renderCompECU() {
  const cm = getCompData();
  const ecu = cm.ecuVariants || [];
  if (ecu.length < 2) return;

  // First row is header
  const headers = ecu[0];
  let html = '<thead><tr>';
  headers.forEach(h => { if (h) html += '<th>' + h.replace(/\n/g, ' ') + '</th>'; });
  html += '</tr></thead><tbody>';
  for (let i = 1; i < ecu.length; i++) {
    const row = ecu[i];
    if (!row.some(c => c.trim())) continue;
    html += '<tr>';
    headers.forEach((h, j) => {
      const val = row[j] || '';
      const isVariant = j === 0 && val;
      html += '<td class="' + (isVariant ? 'font-bold' : 'text-xs') + '" style="' + (val ? '' : '') + '">' + val.replace(/\n/g, '<br>') + '</td>';
    });
    html += '</tr>';
  }
  html += '</tbody>';
  document.getElementById('comp-ecu-table').innerHTML = html;
}

// ============================================================
// EDITABLE HANDLERS
// ============================================================
function attachEditableHandlers() {
  document.querySelectorAll('.editable-cell:not(.editing)').forEach(cell => {
    const editType = cell.dataset.editType || 'text';
    cell.onclick = function () { startEdit(this, editType); };
  });
}

// ============================================================
// UPSTREAM PLAN TAB
// ============================================================
let upstreamActiveView = null;

function renderUpstreamPlan() {
  if (typeof renderUpstreamTimeline === 'function') {
    renderUpstreamTimeline();
  }
}

function formatUpstreamDate(dateStr) {
  if (!dateStr) return '';
  // Convert 2026-02-09 to 02/09
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return parts[1] + '/' + parts[2] + '<br><span class="upstream-year">' + parts[0] + '</span>';
  }
  return dateStr;
}

// ============================================================
// UPSTREAM SUB-TAB SWITCHING
// ============================================================
function initUpstreamSubTabs() {
  document.querySelectorAll('.upstream-subtab').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('.upstream-subtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.upstream-subtab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      this.classList.add('active');
      const target = document.getElementById('usubtab-' + this.dataset.usubtab);
      target.classList.add('active');
      target.style.display = 'block';
    };
  });
}

// ============================================================
// SAFETY PLAN SUB-TAB
// ============================================================
let spActiveProject = null;

function getSafetyPlanData() {
  return DATA.safetyPlanPerProject || {};
}

function getAllVehicleProjects() {
  const up = DATA.upstreamPlan;
  if (!up || !up.views) return [];
  const projects = [];
  ['FAW', 'SVW', 'VWA'].forEach(viewName => {
    if (!up.views[viewName]) return;
    up.views[viewName].projects.forEach(p => {
      // Only include software iteration projects (not "Vehicle MS" rows)
      if (!p.name.includes('Vehicle MS')) {
        projects.push({
          name: p.name,
          view: viewName,
          matrix: p.matrix
        });
      }
    });
  });
  return projects;
}

function renderSafetyPlan() {
  const projects = getAllVehicleProjects();
  if (projects.length === 0) return;
  if (!spActiveProject || !projects.find(p => p.name === spActiveProject)) {
    spActiveProject = projects[0].name;
  }

  // Populate project select
  const projSel = document.getElementById('safetyplan-project-select');
  projSel.innerHTML = '';
  projects.forEach(p => {
    const label = p.name.length > 60 ? p.name.substring(0, 58) + '..' : p.name;
    projSel.innerHTML += '<option value="' + p.name + '">' + label + '</option>';
  });
  projSel.value = spActiveProject;

  // Populate phase filter
  const phaseSel = document.getElementById('safetyplan-phase-select');
  phaseSel.innerHTML = '<option value="">All</option>';
  DATA.deliverables.forEach(phase => {
    phaseSel.innerHTML += '<option value="' + phase.phase + '">' + phase.phase + '</option>';
  });

  // Populate owner filter
  const ownerSel = document.getElementById('safetyplan-owner-select');
  ownerSel.innerHTML = '<option value="">All</option><option value="VFSM">VFSM</option><option value="Domain">Domain</option><option value="Supplier">Supplier</option>';

  // Stats
  const spData = getSafetyPlanData();
  const projData = spData[spActiveProject] || {};
  const statuses = projData.statuses || {};
  const allDeliverables = getAllDeliverables();
  const total = allDeliverables.length;
  const done = Object.values(statuses).filter(s => s === 'done').length;
  const inProgress = Object.values(statuses).filter(s => s === 'progress').length;
  const planned = Object.values(statuses).filter(s => s === 'planned').length;
  const pending = Object.values(statuses).filter(s => s === 'pending' || !s).length;

  document.getElementById('safetyplan-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${projects.length}</div><div class="stat-label">Vehicle Projects</div></div>
    <div class="stat-card green"><div class="stat-value">${total}</div><div class="stat-label">Safety Deliverables</div></div>
    <div class="stat-card orange"><div class="stat-value" style="font-size:14px">${spActiveProject.substring(0,30)}${spActiveProject.length>30?'..':''}</div><div class="stat-label">Selected Project</div></div>
    <div class="stat-card purple"><div class="stat-value">${done}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card blue"><div class="stat-value">${inProgress}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card orange"><div class="stat-value">${pending}</div><div class="stat-label">Not Started</div></div>
  `;

  // Clone to remove old listeners
  ['safetyplan-project-select', 'safetyplan-phase-select', 'safetyplan-owner-select', 'safetyplan-search'].forEach(id => {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('input', function() {
      if (id === 'safetyplan-project-select') {
        spActiveProject = this.value;
        renderSafetyPlan();
      } else {
        updateSafetyPlanTable();
      }
    });
  });

  updateSafetyPlanTable();
}

function spLevelClass(level) {
  if (level === 'Vehicle Item') return 'sp-level-vehicle';
  if (level === 'Product Group') return 'sp-level-group';
  if (level === 'Component') return 'sp-level-component';
  if (level === 'Supplier') return 'sp-level-supplier';
  return '';
}

function spStatusBadge(status) {
  if (status === 'done') return '<span class="sp-status-done">Done</span>';
  if (status === 'progress') return '<span class="sp-status-progress">In Progress</span>';
  if (status === 'planned') return '<span class="sp-status-planned">Planned</span>';
  if (status === 'na') return '<span class="sp-status-na">N/A</span>';
  return '<span class="sp-status-pending">Pending</span>';
}

function updateSafetyPlanTable() {
  const spData = getSafetyPlanData();
  const projData = spData[spActiveProject] || {};
  const statuses = projData.statuses || {};
  const remarks = projData.remarks || {};

  const phaseFilter = document.getElementById('safetyplan-phase-select').value;
  const ownerFilter = document.getElementById('safetyplan-owner-select').value;
  const search = document.getElementById('safetyplan-search').value.toLowerCase();

  let html = '<thead><tr>';
  html += '<th style="width:50px">ID</th>';
  html += '<th style="width:140px">Phase</th>';
  html += '<th style="width:220px">Activity</th>';
  html += '<th style="width:260px">Deliverable</th>';
  html += '<th style="width:80px">ISO Ref</th>';
  html += '<th style="width:70px">Owner</th>';
  html += '<th style="width:110px">Level</th>';
  html += '<th style="width:130px">Status</th>';
  html += '<th style="width:220px">Remark</th>';
  html += '</tr></thead><tbody>';

  let count = 0;
  DATA.deliverables.forEach(phase => {
    if (phaseFilter && phase.phase !== phaseFilter) return;

    const filteredItems = phase.items.filter(item => {
      if (ownerFilter && item.owner !== ownerFilter) return false;
      if (search) {
        const text = (item.id + ' ' + item.activity + ' ' + item.deliverable + ' ' + item.annex + ' ' + item.isoRef).toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
    if (filteredItems.length === 0) return;

    html += '<tr class="phase-row"><td colspan="9">' + phase.phase + ' <span class="muted text-xs">(' + phase.isoPart + ')</span> <span class="badge" style="margin-left:8px">' + filteredItems.length + '</span></td></tr>';

    filteredItems.forEach(item => {
      const ii = phase.items.indexOf(item);
      const key = phase.phase.split(':')[0] + '-' + ii;
      const status = statuses[key] || '';
      const remark = remarks[key] || '';

      html += '<tr>';
      html += '<td class="font-bold">' + item.id + '</td>';
      html += '<td class="text-xs muted">' + phase.phase.split(':')[0] + '</td>';
      html += '<td>' + item.activity + '</td>';
      html += '<td class="text-sm">' + item.deliverable + (item.annex ? ' <span class="text-xs muted">[' + item.annex + ']</span>' : '') + '</td>';
      html += '<td class="text-xs muted">' + (item.isoRef || '—') + '</td>';
      html += '<td>' + ownerBadge(item.owner) + '</td>';
      html += '<td><span class="' + spLevelClass(item.level) + '">' + item.level + '</span></td>';
      html += '<td class="sp-status-cell" data-key="' + key + '" data-field="status" style="cursor:pointer">' + spStatusBadge(status) + '</td>';
      html += '<td class="text-xs muted sp-remark-cell" data-key="' + key + '" data-field="remark" style="cursor:pointer">' + (remark || '<span class="muted">—</span>') + '</td>';
      html += '</tr>';
      count++;
    });
  });
  html += '</tbody>';
  document.getElementById('safetyplan-table').innerHTML = html;
  document.getElementById('safetyplan-badge').textContent = spActiveProject.substring(0, 40) + (spActiveProject.length > 40 ? '..' : '') + ' · ' + count + ' deliverables';

  // Attach click handlers for status cycling and remark editing
  attachSafetyPlanEditors(spActiveProject);
}

function attachSafetyPlanEditors(projectName) {
  // Status cell: click to cycle through statuses
  document.querySelectorAll('.sp-status-cell').forEach(cell => {
    cell.onclick = function() {
      const key = this.dataset.key;
      const spData = getSafetyPlanData();
      if (!spData[projectName]) spData[projectName] = { statuses: {}, remarks: {} };
      if (!spData[projectName].statuses) spData[projectName].statuses = {};
      const current = spData[projectName].statuses[key] || '';
      const cycle = ['', 'planned', 'progress', 'done', 'na'];
      const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
      spData[projectName].statuses[key] = cycle[nextIdx];
      DATA.safetyPlanPerProject = spData;
      markDirty();
      // Update just this cell
      this.innerHTML = spStatusBadge(spData[projectName].statuses[key]);
    };
  });

  // Remark cell: click to edit inline
  document.querySelectorAll('.sp-remark-cell').forEach(cell => {
    cell.onclick = function() {
      if (this.classList.contains('editing')) return;
      this.classList.add('editing');
      const key = this.dataset.key;
      const spData = getSafetyPlanData();
      if (!spData[projectName]) spData[projectName] = { statuses: {}, remarks: {} };
      if (!spData[projectName].remarks) spData[projectName].remarks = {};
      const oldValue = spData[projectName].remarks[key] || '';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldValue;
      input.style.width = '100%';
      input.style.background = 'var(--bg)';
      input.style.border = '1px solid var(--blue)';
      input.style.color = 'var(--text)';
      input.style.padding = '2px 6px';
      input.style.borderRadius = '4px';
      input.style.fontSize = '12px';

      const origHTML = this.innerHTML;
      this.innerHTML = '';
      this.appendChild(input);
      input.focus();
      input.select();

      const save = () => {
        spData[projectName].remarks[key] = input.value;
        DATA.safetyPlanPerProject = spData;
        this.classList.remove('editing');
        this.innerHTML = input.value || '<span class="muted">—</span>';
        markDirty();
      };
      const cancel = () => {
        this.classList.remove('editing');
        this.innerHTML = origHTML;
      };
      input.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      };
      input.onblur = save;
    };
  });
}

// ============================================================
// LAYER 3: SYSTEM & SUBSYSTEM
// ============================================================
let sysSubActive = null;

function getSystemLevelDeliverables() {
  const result = [];
  DATA.deliverables.forEach(phase => {
    if (phase.phase.includes('4A')) {
      phase.items.forEach(item => {
        result.push({ ...item, phase: phase.phase, isoPart: phase.isoPart });
      });
    }
  });
  return result;
}

function getSystemsTree() {
  const cm = getCompData();
  const comps = cm.components || [];
  const tree = {};
  comps.forEach(c => {
    const domain = c.domain || 'Other';
    const abbr = c.abbreviation || '';
    const supplier = (c.supplier || '').split('\n')[0].trim();
    if (!tree[domain]) tree[domain] = { components: {}, count: 0 };
    if (!tree[domain].components[abbr]) tree[domain].components[abbr] = { suppliers: [], asil: '', fullName: '' };
    if (!tree[domain].components[abbr].suppliers.includes(supplier) && supplier) {
      tree[domain].components[abbr].suppliers.push(supplier);
    }
    if (!tree[domain].components[abbr].asil) tree[domain].components[abbr].asil = c.asil || '';
    if (!tree[domain].components[abbr].fullName) tree[domain].components[abbr].fullName = c.fullName || '';
    tree[domain].count++;
  });
  return tree;
}

function renderSysSub() {
  const tree = getSystemsTree();
  const systems = Object.keys(tree);
  if (systems.length === 0) return;
  if (!sysSubActive || !systems.includes(sysSubActive)) sysSubActive = systems[0];

  const sysDeliverables = getSystemLevelDeliverables();
  const csData = getCompSafetyData();

  // Stats
  let totalComps = 0;
  systems.forEach(s => totalComps += Object.keys(tree[s].components).length);
  document.getElementById('syssub-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${systems.length}</div><div class="stat-label">Systems</div></div>
    <div class="stat-card green"><div class="stat-value">${totalComps}</div><div class="stat-label">Unique Components</div></div>
    <div class="stat-card purple"><div class="stat-value">${sysDeliverables.length}</div><div class="stat-label">System-Level Deliverables (Phase 4A)</div></div>
    <div class="stat-card orange"><div class="stat-value" style="font-size:14px">${sysSubActive.substring(0,25)}</div><div class="stat-label">Selected System</div></div>
  `;

  // Left: system list
  let listHtml = '';
  systems.forEach(sys => {
    const active = sys === sysSubActive ? 'active' : '';
    const compCount = Object.keys(tree[sys].components).length;
    listHtml += '<div class="comp-safety-item ' + active + '" data-sys="' + sys + '">';
    listHtml += '<div class="comp-safety-abbr">' + sys + '</div>';
    listHtml += '<div class="comp-safety-name">' + compCount + ' components &middot; ' + tree[sys].count + ' entries</div>';
    listHtml += '<div class="comp-safety-meta"><span class="comp-safety-domain">' + Object.values(tree[sys].components).map(c => c.asil).filter(a => a).slice(0, 3).join('/') + '</span></div>';
    listHtml += '</div>';
  });
  const listEl = document.getElementById('syssub-sys-list');
  listEl.innerHTML = listHtml;
  document.getElementById('syssub-sys-badge').textContent = systems.length + ' systems';

  listEl.querySelectorAll('.comp-safety-item').forEach(item => {
    item.onclick = function() {
      sysSubActive = this.dataset.sys;
      renderSysSub();
    };
  });

  // Right: system-level deliverables table
  const sysKey = spActiveProject + '||' + sysSubActive;
  const sysData = csData[sysKey] || {};
  const statuses = sysData.statuses || {};
  const remarks = sysData.remarks || {};

  document.getElementById('syssub-deliv-badge').textContent = sysSubActive + ' · ' + sysDeliverables.length + ' deliverables';

  let html = '<thead><tr><th style="width:50px">ID</th><th style="width:200px">Activity</th><th style="width:300px">Deliverable</th><th style="width:70px">ISO Ref</th><th style="width:70px">Owner</th><th style="width:90px">Status</th><th>Remark</th></tr></thead><tbody>';
  html += '<tr class="phase-row"><td colspan="7">' + sysSubActive + ' — System Design & Integration (Phase 4A)</td></tr>';
  sysDeliverables.forEach(item => {
    const key = '4A-' + item.id;
    const status = statuses[key] || '';
    const remark = remarks[key] || '';
    html += '<tr>';
    html += '<td class="font-bold">' + item.id + '</td>';
    html += '<td>' + item.activity + '</td>';
    html += '<td class="text-sm">' + item.deliverable + (item.annex ? ' <span class="text-xs muted">[' + item.annex + ']</span>' : '') + '</td>';
    html += '<td class="text-xs muted">' + (item.isoRef || '—') + '</td>';
    html += '<td>' + ownerBadge(item.owner) + '</td>';
    html += '<td class="ss-status-cell" data-key="' + key + '" style="cursor:pointer">' + spStatusBadge(status) + '</td>';
    html += '<td class="text-xs muted ss-remark-cell" data-key="' + key + '" style="cursor:pointer">' + (remark || '<span class="muted">—</span>') + '</td>';
    html += '</tr>';
  });
  html += '</tbody>';
  document.getElementById('syssub-table').innerHTML = html;
  attachInlineStatusEditors('syssub-table', 'ss-status-cell', 'ss-remark-cell', sysKey);
}

// ============================================================
// LAYER 4: COMPONENT SAFETY PLAN (ZCU template)
// ============================================================
let compSPActive = null;

function getCompSPTemplate() {
  return DATA.componentSafetyTemplate || {};
}

function getCompSPData() {
  return DATA.compSafetyPlan || {};
}

function getCompSafetyData() {
  return DATA.compSafetyPlan || {};
}

function renderCompSP() {
  const tree = getSystemsTree();
  const allComps = [];
  Object.keys(tree).forEach(sys => {
    Object.keys(tree[sys].components).forEach(abbr => {
      const c = tree[sys].components[abbr];
      allComps.push({ abbreviation: abbr, system: sys, ...c });
    });
  });

  if (allComps.length === 0) return;
  if (!compSPActive || !allComps.find(c => c.abbreviation === compSPActive)) {
    compSPActive = allComps[0].abbreviation;
  }

  const tpl = getCompSPTemplate();
  const tplWP = [];
  Object.keys(tpl.isoGroups || {}).forEach(part => {
    (tpl.isoGroups[part] || []).forEach(wp => {
      tplWP.push({ ...wp, isoPartFull: part });
    });
  });

  // Stats
  const csData = getCompSPData();
  let totalDone = 0, totalItems = 0;
  const compKey = spActiveProject + '||' + compSPActive;
  const compData = csData[compKey] || {};
  const statuses = compData.statuses || {};
  tplWP.forEach(wp => {
    totalItems++;
    if (statuses[wp.id] === 'done') totalDone++;
  });

  document.getElementById('compsp-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${allComps.length}</div><div class="stat-label">Components</div></div>
    <div class="stat-card green"><div class="stat-value">${tplWP.length}</div><div class="stat-label">Work Products (per component)</div></div>
    <div class="stat-card purple"><div class="stat-value">${totalDone}</div><div class="stat-label">Completed (this component)</div></div>
    <div class="stat-card orange"><div class="stat-value" style="font-size:14px">${compSPActive}</div><div class="stat-label">Selected Component</div></div>
  `;

  // Render component list
  renderCompSPList(allComps, tplWP);

  // Populate ISO filter
  const isoSel = document.getElementById('compsp-iso-filter');
  isoSel.innerHTML = '<option value="">All</option>';
  Object.keys(tpl.isoGroups || {}).forEach(part => {
    const short = part.split('\n')[0].substring(0, 40);
    isoSel.innerHTML += '<option value="' + part + '">' + short + ' (' + tpl.isoGroups[part].length + ')</option>';
  });

  // Render table
  renderCompSPTable(tplWP, allComps);

  // Search
  const searchEl = document.getElementById('compsp-comp-search');
  const searchClone = searchEl.cloneNode(true);
  searchEl.parentNode.replaceChild(searchClone, searchEl);
  searchClone.addEventListener('input', function() { renderCompSPList(allComps, tplWP, this.value); });

  // Filters
  ['compsp-iso-filter', 'compsp-resp-filter'].forEach(id => {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', function() { renderCompSPTable(tplWP, allComps); });
  });
}

function renderCompSPList(allComps, tplWP, search) {
  let comps = allComps;
  if (search) {
    const s = search.toLowerCase();
    comps = comps.filter(c => (c.abbreviation + ' ' + c.fullName + ' ' + c.system).toLowerCase().includes(s));
  }

  // Group by system
  const groups = {};
  comps.forEach(c => {
    if (!groups[c.system]) groups[c.system] = [];
    groups[c.system].push(c);
  });

  const csData = getCompSPData();
  let html = '';
  Object.keys(groups).forEach(sys => {
    html += '<div class="comp-safety-group-header">' + sys + ' <span class="badge">' + groups[sys].length + '</span></div>';
    html += '<div class="comp-safety-list">';
    groups[sys].forEach(c => {
      const active = c.abbreviation === compSPActive ? 'active' : '';
      const compKey = spActiveProject + '||' + c.abbreviation;
      const compData = csData[compKey] || {};
      const done = Object.values(compData.statuses || {}).filter(s => s === 'done').length;
      const pct = tplWP.length > 0 ? Math.round(done / tplWP.length * 100) : 0;
      const asilTag = c.asil ? '<span class="tag tag-asil-' + c.asil.toLowerCase() + '">' + c.asil + '</span>' : '';
      const supCount = c.suppliers.length;
      html += '<div class="comp-safety-item ' + active + '" data-abbr="' + c.abbreviation + '">';
      html += '<div class="comp-safety-abbr">' + c.abbreviation + ' ' + asilTag + '</div>';
      html += '<div class="comp-safety-name">' + (c.fullName || '') + '</div>';
      html += '<div class="comp-safety-meta">';
      html += '<span class="comp-safety-domain">' + supCount + ' supplier' + (supCount > 1 ? 's' : '') + '</span>';
      html += '<span class="comp-safety-progress">' + done + '/' + tplWP.length + ' (' + pct + '%)</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  });

  const listEl = document.getElementById('compsp-comp-list');
  listEl.innerHTML = html;
  document.getElementById('compsp-comp-badge').textContent = comps.length + ' components';

  listEl.querySelectorAll('.comp-safety-item').forEach(item => {
    item.onclick = function() {
      compSPActive = this.dataset.abbr;
      renderCompSP();
    };
  });
}

function renderCompSPTable(tplWP, allComps) {
  const tpl = getCompSPTemplate();
  const csData = getCompSPData();
  const compKey = spActiveProject + '||' + compSPActive;
  const compData = csData[compKey] || {};
  const statuses = compData.statuses || {};
  const remarks = compData.remarks || {};

  const isoFilter = document.getElementById('compsp-iso-filter').value;
  const respFilter = document.getElementById('compsp-resp-filter').value;

  // Find component info
  const cm = getCompData();
  const compInfo = (cm.components || []).find(c => c.abbreviation === compSPActive);

  // Info bar
  let infoHtml = '';
  if (compInfo) {
    infoHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">';
    infoHtml += '<span class="font-bold">' + compInfo.abbreviation + '</span>';
    infoHtml += '<span class="text-sm">' + (compInfo.fullName || '') + '</span>';
    if (compInfo.asil) infoHtml += '<span class="tag tag-asil-' + compInfo.asil.toLowerCase() + '">ASIL ' + compInfo.asil + '</span>';
    infoHtml += '<span class="text-xs muted">Domain: ' + (compInfo.domain || '') + '</span>';
    infoHtml += '<span class="text-xs muted">Suppliers: ' + (compInfo.supplier || '').split('\n')[0] + '</span>';
    infoHtml += '</div>';
  }
  document.getElementById('compsp-info').innerHTML = infoHtml;
  document.getElementById('compsp-deliv-badge').textContent = compSPActive + ' · ISO 26262 Work Products';

  // Filter work products
  const filtered = tplWP.filter(wp => {
    if (isoFilter && wp.isoPartFull !== isoFilter) return false;
    if (respFilter && wp.responsibility !== respFilter) return false;
    return true;
  });

  // Group by ISO Part
  const groups = {};
  filtered.forEach(wp => {
    if (!groups[wp.isoPartFull]) groups[wp.isoPartFull] = [];
    groups[wp.isoPartFull].push(wp);
  });

  const respBadge = {
    'gx': '<span class="sp-status-progress">GX</span>',
    'vctc': '<span class="sp-status-na">VCTC</span>',
    'shared': '<span class="sp-status-planned">Shared</span>',
    'unknown': '<span class="sp-status-pending">?</span>',
  };

  let html = '<thead><tr><th style="width:40px">#</th><th style="width:160px">Activity</th><th style="width:50px">ISO Ch.</th><th style="width:320px">Work Product</th><th style="width:60px">Resp</th><th style="width:80px">DDL</th><th style="width:80px">Status</th><th>Remark</th></tr></thead><tbody>';

  Object.keys(groups).forEach(part => {
    const items = groups[part];
    const short = part.split('\n')[0];
    html += '<tr class="phase-row"><td colspan="8">' + short + ' <span class="badge">' + items.length + '</span></td></tr>';
    items.forEach(wp => {
      const status = statuses[wp.id] || '';
      const remark = remarks[wp.id] || '';
      const ddlShort = (wp.ddl || '').replace('VCTC_', '').substring(0, 25);
      html += '<tr>';
      html += '<td class="text-xs muted">' + wp.id + '</td>';
      html += '<td class="text-sm">' + wp.activity + '</td>';
      html += '<td class="text-xs muted">' + (wp.isoChapter || '') + '</td>';
      html += '<td class="text-sm">' + wp.workProduct + '</td>';
      html += '<td>' + (respBadge[wp.responsibility] || respBadge.unknown) + '</td>';
      html += '<td class="text-xs muted">' + ddlShort + '</td>';
      html += '<td class="cs-status-cell" data-key="' + wp.id + '" style="cursor:pointer">' + spStatusBadge(status) + '</td>';
      html += '<td class="text-xs muted cs-remark-cell" data-key="' + wp.id + '" style="cursor:pointer">' + (remark || '<span class="muted">—</span>') + '</td>';
      html += '</tr>';
    });
  });
  html += '</tbody>';
  document.getElementById('compsp-table').innerHTML = html;
  attachInlineStatusEditors('compsp-table', 'cs-status-cell', 'cs-remark-cell', compKey);
}

// ============================================================
// SHARED: Inline status/remark editors
// ============================================================
function attachInlineStatusEditors(tableId, statusClass, remarkClass, dataKey) {
  const table = document.getElementById(tableId);

  table.querySelectorAll('.' + statusClass).forEach(cell => {
    cell.onclick = function() {
      const sKey = this.dataset.key;
      const csData = getCompSafetyData();
      if (!csData[dataKey]) csData[dataKey] = { statuses: {}, remarks: {} };
      if (!csData[dataKey].statuses) csData[dataKey].statuses = {};
      const current = csData[dataKey].statuses[sKey] || '';
      const cycle = ['', 'planned', 'progress', 'done', 'na'];
      const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
      csData[dataKey].statuses[sKey] = cycle[nextIdx];
      DATA.compSafetyPlan = csData;
      markDirty();
      this.innerHTML = spStatusBadge(csData[dataKey].statuses[sKey]);
    };
  });

  table.querySelectorAll('.' + remarkClass).forEach(cell => {
    cell.onclick = function() {
      if (this.classList.contains('editing')) return;
      this.classList.add('editing');
      const sKey = this.dataset.key;
      const csData = getCompSafetyData();
      if (!csData[dataKey]) csData[dataKey] = { statuses: {}, remarks: {} };
      if (!csData[dataKey].remarks) csData[dataKey].remarks = {};
      const oldValue = csData[dataKey].remarks[sKey] || '';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldValue;
      input.style.cssText = 'width:100%;background:var(--bg);border:1px solid var(--blue);color:var(--text);padding:2px 6px;border-radius:4px;font-size:12px';

      const origHTML = this.innerHTML;
      this.innerHTML = '';
      this.appendChild(input);
      input.focus();
      input.select();

      const save = () => {
        csData[dataKey].remarks[sKey] = input.value;
        DATA.compSafetyPlan = csData;
        this.classList.remove('editing');
        this.innerHTML = input.value || '<span class="muted">—</span>';
        markDirty();
      };
      const cancel = () => { this.classList.remove('editing'); this.innerHTML = origHTML; };
      input.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      };
      input.onblur = save;
    };
  });
}

// ============================================================
// VEHICLE LINEAGE TAB
// ============================================================
function renderLineage() {
  if (!DATA.productGroups) return;

  // Build lineage data from productGroups
  const lineageData = [
    // MEB31
    { platform: 'MEB31', platformTag: 'tag-meb31', vehicle: 'Acose', jv: 'VWA',
      y2026: '<span class="lc-new">ALS1</span> 2025-12<br><span class="lc-co">ALS2/3</span> 2026-09',
      y2027: '<span class="lc-co">MY28</span> 2027-09', y2028: '<span class="lc-none">—</span>',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: '2026首发ALS1+ALS2年型，2027 MY28年型更新。2028无新SOP，VWA退出。' },
    { platform: 'MEB31', platformTag: 'tag-meb31', vehicle: 'BL (A SUVe)', jv: 'VWA',
      y2026: '<span class="lc-new">MY26 ALS1</span> 2026-03<br><span class="lc-co">ALS2/3</span> 2026-09',
      y2027: '<span class="lc-co">MY28</span> 2027-09', y2028: '<span class="lc-none">—</span>',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: '与Acose同平台。2026首发+年型，2027 MY28。VWA最后一款MEB31。' },
    { platform: 'MEB31', platformTag: 'tag-meb31', vehicle: 'ID.4 PA', jv: 'FAW-VW',
      y2026: '<span class="lc-new">首发</span> 2026-09<br><span class="lc-co">MPP</span> 2026-11',
      y2027: '<span class="lc-co">MY28</span> 2027-09', y2028: '<span class="lc-none">—</span>',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: '2026首发+MPP版本，2027 MY28年型。FAW-VW侧MEB31唯一车型。' },
    // CMP21
    { platform: 'CMP21', platformTag: 'tag-cmp21', vehicle: 'A Main SUVe', jv: 'SVW',
      y2026: '<span class="lc-new">首发</span> 2026-09<br><span class="lc-co">ALS2</span> 2026-11',
      y2027: '<span class="lc-co">MY27</span> 2027-05', y2028: '<span class="lc-none">—</span>',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'SVW主力SUV。2026首发+ALS2，2027 MY27年型。' },
    { platform: 'CMP21', platformTag: 'tag-cmp21', vehicle: 'A NB', jv: 'FAW-VW',
      y2026: '<span class="lc-new">首发</span> 2026-11',
      y2027: '<span class="lc-var">BEV MY27</span> 2027-08<br><span class="lc-var">PHEV</span> 2027-05<br><span class="lc-var">HEV</span> 2027-12',
      y2028: '<span class="lc-none">—</span>',
      level: 'New PT', levelClass: 'lv-var',
      notes: '2026首发BEV，2027扩展3种动力总成。PHEV/HEV需新HARA。' },
    { platform: 'CMP21', platformTag: 'tag-cmp21', vehicle: 'A SUVe Export', jv: 'SVW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-var">Export LHD</span> 2027-09 (AR)<br><span class="lc-var">Export RHD</span> 2027-10 (AU+NZ)',
      y2028: '<span class="lc-none">—</span>',
      level: 'New Market', levelClass: 'lv-var',
      notes: '基于SVW A Main SUVe，2027首次出口。阿根廷LHD+澳新RHD。' },
    { platform: 'CMP21', platformTag: 'tag-cmp21', vehicle: 'India SUVe', jv: 'Indien',
      y2026: '<span class="lc-none">—</span>', y2027: '<span class="lc-none">—</span>',
      y2028: '<span class="lc-new">Skoda首发</span> 2028-07<br><span class="lc-new">VW首发</span> 2028-10',
      level: 'New Market', levelClass: 'lv-var',
      notes: 'CMP21印度市场首发。Skoda+VW双品牌RHD。CMVR法规全新合规。' },
    // CSP31
    { platform: 'CSP31', platformTag: 'tag-csp31', vehicle: 'CS B NB (SVW)', jv: 'SVW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">BEV首发</span> 2027-08', y2028: '<span class="lc-none">—</span>',
      level: 'All-New', levelClass: 'lv-new',
      notes: 'CSP31平台首发车型。全新平台=全新EE拓扑+安全目标。' },
    { platform: 'CSP31', platformTag: 'tag-csp31', vehicle: 'CS B NB (FAW)', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>', y2027: '<span class="lc-none">—</span>',
      y2028: '<span class="lc-co">BEV</span> 2028-03<br><span class="lc-var">EREV</span> 2028-03',
      level: 'New Variant', levelClass: 'lv-var',
      notes: 'FAW-VW版CS B NB。BEV沿用SVW安全案例+EREV新增增程器安全范围。' },
    { platform: 'CSP31', platformTag: 'tag-csp31', vehicle: 'CN B SUV (FAW)', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">BEV 5S首发</span> 2027-10<br><span class="lc-var">EREV 5S</span> 2027-11',
      y2028: '<span class="lc-co">EREV 6S</span> 2028-10<br><span class="lc-var">BEV 5S Exp RHD</span> 2028-02',
      level: 'New Variant', levelClass: 'lv-var',
      notes: '5座首发→EREV变体→6座变体→澳洲出口。同一车身多配置演进。' },
    { platform: 'CSP31', platformTag: 'tag-csp31', vehicle: 'CS A+ SUV (SVW)', jv: 'SVW',
      y2026: '<span class="lc-none">—</span>', y2027: '<span class="lc-none">—</span>',
      y2028: '<span class="lc-new">BEV首发</span> 2028-01<br><span class="lc-var">EREV</span> 2028-03',
      level: 'All-New', levelClass: 'lv-new',
      notes: 'CSP31B平台首发。A+级别SUV，BEV+EREV双动力。' },
    // MQB 41BW
    { platform: 'MQB 41BW', platformTag: 'tag-mqb', vehicle: 'Talagon', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-08', y2028: '<span class="lc-co">C7</span> 2028-03',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。换代间隔约8个月，C7沿用C6B零部件。' },
    { platform: 'MQB 41BW', platformTag: 'tag-mqb', vehicle: 'Tavendor', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-09', y2028: '<span class="lc-co">C7</span> 2028-05',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。与Talagon共平台。' },
    { platform: 'MQB 41BW', platformTag: 'tag-mqb', vehicle: 'Teramont', jv: 'SVW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-09', y2028: '<span class="lc-co">C7</span> 2028-03',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。SVW侧41BW车型。' },
    // MQB 48W
    { platform: 'MQB 48W', platformTag: 'tag-mqb', vehicle: 'Magotan Pro', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-10', y2028: '<span class="lc-co">C7</span> 2028-02',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。换代间隔仅4个月。' },
    { platform: 'MQB 48W', platformTag: 'tag-mqb', vehicle: 'Passat', jv: 'SVW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-11', y2028: '<span class="lc-co">C7</span> 2028-03',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。' },
    // MQB 37W
    { platform: 'MQB 37W', platformTag: 'tag-mqb', vehicle: 'Tiguan', jv: 'SVW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-10', y2028: '<span class="lc-co">C7</span> 2028-04',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。' },
    { platform: 'MQB 37W', platformTag: 'tag-mqb', vehicle: 'Tayron', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-11', y2028: '<span class="lc-co">C7</span> 2028-05',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: 'C6B→C7年型更新。注意Tayron S C7是A SUV定位。' },
    { platform: 'MQB 37W', platformTag: 'tag-mqb', vehicle: 'Sagitar S (Bora)', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>', y2027: '<span class="lc-none">—</span>',
      y2028: '<span class="lc-new">C7首发</span> 2028-05',
      level: 'All-New', levelClass: 'lv-new',
      notes: '无C6B，直接C7首发。MQB37W新车型。' },
    { platform: 'MQB 37W', platformTag: 'tag-mqb', vehicle: 'Sagitar L', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>', y2027: '<span class="lc-none">—</span>',
      y2028: '<span class="lc-new">C7首发</span> 2028-05',
      level: 'All-New', levelClass: 'lv-new',
      notes: '长轴版，无C6B，直接C7首发。' },
    { platform: 'MQB 37W', platformTag: 'tag-mqb', vehicle: 'Golf 8', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>', y2027: '<span class="lc-none">—</span>',
      y2028: '<span class="lc-new">C7首发</span> 2028-05',
      level: 'All-New', levelClass: 'lv-new',
      notes: '无C6B，直接C7首发。' },
    // MQB 37AW
    { platform: 'MQB 37AW', platformTag: 'tag-mqb', vehicle: 'Tayron', jv: 'FAW-VW',
      y2026: '<span class="lc-none">—</span>',
      y2027: '<span class="lc-new">C6B首发</span> 2027-11', y2028: '<span class="lc-co">C7</span> 2028-05',
      level: 'Carry-over', levelClass: 'lv-co',
      notes: '独立子平台。C6B→C7年型更新。与MQB37W的Tayron不同车型。' },
  ];

  // Stats
  const allNew = lineageData.filter(r => r.levelClass === 'lv-new').length;
  const newVar = lineageData.filter(r => r.levelClass === 'lv-var').length;
  const carryOver = lineageData.filter(r => r.levelClass === 'lv-co').length;
  document.getElementById('lineage-stats').innerHTML = `
    <div class="stat-card blue"><div class="stat-value">${lineageData.length}</div><div class="stat-label">Vehicle Lines</div></div>
    <div class="stat-card orange"><div class="stat-value">50</div><div class="stat-label">Total Programs (3yr)</div></div>
    <div class="stat-card green"><div class="stat-value">${allNew}</div><div class="stat-label">All-New Platform</div></div>
    <div class="stat-card purple"><div class="stat-value">${newVar}</div><div class="stat-label">New Variant / New PT</div></div>
    <div class="stat-card blue"><div class="stat-value">${carryOver}</div><div class="stat-label">Carry-over Year Model</div></div>
    <div class="stat-card orange"><div class="stat-value">2027</div><div class="stat-label">Peak Complexity Year</div></div>
  `;

  // Table
  let html = '<thead><tr><th>Platform</th><th>Vehicle Lineage</th><th>JV</th><th>2026</th><th>2027</th><th>2028</th><th>Change Level</th><th>Notes</th></tr></thead><tbody>';
  let lastPlatform = '';
  lineageData.forEach(r => {
    const showPlatform = r.platform !== lastPlatform;
    lastPlatform = r.platform;
    html += `<tr${showPlatform ? ' class="lineage-platform-break"' : ''}>
      <td>${showPlatform ? '<span class="pg-tag ' + r.platformTag + '">' + r.platform + '</span>' : ''}</td>
      <td class="font-bold">${r.vehicle}</td>
      <td class="text-sm muted">${r.jv}</td>
      <td class="text-sm">${r.y2026}</td>
      <td class="text-sm">${r.y2027}</td>
      <td class="text-sm">${r.y2028}</td>
      <td><span class="lv-badge ${r.levelClass}">${r.level}</span></td>
      <td class="text-sm muted">${r.notes}</td>
    </tr>`;
  });
  html += '</tbody>';
  document.getElementById('lineage-table').innerHTML = html;

  // Summary lists
  const newItems = lineageData.filter(r => r.levelClass === 'lv-new');
  const varItems = lineageData.filter(r => r.levelClass === 'lv-var');
  const coItems = lineageData.filter(r => r.levelClass === 'lv-co');

  document.getElementById('lineage-new-list').innerHTML = newItems.map(r =>
    `<div style="margin-bottom:4px"><span class="pg-tag ${r.platformTag}">${r.platform}</span> <strong>${r.vehicle}</strong> — ${r.notes}</div>`
  ).join('');
  document.getElementById('lineage-variant-list').innerHTML = varItems.map(r =>
    `<div style="margin-bottom:4px"><span class="pg-tag ${r.platformTag}">${r.platform}</span> <strong>${r.vehicle}</strong> — ${r.notes}</div>`
  ).join('');
  document.getElementById('lineage-carryover-list').innerHTML = coItems.map(r =>
    `<div style="margin-bottom:4px"><span class="pg-tag ${r.platformTag}">${r.platform}</span> <strong>${r.vehicle}</strong> — ${r.notes}</div>`
  ).join('');
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  renderOverview();
  renderTimeline();
  renderDeliverables();
  renderMapping();
  renderComponents();
  renderLineage();
  renderUpstreamPlan();
  renderSafetyPlan();
  renderSysSub();
  renderCompSP();
  renderDashboard();
  if (typeof renderHutOverview === 'function') renderHutOverview();
  attachEditableHandlers();
}

// ============================================================
// INIT
// ============================================================
async function init() {
  var params = new URLSearchParams(window.location.search);
  var singleTab = params.get('tab');
  if (singleTab) {
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.style.display = 'none'; });
    var headerEl = document.querySelector('header');
    if (headerEl) headerEl.style.display = 'none';
    var ok = await loadData();
    if (ok) {
      document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
      var target = document.getElementById('tab-' + singleTab);
      if (target) target.classList.add('active');
      initUpstreamSubTabs();
      renderAll();
      if (singleTab === 'upstream') {
        document.querySelectorAll('.upstream-subtab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.upstream-subtab-content').forEach(function(c) { c.classList.remove('active'); c.style.display = 'none'; });
        var firstSub = document.querySelector('.upstream-subtab[data-usubtab="projectplan"]');
        var firstContent = document.getElementById('usubtab-projectplan');
        if (firstSub) firstSub.classList.add('active');
        if (firstContent) { firstContent.classList.add('active'); firstContent.style.display = 'block'; }
      }
      document.getElementById('loading-overlay').classList.add('hidden');
    } else {
      document.getElementById('loading-overlay').classList.add('hidden');
    }
    return;
  }
  initNav();
  initUpstreamSubTabs();
  const ok2 = await loadData();
  if (ok2) {
    renderAll();
    document.getElementById('loading-overlay').classList.add('hidden');
    var hash = window.location.hash.replace('#', '');
    if (hash) {
      switchTab(hash);
    }
  } else {
    document.getElementById('loading-overlay').classList.add('hidden');
  }
}

window.addEventListener('beforeunload', function (e) {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

init();
