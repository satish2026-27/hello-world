/* ── State ────────────────────────────────────────────────────────────────── */
let currentParcelId = null;
let allParcels      = [];

/* ── View routing ─────────────────────────────────────────────────────────── */
function showView(name, parcelId) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('d-none'));
  document.getElementById('view-' + name).classList.remove('d-none');
  if (name === 'dashboard') loadDashboard();
  if (name === 'parcels')   loadParcels();
  if (name === 'detail' && parcelId) loadDetail(parcelId);
  if (name === 'uat')       renderUAT();
  if (name === 'receive')   populateMaterialDropdowns();
}

/* ── API helpers ─────────────────────────────────────────────────────────── */
async function api(url, method = 'GET', body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const id = 'toast-' + Date.now();
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.id = id;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ── Formatters ─────────────────────────────────────────────────────────── */
function stageBadge(s) {
  return `<span class="badge badge-${s} rounded-pill">${s.replace('_', ' ')}</span>`;
}
function originDot(o) {
  return `<span class="origin-dot dot-${o}"></span>${o.replace('_', '-')}`;
}
function txnChip(t) {
  return `<span class="txn-chip txn-${t}">${t.replace(/_/g, ' ')}</span>`;
}
function fmt(n, dec = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtUSD(n) {
  if (!n) return '—';
  return '$' + fmt(n, 2);
}

/* ── Dashboard ─────────────────────────────────────────────────────────── */
async function loadDashboard() {
  const d = await api('/api/dashboard');
  const s = d.stats;

  document.getElementById('statCards').innerHTML = [
    { label: 'Total Parcels', value: s.total_parcels, icon: 'bi-box-seam', col: 'gold' },
    { label: 'Available',     value: s.available,      icon: 'bi-check-circle', col: 'success' },
    { label: 'On Memo',       value: s.on_memo,         icon: 'bi-envelope', col: 'warning' },
    { label: 'In Production', value: s.in_production,   icon: 'bi-tools', col: 'info' },
    { label: 'Quarantined',   value: s.quarantined,     icon: 'bi-exclamation-triangle', col: 'danger' },
    { label: 'Total Weight (ct)', value: fmt(s.total_weight_ct, 2), icon: 'bi-rulers', col: 'secondary' },
    { label: 'Total Pieces',  value: fmt(s.total_pieces, 0), icon: 'bi-gem', col: 'primary' },
    { label: 'Portfolio Value', value: fmtUSD(s.total_value), icon: 'bi-currency-dollar', col: 'success' },
  ].map(c => `
    <div class="col-6 col-md-3 col-xl-2">
      <div class="card stat-card p-3">
        <div class="stat-value"><i class="bi ${c.icon} text-${c.col} me-1" style="font-size:1rem"></i>${c.value ?? 0}</div>
        <div class="stat-label">${c.label}</div>
      </div>
    </div>`).join('');

  document.querySelector('#matTable tbody').innerHTML = d.byMaterial.map(m => `
    <tr>
      <td>${originDot(m.material)} <strong>${m.material.replace('_', ' ')}</strong></td>
      <td>${m.count}</td>
      <td>${fmt(m.pieces, 0)}</td>
      <td>${fmt(m.weight_ct, 2)}</td>
      <td>${fmtUSD(m.value)}</td>
    </tr>`).join('');

  document.querySelector('#recentTxTable tbody').innerHTML = d.recentTxns.map(t => `
    <tr>
      <td>${t.physical_date}</td>
      <td><a href="#" onclick="showView('detail','${t.parcel_id}');return false">${t.parcel_number}</a></td>
      <td>${txnChip(t.transaction_type)}</td>
      <td class="${t.pieces_delta < 0 ? 'text-danger' : 'text-success'}">${t.pieces_delta > 0 ? '+' : ''}${t.pieces_delta}</td>
      <td class="${t.weight_delta_ct < 0 ? 'text-danger' : 'text-success'}">${t.weight_delta_ct > 0 ? '+' : ''}${fmt(t.weight_delta_ct, 4)}</td>
    </tr>`).join('');
}

/* ── Parcel List ────────────────────────────────────────────────────────── */
async function loadParcels() {
  const q  = document.getElementById('searchQ')?.value || '';
  const lc = document.getElementById('filterLifecycle')?.value || '';
  const mt = document.getElementById('filterMaterial')?.value || '';
  const params = new URLSearchParams();
  if (q)  params.set('q', q);
  if (lc) params.set('lifecycle_stage', lc);
  if (mt) params.set('material', mt);

  allParcels = await api('/api/parcels?' + params);

  document.getElementById('parcelBody').innerHTML = allParcels.map(p => `
    <tr>
      <td>
        <a href="#" class="fw-semibold text-primary" onclick="showView('detail','${p.id}');return false">${p.parcel_number}</a>
        ${p.parent_parcel_id ? '<span class="badge bg-secondary ms-1" title="Child parcel">child</span>' : ''}
      </td>
      <td>${originDot(p.material_origin)} ${p.material.replace(/_/g,' ')}</td>
      <td><small>${p.origin_country || '—'}</small></td>
      <td><small>${p.shape || '—'} ${p.size_min_mm ? p.size_min_mm + '–' + p.size_max_mm + 'mm' : ''}</small></td>
      <td><small>${p.color || ''}${p.color_range_max ? '–' + p.color_range_max : ''} ${p.clarity || ''}${p.clarity_range_max ? '–' + p.clarity_range_max : ''}</small></td>
      <td class="text-end">${fmt(p.current_pieces, 0)}</td>
      <td class="text-end">${fmt(p.current_weight_ct, 2)}</td>
      <td class="text-end fw-semibold text-success">${fmt(p.available.pieces, 0)} / ${fmt(p.available.weight, 2)}</td>
      <td>${stageBadge(p.lifecycle_stage)}</td>
      <td><small>${[p.site, p.vault, p.bin_location].filter(Boolean).join(' › ')}</small></td>
      <td>
        <button class="btn btn-xs btn-outline-primary py-0 px-1" onclick="showView('detail','${p.id}')"><i class="bi bi-eye"></i></button>
        <button class="btn btn-xs btn-outline-warning py-0 px-1 ms-1" onclick="openSplit('${p.id}')"><i class="bi bi-scissors"></i></button>
        <button class="btn btn-xs btn-outline-info py-0 px-1 ms-1" onclick="openTransfer('${p.id}')"><i class="bi bi-arrow-left-right"></i></button>
      </td>
    </tr>`).join('') || '<tr><td colspan="11" class="text-center text-muted py-3">No parcels found</td></tr>';
}

async function populateMaterialDropdowns() {
  const materials = await api('/api/meta/materials');
  ['materialSelect', 'filterMaterial'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    materials.forEach(m => {
      if (!sel.querySelector(`option[value="${m}"]`)) {
        const o = document.createElement('option');
        o.value = m; o.text = m.replace(/_/g,' ');
        sel.appendChild(o);
      }
    });
  });
}

/* ── Parcel Detail ──────────────────────────────────────────────────────── */
async function loadDetail(id) {
  currentParcelId = id;
  const p = await api('/api/parcels/' + id);
  const txns = await api('/api/parcels/' + id + '/transactions');
  const gene = await api('/api/parcels/' + id + '/genealogy').catch(() => null);

  const avail = p.available;

  document.getElementById('detailContent').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-12">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <h5 class="mb-0"><i class="bi bi-gem text-warning me-2"></i>${p.parcel_number}
                ${p.parent_parcel_id ? `<small class="text-muted">child of <a href="#" onclick="loadDetail('${p.parent_parcel_id}');return false">${p.parent_parcel_id}</a></small>` : ''}
              </h5>
              <div class="d-flex gap-1 flex-wrap">
                ${stageBadge(p.lifecycle_stage)}
                <button class="btn btn-sm btn-outline-warning" onclick="openSplit('${p.id}')"><i class="bi bi-scissors me-1"></i>Split</button>
                <button class="btn btn-sm btn-outline-info"    onclick="openTransfer('${p.id}')"><i class="bi bi-arrow-left-right me-1"></i>Transfer</button>
                <button class="btn btn-sm btn-outline-primary" onclick="openIssue('${p.id}')"><i class="bi bi-tools me-1"></i>Issue</button>
                ${p.wip_pieces > 0 ? `<button class="btn btn-sm btn-outline-success" onclick="openReturn('${p.id}')"><i class="bi bi-arrow-return-left me-1"></i>Return</button>` : ''}
                <button class="btn btn-sm btn-outline-secondary" onclick="openMemo('${p.id}')"><i class="bi bi-envelope me-1"></i>Memo</button>
                <button class="btn btn-sm btn-outline-danger"    onclick="openAdjust('${p.id}')"><i class="bi bi-calculator me-1"></i>Adjust</button>
              </div>
            </div>

            <div class="row g-2 mt-1">
              <div class="col-md-3"><small class="text-muted">Material</small><br><strong>${originDot(p.material_origin)} ${p.material.replace(/_/g,' ')}</strong></div>
              <div class="col-md-3"><small class="text-muted">Shape / Size</small><br>${p.shape || '—'} ${p.size_min_mm ? p.size_min_mm + '–' + p.size_max_mm + ' mm' : ''}</div>
              <div class="col-md-3"><small class="text-muted">Color</small><br>${p.color || '—'}${p.color_range_max ? ' – ' + p.color_range_max : ''}</div>
              <div class="col-md-3"><small class="text-muted">Clarity</small><br>${p.clarity || '—'}${p.clarity_range_max ? ' – ' + p.clarity_range_max : ''}</div>
              <div class="col-md-3"><small class="text-muted">Treatment</small><br>${p.treatment || 'none'}</div>
              <div class="col-md-3"><small class="text-muted">Origin</small><br>${p.origin_country || '—'}</div>
              <div class="col-md-3"><small class="text-muted">Screening</small><br>${p.screening_status}</div>
              <div class="col-md-3"><small class="text-muted">KP Certificate</small><br>${p.kimberley_cert || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Balance card -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold">Quantity & Weight</div>
          <div class="card-body">
            <table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>Dimension</th><th class="text-end">Pieces</th><th class="text-end">Weight (ct)</th></tr></thead>
              <tbody>
                <tr><td>Original</td>    <td class="text-end">${fmt(p.original_pieces,0)}</td>  <td class="text-end">${fmt(p.original_weight_ct,4)}</td></tr>
                <tr><td>Current</td>     <td class="text-end fw-bold">${fmt(p.current_pieces,0)}</td>  <td class="text-end fw-bold">${fmt(p.current_weight_ct,4)}</td></tr>
                <tr class="table-success"><td>Available</td><td class="text-end text-success fw-bold">${fmt(avail.pieces,0)}</td><td class="text-end text-success fw-bold">${fmt(avail.weight,4)}</td></tr>
                <tr><td>Reserved</td>    <td class="text-end">${fmt(p.reserved_pieces,0)}</td>  <td class="text-end">${fmt(p.reserved_weight_ct,4)}</td></tr>
                <tr><td>On Memo</td>     <td class="text-end">${fmt(p.memo_pieces,0)}</td>       <td class="text-end">${fmt(p.memo_weight_ct,4)}</td></tr>
                <tr><td>In WIP</td>      <td class="text-end">${fmt(p.wip_pieces,0)}</td>        <td class="text-end">${fmt(p.wip_weight_ct,4)}</td></tr>
                <tr><td>Damaged</td>     <td class="text-end text-danger">${fmt(p.damaged_pieces,0)}</td><td class="text-end">—</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Value card -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-header fw-semibold">Valuation & Location</div>
          <div class="card-body">
            <table class="table table-sm mb-0">
              <tbody>
                <tr><td>Purchase Rate</td>  <td class="text-end">${fmtUSD(p.purchase_rate)} / ${p.pricing_unit.replace('_',' ')}</td></tr>
                <tr><td>Landed Cost</td>    <td class="text-end fw-bold">${fmtUSD(p.landed_cost)}</td></tr>
                <tr><td>Current Cost</td>   <td class="text-end fw-bold text-primary">${fmtUSD(p.current_avg_cost)}</td></tr>
                <tr><td>Currency</td>       <td class="text-end">${p.currency}</td></tr>
                <tr><td colspan="2"><hr class="my-2"/></td></tr>
                <tr><td>Site</td>           <td class="text-end">${p.site || '—'}</td></tr>
                <tr><td>Vault</td>          <td class="text-end">${p.vault || '—'}</td></tr>
                <tr><td>Bin/Tray</td>       <td class="text-end">${p.bin_location || '—'}</td></tr>
                <tr><td>Custodian</td>      <td class="text-end">${p.custodian || '—'}</td></tr>
                <tr><td>Owner</td>          <td class="text-end">${p.owner || '—'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Certificates -->
      ${p.certificates.length ? `
      <div class="col-12">
        <div class="card">
          <div class="card-header fw-semibold">Certificates & Compliance</div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>Type</th><th>Number</th><th>Issued By</th><th>Date</th><th>Valid</th><th>Notes</th></tr></thead>
              <tbody>
                ${p.certificates.map(c => `<tr>
                  <td><span class="badge bg-secondary">${c.cert_type}</span></td>
                  <td>${c.cert_number || '—'}</td>
                  <td>${c.issued_by || '—'}</td>
                  <td>${c.issued_date || '—'}</td>
                  <td>${c.is_valid ? '<i class="bi bi-check-circle text-success"></i>' : '<i class="bi bi-x-circle text-danger"></i>'}</td>
                  <td><small>${c.notes || ''}</small></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>` : ''}

      <!-- Children -->
      ${p.children.length ? `
      <div class="col-12">
        <div class="card">
          <div class="card-header fw-semibold">Child Parcels (${p.children.length})</div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead class="table-light"><tr><th>Parcel #</th><th>Relationship</th><th>Pieces</th><th>Weight</th><th>Stage</th><th></th></tr></thead>
              <tbody>
                ${p.children.map(c => `<tr>
                  <td>${c.parcel_number}</td>
                  <td><span class="badge bg-info text-dark">${c.relationship_type}</span></td>
                  <td>${fmt(c.pieces_moved,0)}</td>
                  <td>${fmt(c.weight_moved_ct,4)}</td>
                  <td>${stageBadge(c.lifecycle_stage)}</td>
                  <td><button class="btn btn-xs btn-outline-primary py-0 px-1" onclick="loadDetail('${c.id}')"><i class="bi bi-eye"></i></button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>` : ''}

      <!-- Transaction ledger -->
      <div class="col-12">
        <div class="card">
          <div class="card-header fw-semibold">Transaction Ledger <span class="badge bg-secondary ms-1">${txns.length}</span></div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm mb-0">
                <thead class="table-dark">
                  <tr><th>Date</th><th>Type</th><th>Ref</th><th>Before Pcs</th><th>Δ Pcs</th><th>After Pcs</th><th>Δ Wt (ct)</th><th>From</th><th>To</th><th>By</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  ${txns.map(t => `<tr>
                    <td>${t.physical_date}</td>
                    <td>${txnChip(t.transaction_type)}</td>
                    <td><small>${t.reference_number || '—'}</small></td>
                    <td class="text-end">${fmt(t.before_pieces,0)}</td>
                    <td class="text-end fw-bold ${t.pieces_delta < 0 ? 'text-danger' : 'text-success'}">${t.pieces_delta > 0 ? '+' : ''}${fmt(t.pieces_delta,0)}</td>
                    <td class="text-end">${fmt(t.after_pieces,0)}</td>
                    <td class="text-end ${t.weight_delta_ct < 0 ? 'text-danger' : 'text-success'}">${t.weight_delta_ct > 0 ? '+' : ''}${fmt(t.weight_delta_ct,4)}</td>
                    <td><small>${t.location_from || t.custodian_from || '—'}</small></td>
                    <td><small>${t.location_to || t.custodian_to || '—'}</small></td>
                    <td><small>${t.created_by}</small></td>
                    <td><small>${t.notes || ''}</small></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Genealogy -->
      ${gene ? `
      <div class="col-12">
        <div class="card">
          <div class="card-header fw-semibold">Parcel Genealogy</div>
          <div class="card-body">
            ${renderGeneNode(gene)}
          </div>
        </div>
      </div>` : ''}
    </div>
  `;
}

function renderGeneNode(node) {
  if (!node) return '';
  const highlight = node.id === currentParcelId ? 'border-warning fw-bold' : '';
  let html = `<div class="gene-node ${highlight} mb-1">
    <a href="#" onclick="loadDetail('${node.id}');return false" class="text-decoration-none">
      <i class="bi bi-gem text-warning me-1"></i>${node.parcel_number}
    </a>
    <span class="text-muted ms-2 small">${node.current_pieces} pcs · ${fmt(node.current_weight_ct,2)} ct</span>
    ${stageBadge(node.lifecycle_stage)}
  </div>`;
  if (node.children && node.children.length) {
    html += `<div class="gene-child">${node.children.map(c => `
      <div class="mt-1"><span class="badge bg-info text-dark me-1 small">${c.relationship_type}</span>
      ${renderGeneNode(c)}</div>`).join('')}
    </div>`;
  }
  return html;
}

/* ── Receive Form ────────────────────────────────────────────────────────── */
async function submitReceive(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  // Convert numeric fields
  ['size_min_mm','size_max_mm','original_pieces','original_weight_ct','purchase_rate'].forEach(k => { if (data[k]) data[k] = +data[k]; });
  try {
    const r = await api('/api/parcels', 'POST', data);
    toast(`Parcel <strong>${r.parcel_number}</strong> received successfully`, 'success');
    form.reset();
    showView('detail', r.id);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Split ──────────────────────────────────────────────────────────────── */
let splitParcelId = null;
let splitParcelData = null;

async function openSplit(id) {
  splitParcelId = id;
  splitParcelData = await api('/api/parcels/' + id);
  const p = splitParcelData;
  document.getElementById('splitSourceInfo').innerHTML =
    `Source: <strong>${p.parcel_number}</strong> — ${fmt(p.current_pieces,0)} pcs / ${fmt(p.current_weight_ct,4)} ct available`;
  document.getElementById('splitRows').innerHTML = '';
  addSplitRow();
  new bootstrap.Modal(document.getElementById('splitModal')).show();
}

function addSplitRow() {
  const idx = document.querySelectorAll('.split-row').length;
  const div = document.createElement('div');
  div.className = 'split-row row g-2 mb-2 align-items-end';
  div.innerHTML = `
    <div class="col-3"><label class="form-label small">Pieces</label><input class="form-control form-control-sm" name="sp_pieces_${idx}" type="number" min="1" placeholder="0" /></div>
    <div class="col-3"><label class="form-label small">Weight (ct)</label><input class="form-control form-control-sm" name="sp_weight_${idx}" type="number" step="0.0001" placeholder="0.0000" /></div>
    <div class="col-3"><label class="form-label small">Bin/Location</label><input class="form-control form-control-sm" name="sp_bin_${idx}" placeholder="e.g. Tray-01" /></div>
    <div class="col-2"><label class="form-label small">Notes</label><input class="form-control form-control-sm" name="sp_notes_${idx}" /></div>
    <div class="col-1"><button class="btn btn-sm btn-outline-danger" onclick="this.closest('.split-row').remove()"><i class="bi bi-trash"></i></button></div>`;
  document.getElementById('splitRows').appendChild(div);
}

async function doSplit() {
  const rows = document.querySelectorAll('.split-row');
  const splits = Array.from(rows).map((r, i) => ({
    pieces: +r.querySelector(`[name="sp_pieces_${i}"]`)?.value || 0,
    weight_ct: +r.querySelector(`[name="sp_weight_${i}"]`)?.value || 0,
    bin_location: r.querySelector(`[name="sp_bin_${i}"]`)?.value || null,
    notes: r.querySelector(`[name="sp_notes_${i}"]`)?.value || null,
  })).filter(s => s.pieces > 0);

  if (!splits.length) { toast('Add at least one split with pieces > 0', 'warning'); return; }
  try {
    const r = await api(`/api/parcels/${splitParcelId}/split`, 'POST', { splits });
    bootstrap.Modal.getInstance(document.getElementById('splitModal')).hide();
    toast(`Split created ${r.children.length} child parcel(s)`, 'success');
    loadDetail(splitParcelId);
    showView('detail', splitParcelId);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Merge ──────────────────────────────────────────────────────────────── */
async function openMergeModal() {
  const parcels = await api('/api/parcels?lifecycle_stage=available');
  document.getElementById('mergeCheckboxes').innerHTML = parcels.map(p => `
    <div class="form-check">
      <input class="form-check-input merge-cb" type="checkbox" value="${p.id}" id="mcb-${p.id}" />
      <label class="form-check-label small" for="mcb-${p.id}">
        <strong>${p.parcel_number}</strong> — ${p.material_origin} ${p.material} · ${fmt(p.current_pieces,0)} pcs · ${fmt(p.current_weight_ct,4)} ct
      </label>
    </div>`).join('');
  new bootstrap.Modal(document.getElementById('mergeModal')).show();
}

async function doMerge() {
  const ids = Array.from(document.querySelectorAll('.merge-cb:checked')).map(c => c.value);
  const newNum = document.getElementById('mergeNewNum').value;
  if (ids.length < 2) { toast('Select at least 2 parcels', 'warning'); return; }
  try {
    const r = await api('/api/parcels/merge', 'POST', { source_ids: ids, target_parcel_number: newNum });
    bootstrap.Modal.getInstance(document.getElementById('mergeModal')).hide();
    toast(`Merged into <strong>${r.parcel_number}</strong>`, 'success');
    showView('detail', r.merged_parcel_id);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Transfer ────────────────────────────────────────────────────────────── */
let transferParcelId = null;
function openTransfer(id) {
  transferParcelId = id;
  ['tfSite','tfVault','tfBin','tfCustodian','tfReason','tfNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('transferModal')).show();
}
async function doTransfer() {
  try {
    await api(`/api/parcels/${transferParcelId}/transfer`, 'POST', {
      site: document.getElementById('tfSite').value,
      vault: document.getElementById('tfVault').value,
      bin_location: document.getElementById('tfBin').value,
      custodian: document.getElementById('tfCustodian').value,
      reason: document.getElementById('tfReason').value,
      notes: document.getElementById('tfNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('transferModal')).hide();
    toast('Transfer recorded', 'success');
    if (currentParcelId === transferParcelId) loadDetail(transferParcelId);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Issue ──────────────────────────────────────────────────────────────── */
let issueParcelId = null;
async function openIssue(id) {
  issueParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('issueInfo').innerHTML = `<strong>${p.parcel_number}</strong> · Available: ${fmt(p.available.pieces,0)} pcs / ${fmt(p.available.weight,4)} ct`;
  ['issPieces','issWeight','issWO','issNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('issueModal')).show();
}
async function doIssue() {
  try {
    await api(`/api/parcels/${issueParcelId}/issue`, 'POST', {
      pieces: +document.getElementById('issPieces').value,
      weight_ct: +document.getElementById('issWeight').value,
      work_order: document.getElementById('issWO').value,
      notes: document.getElementById('issNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('issueModal')).hide();
    toast('Issue to manufacturing recorded', 'success');
    if (currentParcelId === issueParcelId) loadDetail(issueParcelId);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Return ─────────────────────────────────────────────────────────────── */
let returnParcelId = null;
async function openReturn(id) {
  returnParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('returnInfo').innerHTML = `<strong>${p.parcel_number}</strong> · WIP: ${fmt(p.wip_pieces,0)} pcs / ${fmt(p.wip_weight_ct,4)} ct`;
  ['retPieces','retWeight','retBroken','retLost','retWO','retNotes'].forEach(x => document.getElementById(x).value = x.includes('Broken')||x.includes('Lost') ? '0' : '');
  new bootstrap.Modal(document.getElementById('returnModal')).show();
}
async function doReturn() {
  try {
    const r = await api(`/api/parcels/${returnParcelId}/return`, 'POST', {
      pieces:       +document.getElementById('retPieces').value  || 0,
      weight_ct:    +document.getElementById('retWeight').value  || 0,
      broken_pieces:+document.getElementById('retBroken').value  || 0,
      lost_pieces:  +document.getElementById('retLost').value    || 0,
      work_order:   document.getElementById('retWO').value,
      notes:        document.getElementById('retNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('returnModal')).hide();
    toast(`Return recorded: ${r.returned} returned, ${r.broken} broken, ${r.lost} lost, ${r.consumed} consumed`, 'success');
    if (currentParcelId === returnParcelId) loadDetail(returnParcelId);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Memo Issue ─────────────────────────────────────────────────────────── */
let memoParcelId = null;
async function openMemo(id) {
  memoParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('memoInfo').innerHTML = `<strong>${p.parcel_number}</strong> · Available: ${fmt(p.available.pieces,0)} pcs / ${fmt(p.available.weight,4)} ct`;
  ['memoPieces','memoWeight','memoCustomer','memoRef','memoNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('memoModal')).show();
}
async function doMemo() {
  try {
    await api(`/api/parcels/${memoParcelId}/memo`, 'POST', {
      pieces:   +document.getElementById('memoPieces').value,
      weight_ct:+document.getElementById('memoWeight').value,
      customer:  document.getElementById('memoCustomer').value,
      memo_ref:  document.getElementById('memoRef').value,
      notes:     document.getElementById('memoNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('memoModal')).hide();
    toast('Memo issue recorded', 'success');
    if (currentParcelId === memoParcelId) loadDetail(memoParcelId);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── Adjust ─────────────────────────────────────────────────────────────── */
let adjustParcelId = null;
async function openAdjust(id) {
  adjustParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('adjustInfo').innerHTML = `<strong>${p.parcel_number}</strong> · Current: ${fmt(p.current_pieces,0)} pcs / ${fmt(p.current_weight_ct,4)} ct`;
  document.getElementById('adjPieces').value = p.current_pieces;
  document.getElementById('adjWeight').value = p.current_weight_ct;
  ['adjReason','adjApprover','adjNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('adjustModal')).show();
}
async function doAdjust() {
  try {
    const r = await api(`/api/parcels/${adjustParcelId}/adjust`, 'POST', {
      new_pieces:    +document.getElementById('adjPieces').value || undefined,
      new_weight_ct: +document.getElementById('adjWeight').value || undefined,
      reason:         document.getElementById('adjReason').value,
      approved_by:    document.getElementById('adjApprover').value,
      notes:          document.getElementById('adjNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide();
    toast(`Adjustment: ${r.pieces_delta >= 0 ? '+' : ''}${r.pieces_delta} pcs, ${r.weight_delta >= 0 ? '+' : ''}${fmt(r.weight_delta,4)} ct`, 'success');
    if (currentParcelId === adjustParcelId) loadDetail(adjustParcelId);
  } catch(err) { toast(err.message, 'danger'); }
}

/* ── UAT Scenarios ──────────────────────────────────────────────────────── */
const UAT_SCENARIOS = [
  {
    id: 'UAT-01',
    title: 'Receive a new natural diamond parcel',
    objective: 'Verify the system correctly creates a new parcel with all required fields and logs a receipt transaction.',
    steps: [
      'Click "Receive" in the navigation bar.',
      'Fill in: Parcel # = DP-TEST-001, Material = natural_diamond, Origin = natural, Shape = Round Brilliant, Size = 2.0–2.2 mm, Color = G, Clarity = SI1, Pieces = 100, Weight = 3.500 ct, Purchase Rate = 600 (per carat), Vault = Vault A, Custodian = Alice Chen.',
      'Click "Receive Parcel".',
      'Verify the system redirects to the parcel detail page.',
    ],
    expected: 'Parcel DP-TEST-001 is created with status "available". The Transaction Ledger shows one "receipt" entry with pieces_delta = +100 and weight_delta = +3.5000 ct.',
  },
  {
    id: 'UAT-02',
    title: 'Split a parcel into two children',
    objective: 'Verify the split operation correctly reduces the parent balance and creates child parcels with proportional cost allocation.',
    steps: [
      'Open parcel DP-000184 from the Parcel list.',
      'Click "Split".',
      'Add Split 1: 150 pcs, 5.2700 ct, Bin = Retail-Tray-A.',
      'Add Split 2: 100 pcs, 3.5200 ct, Bin = Retail-Tray-B.',
      'Click "Execute Split".',
    ],
    expected: 'Two child parcels created. Parent DP-000184 balance reduces by 250 pcs and 8.79 ct. Each child parcel has a "split" relationship to the parent. Transaction ledger shows a "split" entry on the parent and "opening_balance" on each child.',
  },
  {
    id: 'UAT-03',
    title: 'Merge two compatible parcels',
    objective: 'Verify two same-origin parcels can be merged and that the merge is rejected for mixed natural/lab-grown goods.',
    steps: [
      'From the Parcel List, click the Merge button (or open merge modal via any parcel).',
      'Select DP-000184-A and any other available natural_diamond parcel.',
      'Enter new parcel number MERGE-TEST-001.',
      'Click "Execute Merge".',
      'Then attempt to merge a natural_diamond parcel with a lab_diamond parcel (DP-000211).',
    ],
    expected: 'First merge succeeds: new parcel MERGE-TEST-001 is created, source parcels are marked "merged/closed". Second merge is rejected with error "Cannot merge natural and lab-grown material".',
  },
  {
    id: 'UAT-04',
    title: 'Issue stones to manufacturing and return with breakage',
    objective: 'Verify WIP tracking, breakage recording, and correct balance after partial return.',
    steps: [
      'Open parcel DP-000211 (lab diamond).',
      'Click "Issue to Manufacturing": 50 pcs, 1.4000 ct, WO = WO-UAT-001.',
      'Verify: wip_pieces increases to 130 (existing 80 + 50).',
      'Click "Return": Returned = 45 pcs, Weight = 1.2600 ct, Broken = 3 pcs, Lost = 2 pcs, WO = WO-UAT-001.',
    ],
    expected: 'After return: WIP decreases by 50. Current pieces decreases by consumed (0) + broken (3) + lost (2) = 5 pcs. damaged_pieces increases by 3. Transaction ledger shows manufacturing_issue and manufacturing_return entries.',
  },
  {
    id: 'UAT-05',
    title: 'Issue emerald on memo and return partial',
    objective: 'Verify memo lifecycle: issue reduces available, partial return is recorded, memo balance correctly maintained.',
    steps: [
      'Open parcel EM-000031 (emerald).',
      'Click "Memo": 2 pcs, ~4.80 ct, Customer = Test Jewelers, Memo Ref = MEMO-UAT-001.',
      'Navigate to the parcel detail: verify memo_pieces = 4 (existing 2 + 2) and available decreases.',
      'Return from memo: on detail page, verify the option to record memo return is available.',
    ],
    expected: 'Memo issue is recorded; memo_pieces increases. Available pieces decreases accordingly. A memo_issue transaction appears in the ledger with custodian_to = "Test Jewelers".',
  },
  {
    id: 'UAT-06',
    title: 'Transfer parcel between vaults',
    objective: 'Verify physical relocation is recorded without changing piece count or weight.',
    steps: [
      'Open any available parcel.',
      'Click "Transfer".',
      'Enter new Site = "Retail Store 2", Vault = "Store Safe 2", Bin = "Tray-05", Custodian = "Eve Jones", Reason = "Branch transfer".',
      'Click Transfer.',
    ],
    expected: 'Parcel location fields update. Transaction ledger shows a "transfer" entry with location_from and location_to fields, pieces_delta = 0 and weight_delta_ct = 0.',
  },
  {
    id: 'UAT-07',
    title: 'Physical count adjustment with approval',
    objective: 'Verify count adjustment creates an auditable correction entry.',
    steps: [
      'Open parcel DP-000184.',
      'Click "Adjust".',
      'Change new piece count to current_pieces - 5 (simulating a shortage).',
      'Enter Reason = "Physical count shortage", Approved By = "Manager A", Notes = "5 stones unaccounted after blind count".',
      'Click "Record Adjustment".',
    ],
    expected: 'current_pieces decreases by 5. Transaction ledger shows a "count_correction" entry with pieces_delta = -5, approved_by = "Manager A". The original quantity is preserved in the "before_pieces" field.',
  },
  {
    id: 'UAT-08',
    title: 'Verify natural/lab-grown quarantine parcel',
    objective: 'Verify that a quarantined parcel is visible with correct status and cannot be issued.',
    steps: [
      'Open parcel QR-000003 from the Parcel List (filter by lifecycle_stage = quarantined).',
      'Note the lifecycle_stage = "quarantined" and screening_status = "pending".',
      'Attempt to issue from this parcel.',
    ],
    expected: 'Parcel is visible with "quarantined" badge. The issue operation should reflect the quarantined status. Notes confirm identity is unknown pending GIA screening.',
  },
  {
    id: 'UAT-09',
    title: 'Verify vendor memo/consignment visibility',
    objective: 'Verify vendor-memo goods are clearly flagged as non-company-owned and show correct owner.',
    steps: [
      'Open parcel PD-000009 (pink diamonds on vendor memo).',
      'Check the Owner field and lifecycle_stage.',
      'Verify all 5 pieces are counted in memo_pieces, not in available balance.',
    ],
    expected: 'Owner = "Vendor", lifecycle_stage = "on_memo", memo_pieces = 5, available pieces = 0. Notes clearly state the vendor memo terms.',
  },
  {
    id: 'UAT-10',
    title: 'Parcel genealogy trace',
    objective: 'Verify the genealogy tree correctly shows the full family from root to child parcels.',
    steps: [
      'Open parcel DP-000184-A (a child of DP-000184).',
      'Scroll to the "Parcel Genealogy" section at the bottom of the detail page.',
    ],
    expected: 'Genealogy tree shows DP-000184 as root with DP-000184-A as a child split. Clicking DP-000184 in the tree navigates to the parent parcel detail.',
  },
  {
    id: 'UAT-11',
    title: 'Immutable ledger: verify no transaction can be deleted',
    objective: 'Confirm the transaction ledger is append-only and historical records cannot be modified.',
    steps: [
      'Open any parcel with multiple transactions.',
      'Examine the Transaction Ledger: verify all past entries are read-only.',
      'Attempt to call DELETE /api/parcels/{id}/transactions (via browser developer tools or REST client).',
    ],
    expected: 'No delete or edit controls appear for past transactions in the UI. The API does not expose any DELETE endpoint for transactions.',
  },
  {
    id: 'UAT-12',
    title: 'Pearl parcel: per-piece pricing and zero weight',
    objective: 'Verify that parcels priced per-piece with no carat weight are handled correctly.',
    steps: [
      'Open parcel PL-000018 (Akoya pearls).',
      'Verify: pricing_unit = "per_piece", original_weight_ct = 0, landed_cost = 9000.',
      'Issue 10 pieces to manufacturing.',
    ],
    expected: 'Pearl parcel is displayed correctly with 0 carat weight. Issue of 10 pcs succeeds. Landed cost per piece = $45 is implicit from total ÷ pieces.',
  },
];

function renderUAT() {
  document.getElementById('uatList').innerHTML = UAT_SCENARIOS.map(s => `
    <div class="card uat-scenario mb-3">
      <div class="card-body">
        <div class="d-flex align-items-start gap-3 flex-wrap">
          <div class="flex-grow-1">
            <div class="fw-bold mb-1"><span class="badge bg-secondary me-2">${s.id}</span>${s.title}</div>
            <div class="text-muted small mb-2"><em>${s.objective}</em></div>
            <div class="mb-2">
              ${s.steps.map((st, i) => `<div class="uat-step"><span class="badge bg-dark me-2">${i+1}</span>${st}</div>`).join('')}
            </div>
            <div class="uat-step uat-expected"><i class="bi bi-check2-circle text-success me-1"></i><strong>Expected:</strong> ${s.expected}</div>
          </div>
          <div class="uat-status text-end">
            <div class="btn-group-vertical gap-1" role="group">
              <button class="btn btn-sm btn-success"  onclick="markUAT('${s.id}','pass',this)"><i class="bi bi-check2 me-1"></i>Pass</button>
              <button class="btn btn-sm btn-danger"   onclick="markUAT('${s.id}','fail',this)"><i class="bi bi-x me-1"></i>Fail</button>
              <button class="btn btn-sm btn-warning"  onclick="markUAT('${s.id}','block',this)"><i class="bi bi-exclamation me-1"></i>Blocked</button>
            </div>
            <div id="uat-result-${s.id}" class="mt-2 small fw-bold"></div>
          </div>
        </div>
      </div>
    </div>`).join('');
}

const uatResults = {};
function markUAT(id, result, btn) {
  uatResults[id] = result;
  const colors = { pass:'success', fail:'danger', block:'warning' };
  const labels = { pass:'✅ PASSED', fail:'❌ FAILED', block:'⚠️ BLOCKED' };
  document.getElementById('uat-result-' + id).innerHTML =
    `<span class="text-${colors[result]}">${labels[result]}</span>`;
  const total  = UAT_SCENARIOS.length;
  const passed = Object.values(uatResults).filter(v => v==='pass').length;
  const failed = Object.values(uatResults).filter(v => v==='fail').length;
  const score  = `${passed}/${total} passed`;
  toast(`${score} — this scenario marked <strong>${result.toUpperCase()}</strong>`, colors[result]);
}

/* ── Initialise ─────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  await populateMaterialDropdowns();
  showView('dashboard');
});
