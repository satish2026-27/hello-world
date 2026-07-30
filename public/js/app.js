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
  if (name === 'disposition' && parcelId) loadDisposition(parcelId);
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
                ${p.memo_pieces > 0 ? `<button class="btn btn-sm btn-outline-success" onclick="openMemoReturn('${p.id}')"><i class="bi bi-envelope-open me-1"></i>Memo Return</button>` : ''}
                <button class="btn btn-sm btn-outline-success" onclick="openSale('${p.id}')"><i class="bi bi-receipt me-1"></i>Sale</button>
                <button class="btn btn-sm btn-outline-primary" onclick="openReserve('${p.id}')"><i class="bi bi-bookmark me-1"></i>Reserve</button>
                ${p.reserved_pieces > 0 ? `<button class="btn btn-sm btn-outline-secondary" onclick="doUnreserve('${p.id}')"><i class="bi bi-bookmark-x me-1"></i>Unreserve</button>` : ''}
                <button class="btn btn-sm btn-outline-dark" onclick="openRegrade('${p.id}')"><i class="bi bi-layers me-1"></i>Regrade</button>
                <button class="btn btn-sm btn-outline-danger" onclick="openAdjust('${p.id}')"><i class="bi bi-calculator me-1"></i>Adjust</button>
                ${p.lifecycle_stage === 'quarantined'
                  ? `<button class="btn btn-sm btn-success" onclick="openRelease('${p.id}')"><i class="bi bi-shield-check me-1"></i>Release QC</button>`
                  : `<button class="btn btn-sm btn-outline-danger" onclick="doQuarantine('${p.id}')"><i class="bi bi-exclamation-triangle me-1"></i>Quarantine</button>`}
                <button class="btn btn-sm btn-outline-dark" onclick="showView('disposition','${p.id}')"><i class="bi bi-diagram-3 me-1"></i>Disposition</button>
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
    const r = await api(`/api/parcels/${splitParcelId}/split`, 'POST', {
      splits,
      allocation_method: document.getElementById('splitAllocMethod')?.value || 'proportional_weight',
    });
    bootstrap.Modal.getInstance(document.getElementById('splitModal')).hide();
    toast(`Split created ${r.children.length} child parcel(s)${r.parent_closed ? ' · parent closed' : ''}`, 'success');
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
  ['retPieces','retWeight','retBroken','retLost','retConsumed','retWO','retNotes'].forEach(x => {
    document.getElementById(x).value = /Broken|Lost|Consumed/.test(x) ? '0' : '';
  });
  new bootstrap.Modal(document.getElementById('returnModal')).show();
}
async function doReturn() {
  try {
    const r = await api(`/api/parcels/${returnParcelId}/return`, 'POST', {
      pieces:          +document.getElementById('retPieces').value  || 0,
      weight_ct:       +document.getElementById('retWeight').value  || 0,
      broken_pieces:   +document.getElementById('retBroken').value  || 0,
      lost_pieces:     +document.getElementById('retLost').value    || 0,
      consumed_pieces: +document.getElementById('retConsumed').value|| 0,
      work_order:      document.getElementById('retWO').value,
      notes:           document.getElementById('retNotes').value,
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

/* ── Memo Return / Sale / Reserve / Regrade / Quarantine ────────────────── */
let memoReturnParcelId = null;
async function openMemoReturn(id) {
  memoReturnParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('memoReturnInfo').innerHTML =
    `<strong>${p.parcel_number}</strong> · On memo: ${fmt(p.memo_pieces,0)} pcs / ${fmt(p.memo_weight_ct,4)} ct`;
  ['mrPieces','mrWeight','mrRef','mrNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('memoReturnModal')).show();
}
async function doMemoReturn() {
  try {
    await api(`/api/parcels/${memoReturnParcelId}/memo-return`, 'POST', {
      pieces: +document.getElementById('mrPieces').value,
      weight_ct: +document.getElementById('mrWeight').value || 0,
      memo_ref: document.getElementById('mrRef').value,
      notes: document.getElementById('mrNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('memoReturnModal')).hide();
    toast('Memo return recorded', 'success');
    loadDetail(memoReturnParcelId);
  } catch (err) { toast(err.message, 'danger'); }
}

let saleParcelId = null;
async function openSale(id) {
  saleParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('saleInfo').innerHTML =
    `<strong>${p.parcel_number}</strong> · Available: ${fmt(p.available.pieces,0)} pcs / ${fmt(p.available.weight,4)} ct`;
  ['salePieces','saleWeight','saleCustomer','saleRef','saleNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('saleModal')).show();
}
async function doSale() {
  try {
    const r = await api(`/api/parcels/${saleParcelId}/sale`, 'POST', {
      pieces: +document.getElementById('salePieces').value,
      weight_ct: +document.getElementById('saleWeight').value || 0,
      customer: document.getElementById('saleCustomer').value,
      sales_ref: document.getElementById('saleRef').value,
      notes: document.getElementById('saleNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('saleModal')).hide();
    toast(`Sale recorded · COGS ${fmtUSD(r.cost_cogs)}${r.closed ? ' · parcel closed' : ''}`, 'success');
    loadDetail(saleParcelId);
  } catch (err) { toast(err.message, 'danger'); }
}

let reserveParcelId = null;
async function openReserve(id) {
  reserveParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('reserveInfo').innerHTML =
    `<strong>${p.parcel_number}</strong> · Available: ${fmt(p.available.pieces,0)} pcs / ${fmt(p.available.weight,4)} ct`;
  ['rsvPieces','rsvWeight','rsvOrder','rsvCustomer','rsvNotes'].forEach(x => document.getElementById(x).value = '');
  new bootstrap.Modal(document.getElementById('reserveModal')).show();
}
async function doReserve() {
  try {
    await api(`/api/parcels/${reserveParcelId}/reserve`, 'POST', {
      pieces: +document.getElementById('rsvPieces').value,
      weight_ct: +document.getElementById('rsvWeight').value || 0,
      order_reference: document.getElementById('rsvOrder').value,
      customer: document.getElementById('rsvCustomer').value,
      notes: document.getElementById('rsvNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('reserveModal')).hide();
    toast('Reservation recorded', 'success');
    loadDetail(reserveParcelId);
  } catch (err) { toast(err.message, 'danger'); }
}
async function doUnreserve(id) {
  try {
    await api(`/api/parcels/${id}/unreserve`, 'POST', {});
    toast('Reservation released', 'success');
    loadDetail(id);
  } catch (err) { toast(err.message, 'danger'); }
}

let regradeParcelId = null;
async function openRegrade(id) {
  regradeParcelId = id;
  const p = await api('/api/parcels/' + id);
  document.getElementById('regradeInfo').innerHTML =
    `Source: <strong>${p.parcel_number}</strong> — ${fmt(p.current_pieces,0)} pcs / ${fmt(p.current_weight_ct,4)} ct · ${fmtUSD(p.current_avg_cost)}`;
  document.getElementById('regradeRows').innerHTML = '';
  addRegradeRow();
  addRegradeRow();
  document.getElementById('rgLossPcs').value = '0';
  document.getElementById('rgLossWt').value = '0';
  document.getElementById('rgTol').value = '0.02';
  document.getElementById('rgApprover').value = '';
  document.getElementById('rgNotes').value = '';
  new bootstrap.Modal(document.getElementById('regradeModal')).show();
}
function addRegradeRow() {
  const idx = document.querySelectorAll('.regrade-row').length;
  const div = document.createElement('div');
  div.className = 'regrade-row row g-2 mb-2 align-items-end';
  div.innerHTML = `
    <div class="col-2"><label class="form-label small">Grade</label><input class="form-control form-control-sm" name="rg_grade_${idx}" placeholder="premium" /></div>
    <div class="col-2"><label class="form-label small">Pieces</label><input class="form-control form-control-sm" name="rg_pieces_${idx}" type="number" min="0" /></div>
    <div class="col-2"><label class="form-label small">Weight (ct)</label><input class="form-control form-control-sm" name="rg_weight_${idx}" type="number" step="0.0001" /></div>
    <div class="col-2"><label class="form-label small">Color</label><input class="form-control form-control-sm" name="rg_color_${idx}" /></div>
    <div class="col-2"><label class="form-label small">Clarity</label><input class="form-control form-control-sm" name="rg_clarity_${idx}" /></div>
    <div class="col-1"><button class="btn btn-sm btn-outline-danger" onclick="this.closest('.regrade-row').remove()"><i class="bi bi-trash"></i></button></div>`;
  document.getElementById('regradeRows').appendChild(div);
}
async function doRegrade() {
  const rows = document.querySelectorAll('.regrade-row');
  const outputs = Array.from(rows).map((r, i) => ({
    assortment_grade: r.querySelector(`[name="rg_grade_${i}"]`)?.value || 'regraded',
    pieces: +r.querySelector(`[name="rg_pieces_${i}"]`)?.value || 0,
    weight_ct: +r.querySelector(`[name="rg_weight_${i}"]`)?.value || 0,
    color: r.querySelector(`[name="rg_color_${i}"]`)?.value || null,
    clarity: r.querySelector(`[name="rg_clarity_${i}"]`)?.value || null,
  })).filter(o => o.pieces > 0 || o.weight_ct > 0);
  if (!outputs.length) { toast('Add at least one output grade', 'warning'); return; }
  try {
    const r = await api(`/api/parcels/${regradeParcelId}/regrade`, 'POST', {
      outputs,
      process_loss_pieces: +document.getElementById('rgLossPcs').value || 0,
      process_loss_weight_ct: +document.getElementById('rgLossWt').value || 0,
      tolerance_ct: +document.getElementById('rgTol').value || 0.02,
      approved_by: document.getElementById('rgApprover').value || null,
      notes: document.getElementById('rgNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('regradeModal')).hide();
    toast(`Regrade created ${r.children.length} grade parcel(s)`, 'success');
    if (r.children[0]) showView('detail', r.children[0].id);
  } catch (err) { toast(err.message, 'danger'); }
}

async function doQuarantine(id) {
  const reason = prompt('Quarantine reason:', 'Identity / quality investigation');
  if (reason == null) return;
  try {
    await api(`/api/parcels/${id}/quarantine`, 'POST', { reason });
    toast('Parcel quarantined', 'warning');
    loadDetail(id);
  } catch (err) { toast(err.message, 'danger'); }
}

let releaseParcelId = null;
function openRelease(id) {
  releaseParcelId = id;
  document.getElementById('relApprover').value = '';
  document.getElementById('relNotes').value = '';
  document.getElementById('relMaterial').value = '';
  new bootstrap.Modal(document.getElementById('releaseModal')).show();
}
async function doRelease() {
  try {
    await api(`/api/parcels/${releaseParcelId}/release-quarantine`, 'POST', {
      material_origin: document.getElementById('relOrigin').value,
      material: document.getElementById('relMaterial').value || null,
      screening_status: document.getElementById('relScreen').value,
      approved_by: document.getElementById('relApprover').value,
      notes: document.getElementById('relNotes').value,
    });
    bootstrap.Modal.getInstance(document.getElementById('releaseModal')).hide();
    toast('Released from quarantine', 'success');
    loadDetail(releaseParcelId);
  } catch (err) { toast(err.message, 'danger'); }
}

async function loadDisposition(id) {
  currentParcelId = id;
  const d = await api('/api/parcels/' + id + '/disposition');
  const s = d.summary;
  document.getElementById('dispositionContent').innerHTML = `
    <h4 class="mb-3"><i class="bi bi-diagram-3 me-2 text-warning"></i>Disposition Audit — ${d.root.parcel_number}</h4>
    <div class="row g-3 mb-3">
      <div class="col-md-3"><div class="card stat-card p-3"><div class="stat-value">${fmt(s.original_pieces,0)}</div><div class="stat-label">Original Pcs</div></div></div>
      <div class="col-md-3"><div class="card stat-card p-3"><div class="stat-value">${fmt(s.original_weight_ct,2)}</div><div class="stat-label">Original Ct</div></div></div>
      <div class="col-md-3"><div class="card stat-card p-3"><div class="stat-value text-success">${fmt(s.remaining_pieces,0)}</div><div class="stat-label">Remaining Pcs</div></div></div>
      <div class="col-md-3"><div class="card stat-card p-3"><div class="stat-value">${fmtUSD(s.remaining_value)}</div><div class="stat-label">Remaining Value</div></div></div>
    </div>
    <div class="card mb-3">
      <div class="card-header fw-semibold">Family Parcels (${d.family.length})</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead class="table-dark"><tr><th>Parcel #</th><th>Status</th><th>Stage</th><th>Pcs</th><th>Wt</th><th>Value</th><th>Location</th><th>Owner</th></tr></thead>
          <tbody>
            ${d.family.map(f => `<tr>
              <td><a href="#" onclick="showView('detail','${f.id}');return false">${f.parcel_number}</a></td>
              <td>${f.status}</td><td>${stageBadge(f.lifecycle_stage)}</td>
              <td class="text-end">${fmt(f.current_pieces,0)}</td>
              <td class="text-end">${fmt(f.current_weight_ct,4)}</td>
              <td class="text-end">${fmtUSD(f.current_avg_cost)}</td>
              <td><small>${[f.site,f.vault].filter(Boolean).join(' › ')}</small></td>
              <td>${f.owner || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header fw-semibold">Family Ledger (${d.transactions.length})</div>
      <div class="card-body p-0 table-responsive">
        <table class="table table-sm mb-0">
          <thead class="table-light"><tr><th>Date</th><th>Parcel</th><th>Type</th><th>Δ Pcs</th><th>Δ Wt</th><th>Notes</th></tr></thead>
          <tbody>
            ${d.transactions.map(t => `<tr>
              <td>${t.physical_date}</td>
              <td>${t.parcel_number}</td>
              <td>${txnChip(t.transaction_type)}</td>
              <td class="text-end ${t.pieces_delta < 0 ? 'text-danger' : 'text-success'}">${t.pieces_delta > 0 ? '+' : ''}${fmt(t.pieces_delta,0)}</td>
              <td class="text-end">${t.weight_delta_ct > 0 ? '+' : ''}${fmt(t.weight_delta_ct,4)}</td>
              <td><small>${t.notes || ''}</small></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function resetUat() {
  if (!confirm('Reset all parcel data to the seed baseline? Unsaved UAT manipulations will be lost.')) return;
  try {
    await api('/api/uat/reset', 'POST', {});
    toast('UAT data reset to seed baseline', 'success');
    showView('dashboard');
  } catch (err) { toast(err.message, 'danger'); }
}

/* ── UAT Scenarios ──────────────────────────────────────────────────────── */
const UAT_SCENARIOS = [
  {
    id: 'UAT-01', area: 'Receipt',
    title: 'Receive a new natural diamond parcel',
    objective: 'Create a parcel with required fields and an immutable receipt transaction.',
    steps: [
      'Click Reset Data if needed, then Receive.',
      'Enter Parcel # DP-TEST-001, material natural_diamond, origin natural, shape Round Brilliant, size 2.0–2.2 mm, color G–H, clarity SI1–SI2, 100 pcs, 3.500 ct, rate 600/ct, Vault A, custodian Alice Chen.',
      'Submit and open the ledger.',
    ],
    expected: 'Parcel available with 100 pcs / 3.5000 ct. Receipt txn pieces_delta=+100. Landed cost = $2,100.',
  },
  {
    id: 'UAT-02', area: 'Split',
    title: 'Split a parcel into two children',
    objective: 'Parent balance reduces; children inherit genealogy and proportional cost.',
    steps: [
      'Open DP-000184 (seed balance 325 pcs / 11.40 ct).',
      'Split: 150 pcs / 5.27 ct and 100 pcs / 3.52 ct.',
      'Confirm parent, children, and genealogy.',
    ],
    expected: 'Parent reduced by 250 pcs / 8.79 ct. Two children with opening_balance txns. Genealogy links both children to DP-000184.',
  },
  {
    id: 'UAT-03', area: 'Merge',
    title: 'Merge compatible parcels; reject natural + lab-grown',
    objective: 'Merge rules enforce ownership, origin, treatment, and open balances.',
    steps: [
      'Use Merge: select two available natural parcels with no memo/WIP/reserve.',
      'Then attempt DP-000184 (or child) with DP-000211 (lab-grown).',
    ],
    expected: 'Compatible merge creates a new parcel and closes sources. Natural+lab merge rejected with "Cannot merge natural and lab-grown material".',
  },
  {
    id: 'UAT-04', area: 'Production',
    title: 'Manufacturing issue and partial return with breakage',
    objective: 'WIP, broken, lost, and consumed are distinct ledger outcomes.',
    steps: [
      'Open DP-000211 → Issue 50 pcs / 1.4000 ct to WO-UAT-001.',
      'Return: 45 returned, 3 broken, 2 lost.',
    ],
    expected: 'WIP +50 then −50. damaged_pieces +3. Ledger shows manufacturing_issue and manufacturing_return.',
  },
  {
    id: 'UAT-05', area: 'Memo',
    title: 'Memo issue and partial return',
    objective: 'Memo reduces available without changing ownership.',
    steps: [
      'Open EM-000031 → Memo 2 pcs / 4.80 ct to Test Jewelers.',
      'Use Memo Return for 1 pc.',
    ],
    expected: 'memo_pieces rises then partially falls. Available adjusts. Ledger has memo_issue and memo_return.',
  },
  {
    id: 'UAT-06', area: 'Transfer',
    title: 'Transfer parcel between vaults',
    objective: 'Relocation is quantity-neutral.',
    steps: [
      'Open any available parcel → Transfer to Retail Store 2 / Store Safe 2 / Tray-05 / Eve Jones.',
    ],
    expected: 'Location updates. Transfer txn has pieces_delta=0 and weight_delta_ct=0.',
  },
  {
    id: 'UAT-07', area: 'Count',
    title: 'Physical count adjustment with maker-checker approval',
    objective: 'Count corrections require approved_by and preserve before-values.',
    steps: [
      'Open DP-000184 → Adjust pieces down by 5 with Approved By = Manager A.',
      'Retry once without Approved By — expect rejection.',
    ],
    expected: 'Approved adjust logs count_correction with before_pieces preserved. Missing approver returns 400.',
  },
  {
    id: 'UAT-08', area: 'Quarantine',
    title: 'Quarantined parcel blocks production issue',
    objective: 'Unknown-identity goods cannot enter manufacturing.',
    steps: [
      'Filter lifecycle = quarantined → open QR-000003.',
      'Attempt Issue to manufacturing.',
      'Release QC with origin natural and approver, then confirm available.',
    ],
    expected: 'Issue rejected while quarantined. After release, lifecycle=available and origin resolved.',
  },
  {
    id: 'UAT-09', area: 'Ownership',
    title: 'Vendor memo / consignment ownership',
    objective: 'Ownership and custody are separate; vendor goods are not company cost.',
    steps: [
      'Open PD-000009. Confirm Owner=Vendor, memo_pieces=5, available=0, landed_cost=$0.',
    ],
    expected: 'Vendor-owned consignment is visible in vault but not company inventory value.',
  },
  {
    id: 'UAT-10', area: 'Genealogy',
    title: 'Parcel genealogy and disposition audit',
    objective: 'Trace every carat from root purchase to current children.',
    steps: [
      'Open DP-000184-A → Genealogy section.',
      'Click Disposition on DP-000184 and review family summary.',
    ],
    expected: 'Tree shows root and split child. Disposition reports original 525 pcs and remaining family balances.',
  },
  {
    id: 'UAT-11', area: 'Audit',
    title: 'Immutable ledger — no transaction deletion',
    objective: 'Ledger is append-only.',
    steps: [
      'Open any parcel ledger — confirm no edit/delete controls.',
      'DELETE /api/parcels/{id}/transactions via DevTools.',
    ],
    expected: 'UI is read-only. API returns 404/405.',
  },
  {
    id: 'UAT-12', area: 'Valuation',
    title: 'Pearl parcel: per-piece pricing, zero weight',
    objective: 'Pieces and weight are independent units.',
    steps: [
      'Open PL-000018. Confirm per_piece pricing and 0 ct.',
      'Issue 10 pcs at weight 0.',
    ],
    expected: 'No division-by-zero. Issue succeeds with weight_delta_ct=0.',
  },
  {
    id: 'UAT-13', area: 'Data Integrity',
    title: 'Dual-unit discrepancy — pieces change, weight holds',
    objective: 'Never derive weight from pieces automatically.',
    steps: [
      'Receive 10 pcs / 3.0000 ct.',
      'Adjust pieces to 9 without changing weight (Approved By required).',
    ],
    expected: 'current_pieces=9, current_weight_ct still 3.0000. pieces_delta=-1, weight_delta_ct=0.',
  },
  {
    id: 'UAT-14', area: 'Compliance',
    title: 'Natural / lab-grown contamination rejection',
    objective: 'Identity separation is non-negotiable on merge.',
    steps: [
      'Attempt Merge of any natural_diamond with DP-000211.',
    ],
    expected: 'Rejected with natural/lab-grown error. No balances change.',
  },
  {
    id: 'UAT-15', area: 'Reporting',
    title: 'Dashboard portfolio value accuracy',
    objective: 'Dashboard totals match active parcel balances.',
    steps: [
      'Reset Data. Open Dashboard. Sum current_avg_cost / pieces / weight from Parcel List.',
    ],
    expected: 'Portfolio Value, Total Pieces, and Total Weight match the active parcel sums.',
  },
  {
    id: 'UAT-16', area: 'Regrade',
    title: 'Regrade mixed parcel into quality grades',
    objective: 'Input = outputs + process loss + unexplained variance.',
    steps: [
      'Reset Data. Open DP-000184-A (200 pcs / 7.02 ct).',
      'Regrade into Premium 120 pcs / 4.20 ct and Commercial 80 pcs / 2.80 ct.',
      'Confirm parent closed and children created.',
    ],
    expected: 'Source closed at zero. Two regrade children. Ledger regrade entry records the sort.',
  },
  {
    id: 'UAT-17', area: 'Reservation',
    title: 'Reserve and unreserve for an order',
    objective: 'Reservations reduce available without consuming stock.',
    steps: [
      'Open SP-000072 → Reserve 6 pcs (already has 6 reserved in seed — use DP-000184 instead for 20 pcs).',
      'Confirm available drops. Unreserve and confirm available restores.',
    ],
    expected: 'reserved_pieces moves; available = current − reserved − memo − wip. Unreserve releases balance.',
  },
  {
    id: 'UAT-18', area: 'Sale',
    title: 'Sale reduces inventory and can close parcel',
    objective: 'Sale posts COGS from average cost and closes at zero.',
    steps: [
      'Receive a small test parcel (e.g. 10 pcs / 1 ct).',
      'Sell all 10 pcs / 1 ct. Confirm parcel closed.',
    ],
    expected: 'Sale txn reduces pieces/weight/cost. Parcel status=closed when balance hits zero.',
  },
];

const UAT_STORAGE_KEY = 'parcel_uat_results_v1';
function loadUatResults() {
  try { return JSON.parse(localStorage.getItem(UAT_STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveUatResults(map) {
  localStorage.setItem(UAT_STORAGE_KEY, JSON.stringify(map));
}

function renderUAT() {
  const uatResults = loadUatResults();
  const colors = { pass:'success', fail:'danger', block:'warning' };
  const labels = { pass:'PASSED', fail:'FAILED', block:'BLOCKED' };
  const passed = Object.values(uatResults).filter(v => v === 'pass').length;
  const failed = Object.values(uatResults).filter(v => v === 'fail').length;
  const blocked = Object.values(uatResults).filter(v => v === 'block').length;
  const scored = Object.keys(uatResults).length;
  document.getElementById('uatScore').innerHTML =
    `<span class="text-success">${passed} pass</span> · <span class="text-danger">${failed} fail</span> · <span class="text-warning">${blocked} blocked</span> · ${scored}/${UAT_SCENARIOS.length} scored`;

  document.getElementById('uatList').innerHTML = UAT_SCENARIOS.map(s => `
    <div class="card uat-scenario mb-3">
      <div class="card-body">
        <div class="d-flex align-items-start gap-3 flex-wrap">
          <div class="flex-grow-1">
            <div class="fw-bold mb-1">
              <span class="badge bg-secondary me-2">${s.id}</span>
              <span class="badge bg-dark me-2">${s.area}</span>
              ${s.title}
            </div>
            <div class="text-muted small mb-2"><em>${s.objective}</em></div>
            <div class="mb-2">
              ${s.steps.map((st, i) => `<div class="uat-step"><span class="badge bg-dark me-2">${i+1}</span>${st}</div>`).join('')}
            </div>
            <div class="uat-step uat-expected"><i class="bi bi-check2-circle text-success me-1"></i><strong>Expected:</strong> ${s.expected}</div>
          </div>
          <div class="uat-status text-end">
            <div class="btn-group-vertical gap-1" role="group">
              <button class="btn btn-sm btn-success"  onclick="markUAT('${s.id}','pass')"><i class="bi bi-check2 me-1"></i>Pass</button>
              <button class="btn btn-sm btn-danger"   onclick="markUAT('${s.id}','fail')"><i class="bi bi-x me-1"></i>Fail</button>
              <button class="btn btn-sm btn-warning"  onclick="markUAT('${s.id}','block')"><i class="bi bi-exclamation me-1"></i>Blocked</button>
            </div>
            <div id="uat-result-${s.id}" class="mt-2 small fw-bold">
              ${uatResults[s.id] ? `<span class="text-${colors[uatResults[s.id]]}">${labels[uatResults[s.id]]}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function markUAT(id, result) {
  const uatResults = loadUatResults();
  uatResults[id] = result;
  saveUatResults(uatResults);
  const colors = { pass:'success', fail:'danger', block:'warning' };
  toast(`Scenario ${id} marked <strong>${result.toUpperCase()}</strong>`, colors[result]);
  renderUAT();
}

function clearUatResults() {
  localStorage.removeItem(UAT_STORAGE_KEY);
  renderUAT();
  toast('UAT results cleared', 'secondary');
}

/* ── Initialise ─────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  await populateMaterialDropdowns();
  showView('dashboard');
});
