'use strict';

const express = require('express');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { initDb, getDb } = require('./src/database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function available(p) {
  return {
    pieces: p.current_pieces - p.reserved_pieces - p.memo_pieces - p.wip_pieces,
    weight: +(p.current_weight_ct - p.reserved_weight_ct - p.memo_weight_ct - p.wip_weight_ct).toFixed(4),
  };
}

/** Block operations on closed, merged, or quarantined parcels (unless explicitly allowed). */
function assertOperable(p, { allowQuarantine = false } = {}) {
  if (!p) {
    const err = new Error('Parcel not found');
    err.status = 404;
    throw err;
  }
  if (p.status !== 'active') {
    const err = new Error(`Parcel is ${p.status} and cannot be modified`);
    err.status = 400;
    throw err;
  }
  if (!allowQuarantine && p.lifecycle_stage === 'quarantined') {
    const err = new Error('Parcel is quarantined — release or reclassify before operating');
    err.status = 400;
    throw err;
  }
}

function costMoved(p, pieces, weightCt) {
  if (p.pricing_unit === 'per_piece' && p.current_pieces > 0) {
    return +(p.current_avg_cost * (pieces / p.current_pieces)).toFixed(2);
  }
  if (p.current_weight_ct > 0 && weightCt) {
    return +(p.current_avg_cost * (weightCt / p.current_weight_ct)).toFixed(2);
  }
  if (p.current_pieces > 0) {
    return +(p.current_avg_cost * (pieces / p.current_pieces)).toFixed(2);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_parcels,
      SUM(CASE WHEN lifecycle_stage = 'available'   THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN lifecycle_stage = 'on_memo'     THEN 1 ELSE 0 END) AS on_memo,
      SUM(CASE WHEN lifecycle_stage = 'in_production' THEN 1 ELSE 0 END) AS in_production,
      SUM(CASE WHEN lifecycle_stage = 'quarantined' THEN 1 ELSE 0 END) AS quarantined,
      SUM(current_weight_ct) AS total_weight_ct,
      SUM(current_pieces)    AS total_pieces,
      SUM(current_avg_cost)  AS total_value
    FROM parcels WHERE status = 'active'
  `).get();

  const byMaterial = db.prepare(`
    SELECT material, COUNT(*) AS count, SUM(current_pieces) AS pieces,
           SUM(current_weight_ct) AS weight_ct, SUM(current_avg_cost) AS value
    FROM parcels WHERE status = 'active'
    GROUP BY material ORDER BY value DESC
  `).all();

  const recentTxns = db.prepare(`
    SELECT t.*, p.parcel_number
    FROM parcel_transactions t
    JOIN parcels p ON p.id = t.parcel_id
    ORDER BY t.created_at DESC LIMIT 10
  `).all();

  res.json({ stats, byMaterial, recentTxns });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parcel CRUD
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/parcels', (req, res) => {
  const db = getDb();
  const { status, lifecycle_stage, material, q } = req.query;

  let sql = 'SELECT * FROM parcels WHERE 1=1';
  const params = {};

  if (status)          { sql += ' AND status = @status';                   params.status = status; }
  if (lifecycle_stage) { sql += ' AND lifecycle_stage = @lifecycle_stage'; params.lifecycle_stage = lifecycle_stage; }
  if (material)        { sql += ' AND material = @material';               params.material = material; }
  if (q)               { sql += ' AND (parcel_number LIKE @q OR vendor_parcel_number LIKE @q OR notes LIKE @q)'; params.q = `%${q}%`; }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(params);
  res.json(rows.map(p => ({ ...p, available: available(p) })));
});

app.get('/api/parcels/:id', (req, res) => {
  const db = getDb();
  const parcel = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!parcel) return res.status(404).json({ error: 'Parcel not found' });

  const certs        = db.prepare('SELECT * FROM parcel_certificates WHERE parcel_id = ?').all(req.params.id);
  const reservations = db.prepare("SELECT * FROM parcel_reservations WHERE parcel_id = ? AND status = 'active'").all(req.params.id);
  const children     = db.prepare('SELECT p.*, rel.relationship_type, rel.pieces_moved, rel.weight_moved_ct FROM parcel_relationships rel JOIN parcels p ON p.id = rel.child_parcel_id WHERE rel.parent_parcel_id = ?').all(req.params.id);
  const parents      = db.prepare('SELECT p.*, rel.relationship_type FROM parcel_relationships rel JOIN parcels p ON p.id = rel.parent_parcel_id WHERE rel.child_parcel_id = ?').all(req.params.id);

  res.json({ ...parcel, available: available(parcel), certificates: certs, reservations, children, parents });
});

// Create / Receive a new parcel
app.post('/api/parcels', (req, res) => {
  try {
  const db = getDb();
  const d  = req.body;
  const id = uuidv4();
  const num = d.parcel_number || `PCL-${Date.now()}`;

  const invoice = (d.invoice_number || '').trim();
  const memoNum = (d.memo_number || '').trim();
  if (!invoice && !memoNum) {
    return res.status(400).json({ error: 'Either Invoice Number or Memo # is required' });
  }
  const alnumDoc = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;
  if (invoice && !alnumDoc.test(invoice)) {
    return res.status(400).json({ error: 'Invoice Number must be alphanumeric (letters, numbers, - _ / allowed)' });
  }
  if (memoNum && !alnumDoc.test(memoNum)) {
    return res.status(400).json({ error: 'Memo # must be alphanumeric (letters, numbers, - _ / allowed)' });
  }
  if (d.original_weight_ct === undefined || d.original_weight_ct === null || d.original_weight_ct === '') {
    return res.status(400).json({ error: 'Total carat weight is required' });
  }
  if (d.purchase_rate === undefined || d.purchase_rate === null || d.purchase_rate === '') {
    return res.status(400).json({ error: 'Purchase rate is required' });
  }
  if (!d.material) return res.status(400).json({ error: 'Material is required' });
  if (!d.vendor) return res.status(400).json({ error: 'Vendor is required' });

  const weight = +d.original_weight_ct;
  const rate = +d.purchase_rate;
  const pieces = +(d.original_pieces || 0);
  const unit = d.pricing_unit || 'per_carat';
  let cost;
  if (d.landed_cost != null && d.landed_cost !== '') {
    cost = +d.landed_cost;
  } else if (unit === 'per_carat') {
    cost = +(rate * weight).toFixed(2);
  } else if (unit === 'per_piece') {
    cost = +(rate * pieces).toFixed(2);
  } else if (unit === 'per_parcel') {
    cost = +rate.toFixed(2);
  } else {
    cost = +(rate * weight).toFixed(2);
  }

  db.prepare(`
    INSERT INTO parcels (
      id, parcel_number, vendor_parcel_number, vendor, invoice_number, memo_number,
      po_number, receipt_reference,
      status, lifecycle_stage, material, material_origin, condition, shape,
      size_min_mm, size_max_mm, color, color_range_max, clarity, clarity_range_max,
      treatment, fluorescence, origin_country,
      original_pieces, current_pieces, original_weight_ct, current_weight_ct,
      purchase_rate, pricing_unit, landed_cost, current_avg_cost, currency,
      site, vault, bin_location, custodian, owner, legal_entity,
      screening_status, created_by, notes
    ) VALUES (
      @id, @parcel_number, @vendor_parcel_number, @vendor, @invoice_number, @memo_number,
      @po_number, @receipt_reference,
      'active', 'available', @material, @material_origin, @condition, @shape,
      @size_min_mm, @size_max_mm, @color, @color_range_max, @clarity, @clarity_range_max,
      @treatment, @fluorescence, @origin_country,
      @original_pieces, @original_pieces, @original_weight_ct, @original_weight_ct,
      @purchase_rate, @pricing_unit, @landed_cost, @landed_cost, @currency,
      @site, @vault, @bin_location, @custodian, @owner, @legal_entity,
      @screening_status, @created_by, @notes
    )
  `).run({
    id, parcel_number: num,
    vendor_parcel_number: d.vendor_parcel_number || null,
    vendor: d.vendor || null,
    invoice_number: invoice || null,
    memo_number: memoNum || null,
    po_number: d.po_number || null,
    receipt_reference: d.receipt_reference || null,
    material: d.material, material_origin: d.material_origin || 'natural',
    condition: d.condition || 'polished', shape: d.shape || null,
    size_min_mm: d.size_min_mm || null, size_max_mm: d.size_max_mm || null,
    color: d.color || null, color_range_max: d.color_range_max || null,
    clarity: d.clarity || null, clarity_range_max: d.clarity_range_max || null,
    treatment: d.treatment || 'none', fluorescence: d.fluorescence || 'none',
    origin_country: d.origin_country || null,
    original_pieces: pieces,
    original_weight_ct: weight,
    purchase_rate: rate,
    pricing_unit: unit,
    landed_cost: cost,
    currency: d.currency || 'USD',
    site: d.site || null, vault: d.vault || null,
    bin_location: d.bin_location || null,
    custodian: d.custodian || null, owner: d.owner || 'Company',
    legal_entity: d.legal_entity || null,
    screening_status: d.screening_status || 'pending',
    created_by: d.created_by || 'uat_user', notes: d.notes || null,
  });

  // Log transaction
  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type, reference_number, related_document,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct, location_to, custodian_to,
       physical_date, posting_date, created_by, reason_code, notes)
    VALUES
      (@id, @parcel_id, 'receipt', @ref, @doc,
       0, 0, @pieces, @weight, @cost,
       @pieces, @weight, @loc, @cust,
       @date, @date, @by, 'PURCHASE', @notes)
  `).run({
    id: uuidv4(), parcel_id: id,
    ref: invoice || memoNum || d.receipt_reference || null,
    doc: d.po_number || null,
    pieces, weight, cost,
    loc: [d.vault, d.bin_location].filter(Boolean).join(' / ') || null,
    cust: d.custodian || null, date: today(),
    by: d.created_by || 'uat_user',
    notes: [d.notes, d.vendor ? `Vendor: ${d.vendor}` : null, invoice ? `Invoice: ${invoice}` : null, memoNum ? `Memo: ${memoNum}` : null].filter(Boolean).join(' | ') || null,
  });

  res.status(201).json({ id, parcel_number: num, landed_cost: cost });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Split
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/split', (req, res) => {
  try {
  const db  = getDb();
  const src = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(src);

  const splits = req.body.splits; // [{pieces, weight_ct, site, vault, bin_location, notes}]
  if (!splits || splits.length < 1) return res.status(400).json({ error: 'Provide at least one split' });

  const totalPieces = splits.reduce((s, x) => s + (x.pieces || 0), 0);
  const totalWeight = +splits.reduce((s, x) => s + (x.weight_ct || 0), 0).toFixed(4);
  const avail = available(src);

  if (totalPieces > avail.pieces)      return res.status(400).json({ error: 'Split pieces exceed available' });
  if (totalWeight > avail.weight + 0.0001) return res.status(400).json({ error: 'Split weight exceeds available' });

  const allocMethod = req.body.allocation_method || 'proportional_weight';
  const closeParent = !!req.body.close_parent; // full-split: close parent at zero
  const refNum = `SPLIT-${Date.now()}`;
  const childIds = [];

  // Count existing children to get the right letter suffix
  const existingChildren = db.prepare('SELECT COUNT(*) AS cnt FROM parcel_relationships WHERE parent_parcel_id = ?').get(src.id);
  const childOffset = (existingChildren?.cnt || 0);

  db.transaction(() => {
    for (const s of splits) {
      const childId  = uuidv4();
      const suffix   = String.fromCharCode(65 + childOffset + childIds.length);
      const childNum = s.parcel_number || `${src.parcel_number}-${suffix}-${Date.now().toString(36).slice(-4)}`;
      let costAlloc;
      if (allocMethod === 'proportional_pieces' && src.current_pieces > 0) {
        costAlloc = +(src.current_avg_cost * ((s.pieces || 0) / src.current_pieces)).toFixed(2);
      } else if (allocMethod === 'manual' && s.cost != null) {
        costAlloc = +Number(s.cost).toFixed(2);
      } else {
        costAlloc = costMoved(src, s.pieces || 0, s.weight_ct || 0);
      }

      db.prepare(`
        INSERT INTO parcels (
          id, parcel_number, parent_parcel_id, root_parcel_id,
          status, lifecycle_stage, material, material_origin, condition, shape,
          size_min_mm, size_max_mm, color, color_range_max, clarity, clarity_range_max,
          treatment, fluorescence, origin_country,
          original_pieces, current_pieces, original_weight_ct, current_weight_ct,
          purchase_rate, pricing_unit, landed_cost, current_avg_cost, currency,
          site, vault, bin_location, custodian, owner, legal_entity,
          screening_status, created_by, notes
        ) VALUES (
          @id, @num, @parent, @root,
          'active', 'available', @mat, @orig, @cond, @shape,
          @smin, @smax, @col, @colmax, @cla, @clamax,
          @treat, @fluor, @origin,
          @pieces, @pieces, @weight, @weight,
          @rate, @unit, @cost, @cost, @currency,
          @site, @vault, @bin, @cust, @owner, @entity,
          @screen, @by, @notes
        )
      `).run({
        id: childId, num: childNum,
        parent: src.id, root: src.root_parcel_id || src.id,
        mat: src.material, orig: src.material_origin,
        cond: src.condition, shape: src.shape,
        smin: src.size_min_mm, smax: src.size_max_mm,
        col: src.color, colmax: src.color_range_max,
        cla: src.clarity, clamax: src.clarity_range_max,
        treat: src.treatment, fluor: src.fluorescence, origin: src.origin_country,
        pieces: s.pieces || 0, weight: s.weight_ct || 0,
        rate: src.purchase_rate, unit: src.pricing_unit,
        cost: costAlloc, currency: src.currency,
        site: s.site || src.site, vault: s.vault || src.vault,
        bin: s.bin_location || null,
        cust: s.custodian || src.custodian,
        owner: src.owner, entity: src.legal_entity,
        screen: src.screening_status,
        by: req.body.created_by || 'uat_user',
        notes: s.notes || `Split from ${src.parcel_number}`,
      });

      // Relationship
      db.prepare(`
        INSERT INTO parcel_relationships
          (parent_parcel_id, child_parcel_id, relationship_type, pieces_moved, weight_moved_ct, cost_allocated, allocation_method, notes)
        VALUES (@par, @chi, 'split', @p, @w, @c, @method, @n)
      `).run({ par: src.id, chi: childId, p: s.pieces || 0, w: s.weight_ct || 0, c: costAlloc, method: allocMethod, n: s.notes || null });

      // Child opening-balance transaction
      db.prepare(`
        INSERT INTO parcel_transactions
          (id, parcel_id, transaction_type, reference_number, related_parcel_id,
           before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
           after_pieces, after_weight_ct, location_to, custodian_to,
           physical_date, posting_date, created_by, reason_code, notes)
        VALUES
          (@id, @pid, 'opening_balance', @ref, @rel,
           0, 0, @p, @w, @c,
           @p, @w, @loc, @cust,
           @date, @date, @by, 'SPLIT_RECEIVE', @notes)
      `).run({
        id: uuidv4(), pid: childId, ref: refNum, rel: src.id,
        p: s.pieces || 0, w: s.weight_ct || 0, c: costAlloc,
        loc: [s.vault || src.vault, s.bin_location].filter(Boolean).join(' / ') || null,
        cust: s.custodian || src.custodian,
        date: today(), by: req.body.created_by || 'uat_user',
        notes: `Created by split from ${src.parcel_number}`,
      });

      childIds.push({ id: childId, parcel_number: childNum });
    }

    // Reduce parent
    const newPieces = src.current_pieces - totalPieces;
    const newWeight = +(src.current_weight_ct - totalWeight).toFixed(4);
    const costReduced = costMoved(src, totalPieces, totalWeight);
    const closeNow = closeParent || (newPieces === 0 && newWeight <= 0.0001);

    db.prepare(`
      UPDATE parcels SET
        current_pieces = @p, current_weight_ct = @w,
        current_avg_cost = current_avg_cost - @c,
        status = CASE WHEN @close THEN 'closed' ELSE status END,
        lifecycle_stage = CASE WHEN @close THEN 'closed' ELSE lifecycle_stage END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ p: newPieces, w: newWeight, c: costReduced, close: closeNow ? 1 : 0, id: src.id });

    // Parent split transaction
    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, reference_number,
         before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct,
         physical_date, posting_date, created_by, reason_code, notes)
      VALUES
        (@id, @pid, 'split', @ref,
         @bp, @bw, @dp, @dw, @dc,
         @ap, @aw,
         @date, @date, @by, 'SPLIT', @notes)
    `).run({
      id: uuidv4(), pid: src.id, ref: refNum,
      bp: src.current_pieces, bw: src.current_weight_ct,
      dp: -totalPieces, dw: -totalWeight, dc: -costReduced,
      ap: newPieces, aw: newWeight,
      date: today(), by: req.body.created_by || 'uat_user',
      notes: `Split into ${splits.length} child parcel(s)` + (closeNow ? ' (parent closed)' : ''),
    });
  })();

  res.json({ message: 'Split successful', children: childIds, parent_closed: closeParent || (src.current_pieces - totalPieces === 0) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/merge', (req, res) => {
  try {
  const db = getDb();
  const { source_ids, target_parcel_number, created_by } = req.body;
  if (!source_ids || source_ids.length < 2) return res.status(400).json({ error: 'Provide at least 2 source parcels' });

  const sources = source_ids.map(id => db.prepare('SELECT * FROM parcels WHERE id = ?').get(id));
  if (sources.some(s => !s))        return res.status(404).json({ error: 'One or more source parcels not found' });
  for (const s of sources) assertOperable(s);

  // Compatibility rules (non-negotiable)
  const origins = [...new Set(sources.map(s => s.material_origin))];
  if (origins.length > 1) return res.status(400).json({ error: 'Cannot merge natural and lab-grown material' });
  if (origins[0] === 'unknown') return res.status(400).json({ error: 'Cannot merge parcels with unknown material origin' });

  const materials = [...new Set(sources.map(s => s.material))];
  if (materials.length > 1) return res.status(400).json({ error: 'Cannot merge different materials' });

  const owners = [...new Set(sources.map(s => s.owner))];
  if (owners.length > 1) return res.status(400).json({ error: 'Cannot merge parcels with different ownership' });

  const entities = [...new Set(sources.map(s => s.legal_entity))];
  if (entities.length > 1) return res.status(400).json({ error: 'Cannot merge parcels from different legal entities' });

  const treatments = [...new Set(sources.map(s => s.treatment || 'none'))];
  if (treatments.length > 1) return res.status(400).json({ error: 'Cannot merge parcels with incompatible treatments' });

  const costMethods = [...new Set(sources.map(s => s.pricing_unit))];
  if (costMethods.length > 1) return res.status(400).json({ error: 'Cannot merge parcels with incompatible cost/pricing methods' });

  if (sources.some(s => s.reserved_pieces > 0 || s.memo_pieces > 0 || s.wip_pieces > 0)) {
    return res.status(400).json({ error: 'Cannot merge parcels with active reservations, memos, or WIP' });
  }

  const totalPieces = sources.reduce((s, p) => s + p.current_pieces, 0);
  const totalWeight = +sources.reduce((s, p) => s + p.current_weight_ct, 0).toFixed(4);
  const totalCost   = +sources.reduce((s, p) => s + p.current_avg_cost, 0).toFixed(2);

  const newId  = uuidv4();
  const newNum = target_parcel_number || `MERGE-${Date.now()}`;
  const first  = sources[0];

  db.transaction(() => {
    db.prepare(`
      INSERT INTO parcels (
        id, parcel_number, status, lifecycle_stage,
        material, material_origin, condition, shape,
        size_min_mm, size_max_mm, color, color_range_max, clarity, clarity_range_max,
        treatment, fluorescence, origin_country,
        original_pieces, current_pieces, original_weight_ct, current_weight_ct,
        pricing_unit, landed_cost, current_avg_cost, currency,
        site, vault, bin_location, custodian, owner, legal_entity,
        screening_status, created_by, notes
      ) VALUES (
        @id, @num, 'active', 'available',
        @mat, @orig, @cond, @shape,
        @smin, @smax, @col, @colmax, @cla, @clamax,
        @treat, @fluor, @origin,
        @pieces, @pieces, @weight, @weight,
        @unit, @cost, @cost, @currency,
        @site, @vault, @bin, @cust, @owner, @entity,
        @screen, @by, @notes
      )
    `).run({
      id: newId, num: newNum,
      mat: first.material, orig: first.material_origin,
      cond: first.condition, shape: first.shape,
      smin: first.size_min_mm, smax: first.size_max_mm,
      col: first.color, colmax: first.color_range_max,
      cla: first.clarity, clamax: first.clarity_range_max,
      treat: first.treatment, fluor: first.fluorescence, origin: first.origin_country,
      pieces: totalPieces, weight: totalWeight,
      unit: first.pricing_unit, cost: totalCost, currency: first.currency,
      site: first.site, vault: first.vault, bin: first.bin_location,
      cust: first.custodian, owner: first.owner, entity: first.legal_entity,
      screen: sources.every(s => s.screening_status === 'screened') ? 'screened' : 'pending',
      by: created_by || 'uat_user',
      notes: `Merged from: ${sources.map(s => s.parcel_number).join(', ')}`,
    });

    // Close source parcels, log transactions
    for (const src of sources) {
      db.prepare("UPDATE parcels SET status = 'merged', lifecycle_stage = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(src.id);
      db.prepare(`
        INSERT INTO parcel_relationships (parent_parcel_id, child_parcel_id, relationship_type, pieces_moved, weight_moved_ct, cost_allocated, notes)
        VALUES (@par, @chi, 'merge', @p, @w, @c, @n)
      `).run({ par: src.id, chi: newId, p: src.current_pieces, w: src.current_weight_ct, c: src.current_avg_cost, n: null });
      db.prepare(`
        INSERT INTO parcel_transactions
          (id, parcel_id, transaction_type, reference_number, related_parcel_id,
           before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
           after_pieces, after_weight_ct,
           physical_date, posting_date, created_by, reason_code, notes)
        VALUES
          (@id, @pid, 'merge', @ref, @rel,
           @bp, @bw, @dp, @dw, @dc,
           0, 0, @date, @date, @by, 'MERGE', @notes)
      `).run({
        id: uuidv4(), pid: src.id, ref: newNum, rel: newId,
        bp: src.current_pieces, bw: src.current_weight_ct,
        dp: -src.current_pieces, dw: -src.current_weight_ct, dc: -src.current_avg_cost,
        date: today(), by: created_by || 'uat_user', notes: `Merged into ${newNum}`,
      });
    }

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, reference_number,
         before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct,
         physical_date, posting_date, created_by, reason_code, notes)
      VALUES
        (@id, @pid, 'opening_balance', @ref,
         0, 0, @p, @w, @c,
         @p, @w, @date, @date, @by, 'MERGE_RECEIVE', @notes)
    `).run({
      id: uuidv4(), pid: newId, ref: newNum,
      p: totalPieces, w: totalWeight, c: totalCost,
      date: today(), by: created_by || 'uat_user',
      notes: `Created by merging ${sources.length} parcels`,
    });
  })();

  res.json({ message: 'Merge successful', merged_parcel_id: newId, parcel_number: newNum });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Transfer
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/transfer', (req, res) => {
  try {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(p, { allowQuarantine: true }); // quarantine parcels may be relocated

  const { site, vault, bin_location, custodian, reason, notes, created_by } = req.body;

  db.prepare(`
    UPDATE parcels SET site = @site, vault = @vault, bin_location = @bin,
      custodian = @cust, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ site: site || p.site, vault: vault || p.vault, bin: bin_location || p.bin_location, cust: custodian || p.custodian, id: p.id });

  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct,
       location_from, location_to, custodian_from, custodian_to,
       physical_date, posting_date, created_by, reason_code, notes)
    VALUES
      (@id, @pid, 'transfer',
       @bp, @bw, 0, 0, 0,
       @bp, @bw,
       @lf, @lt, @cf, @ct,
       @date, @date, @by, @rc, @notes)
  `).run({
    id: uuidv4(), pid: p.id,
    bp: p.current_pieces, bw: p.current_weight_ct,
    lf: [p.vault, p.bin_location].filter(Boolean).join(' / ') || null,
    lt: [vault || p.vault, bin_location || p.bin_location].filter(Boolean).join(' / ') || null,
    cf: p.custodian, ct: custodian || p.custodian,
    date: today(), by: created_by || 'uat_user',
    rc: reason || 'TRANSFER', notes: notes || null,
  });

  res.json({ message: 'Transfer recorded' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Manufacturing Issue
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/issue', (req, res) => {
  try {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(p);

  const { pieces, weight_ct, work_order, notes, created_by } = req.body;
  const avail = available(p);
  if (pieces > avail.pieces) return res.status(400).json({ error: 'Insufficient available pieces' });
  if ((weight_ct || 0) > avail.weight + 0.0001) return res.status(400).json({ error: 'Insufficient available weight' });

  const moved = costMoved(p, pieces, weight_ct || 0);

  db.prepare(`
    UPDATE parcels SET
      wip_pieces = wip_pieces + @p,
      wip_weight_ct = wip_weight_ct + @w,
      lifecycle_stage = CASE WHEN current_pieces - reserved_pieces - memo_pieces - wip_pieces - @p <= 0 THEN 'in_production' ELSE lifecycle_stage END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ p: pieces, w: weight_ct || 0, id: p.id });

  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type, reference_number,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct,
       location_from, location_to, custodian_from, custodian_to,
       physical_date, posting_date, created_by, reason_code, notes)
    VALUES
      (@id, @pid, 'manufacturing_issue', @ref,
       @bp, @bw, @dp, @dw, @dc,
       @bp, @bw,
       @lf, 'Production Floor', @cf, 'Production Team',
       @date, @date, @by, 'PRODUCTION', @notes)
  `).run({
    id: uuidv4(), pid: p.id, ref: work_order || null,
    bp: p.current_pieces, bw: p.current_weight_ct,
    dp: -pieces, dw: -(weight_ct || 0), dc: -moved,
    lf: [p.vault, p.bin_location].filter(Boolean).join(' / ') || null,
    cf: p.custodian, date: today(), by: created_by || 'uat_user',
    notes: notes || `Issued to ${work_order || 'production'}`,
  });

  res.json({ message: 'Issue recorded', cost_moved: moved });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Manufacturing Return
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/return', (req, res) => {
  try {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(p);

  const { pieces, weight_ct, broken_pieces, lost_pieces, consumed_pieces, work_order, notes, created_by } = req.body;
  const returned = pieces || 0;
  const broken   = broken_pieces || 0;
  const lost     = lost_pieces || 0;
  const consumed = consumed_pieces || 0;
  const settled  = returned + broken + lost + consumed;

  if (settled <= 0) return res.status(400).json({ error: 'Provide returned, broken, lost, and/or consumed pieces' });
  if (settled > p.wip_pieces) return res.status(400).json({ error: 'Return exceeds WIP quantity' });

  // Weight leaving WIP: returned weight stays in parcel; broken/lost/consumed weight leaves inventory.
  // If only one weight is supplied, treat it as the total weight settled out of WIP.
  const settledWeight = weight_ct || 0;
  const leaveInventoryWeight = settled > 0 && returned < settled
    ? +(settledWeight * ((broken + lost + consumed) / settled)).toFixed(4)
    : (returned === 0 ? settledWeight : 0);

  const newPieces = p.current_pieces - broken - lost - consumed;
  const newWeight = +(p.current_weight_ct - leaveInventoryWeight).toFixed(4);
  const newWip = p.wip_pieces - settled;
  const newWipWt = Math.max(0, +(p.wip_weight_ct - settledWeight).toFixed(4));

  db.prepare(`
    UPDATE parcels SET
      wip_pieces = @wip,
      wip_weight_ct = @wipw,
      damaged_pieces = damaged_pieces + @broken,
      current_pieces = @np,
      current_weight_ct = @nw,
      lifecycle_stage = CASE WHEN @wip > 0 THEN 'in_production'
                             WHEN reserved_pieces > 0 THEN 'reserved'
                             WHEN memo_pieces > 0 THEN 'on_memo'
                             ELSE 'available' END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ wip: newWip, wipw: newWipWt, broken, np: newPieces, nw: newWeight, id: p.id });

  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type, reference_number,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct,
       physical_date, posting_date, created_by, reason_code, notes)
    VALUES
      (@id, @pid, 'manufacturing_return', @ref,
       @bp, @bw, @dp, @dw, 0,
       @ap, @aw, @date, @date, @by, 'PROD_RETURN', @notes)
  `).run({
    id: uuidv4(), pid: p.id, ref: work_order || null,
    bp: p.current_pieces, bw: p.current_weight_ct,
    dp: -(broken + lost + consumed),
    dw: -leaveInventoryWeight,
    ap: newPieces, aw: newWeight,
    date: today(), by: created_by || 'uat_user',
    notes: notes || `Returned ${returned} pcs, broken: ${broken}, lost: ${lost}, consumed: ${consumed}`,
  });

  res.json({ message: 'Return recorded', returned, broken, lost, consumed, settled });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Memo Issue
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/memo', (req, res) => {
  try {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(p);

  const { pieces, weight_ct, customer, memo_ref, notes, created_by } = req.body;
  const avail = available(p);
  if (pieces > avail.pieces) return res.status(400).json({ error: 'Insufficient available pieces for memo' });

  db.prepare(`
    UPDATE parcels SET
      memo_pieces = memo_pieces + @p, memo_weight_ct = memo_weight_ct + @w,
      lifecycle_stage = CASE WHEN current_pieces - reserved_pieces - (memo_pieces + @p) - wip_pieces <= 0
                             THEN 'on_memo' ELSE lifecycle_stage END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ p: pieces, w: weight_ct || 0, id: p.id });

  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type, reference_number,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct,
       custodian_from, custodian_to,
       physical_date, posting_date, created_by, reason_code, notes)
    VALUES
      (@id, @pid, 'memo_issue', @ref,
       @bp, @bw, @dp, @dw, 0,
       @bp, @bw,
       @cf, @ct, @date, @date, @by, 'MEMO', @notes)
  `).run({
    id: uuidv4(), pid: p.id, ref: memo_ref || null,
    bp: p.current_pieces, bw: p.current_weight_ct,
    dp: -pieces, dw: -(weight_ct || 0),
    cf: p.custodian, ct: customer || 'Customer',
    date: today(), by: created_by || 'uat_user',
    notes: notes || `Memo issued to ${customer || 'customer'}`,
  });

  res.json({ message: 'Memo issue recorded' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Memo Return
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/memo-return', (req, res) => {
  try {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(p);

  const { pieces, weight_ct, memo_ref, notes, created_by } = req.body;
  if (pieces > p.memo_pieces) return res.status(400).json({ error: 'Return pieces exceed memo balance' });

  db.prepare(`
    UPDATE parcels SET
      memo_pieces = memo_pieces - @p, memo_weight_ct = memo_weight_ct - @w,
      lifecycle_stage = 'available',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ p: pieces, w: weight_ct || 0, id: p.id });

  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type, reference_number,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct,
       physical_date, posting_date, created_by, reason_code, notes)
    VALUES
      (@id, @pid, 'memo_return', @ref,
       @bp, @bw, @dp, @dw, 0,
       @bp, @bw, @date, @date, @by, 'MEMO_RETURN', @notes)
  `).run({
    id: uuidv4(), pid: p.id, ref: memo_ref || null,
    bp: p.current_pieces, bw: p.current_weight_ct,
    dp: pieces, dw: weight_ct || 0,
    date: today(), by: created_by || 'uat_user',
    notes: notes || `Memo return of ${pieces} pcs`,
  });

  res.json({ message: 'Memo return recorded' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Count / Weight Adjustment
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/adjust', (req, res) => {
  try {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  assertOperable(p, { allowQuarantine: true });

  const { new_pieces, new_weight_ct, reason, approved_by, notes, created_by } = req.body;
  if (new_pieces === undefined && new_weight_ct === undefined) return res.status(400).json({ error: 'Provide new_pieces or new_weight_ct' });
  if (!approved_by) return res.status(400).json({ error: 'Count corrections require approved_by (maker-checker)' });

  const adjPieces = new_pieces !== undefined ? new_pieces - p.current_pieces : 0;
  const adjWeight = new_weight_ct !== undefined ? +(new_weight_ct - p.current_weight_ct).toFixed(4) : 0;

  db.prepare(`
    UPDATE parcels SET
      current_pieces    = COALESCE(@p, current_pieces),
      current_weight_ct = COALESCE(@w, current_weight_ct),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ p: new_pieces ?? null, w: new_weight_ct ?? null, id: p.id });

  db.prepare(`
    INSERT INTO parcel_transactions
      (id, parcel_id, transaction_type,
       before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
       after_pieces, after_weight_ct,
       physical_date, posting_date, created_by, approved_by, reason_code, notes)
    VALUES
      (@id, @pid, 'count_correction',
       @bp, @bw, @dp, @dw, 0,
       @ap, @aw, @date, @date, @by, @apv, 'COUNT_ADJ', @notes)
  `).run({
    id: uuidv4(), pid: p.id,
    bp: p.current_pieces, bw: p.current_weight_ct,
    dp: adjPieces, dw: adjWeight,
    ap: new_pieces ?? p.current_pieces,
    aw: new_weight_ct ?? p.current_weight_ct,
    date: today(), by: created_by || 'uat_user', apv: approved_by || null,
    notes: notes || reason || 'Physical count adjustment',
  });

  res.json({ message: 'Adjustment recorded', pieces_delta: adjPieces, weight_delta: adjWeight });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reservation / Unreservation
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/reserve', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    assertOperable(p);
    const { pieces, weight_ct, reservation_type, order_reference, customer, reserved_by, notes } = req.body;
    const avail = available(p);
    if (!pieces || pieces <= 0) return res.status(400).json({ error: 'pieces required' });
    if (pieces > avail.pieces) return res.status(400).json({ error: 'Insufficient available pieces' });
    if ((weight_ct || 0) > avail.weight + 0.0001) return res.status(400).json({ error: 'Insufficient available weight' });

    db.prepare(`
      UPDATE parcels SET reserved_pieces = reserved_pieces + @p, reserved_weight_ct = reserved_weight_ct + @w,
        lifecycle_stage = CASE WHEN lifecycle_stage = 'available' THEN 'reserved' ELSE lifecycle_stage END,
        updated_at = CURRENT_TIMESTAMP WHERE id = @id
    `).run({ p: pieces, w: weight_ct || 0, id: p.id });

    const r = db.prepare(`
      INSERT INTO parcel_reservations
        (parcel_id, reserved_pieces, reserved_weight, reservation_type, order_reference, customer, reserved_by, notes)
      VALUES (@pid, @p, @w, @type, @ord, @cust, @by, @notes)
    `).run({
      pid: p.id, p: pieces, w: weight_ct || 0,
      type: reservation_type || 'order', ord: order_reference || null,
      cust: customer || null, by: reserved_by || 'uat_user', notes: notes || null,
    });

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, reference_number,
         before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct, physical_date, posting_date, created_by, reason_code, notes)
      VALUES
        (@id, @pid, 'reservation', @ref, @bp, @bw, @dp, @dw, 0, @bp, @bw, @date, @date, @by, 'RESERVE', @notes)
    `).run({
      id: uuidv4(), pid: p.id, ref: order_reference || null,
      bp: p.current_pieces, bw: p.current_weight_ct,
      dp: -pieces, dw: -(weight_ct || 0),
      date: today(), by: reserved_by || 'uat_user',
      notes: notes || `Reserved ${pieces} pcs for ${customer || order_reference || 'order'}`,
    });

    res.json({ message: 'Reservation recorded' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/parcels/:id/unreserve', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    assertOperable(p);
    const { pieces, weight_ct, reservation_id, notes, created_by } = req.body;
    const pcs = pieces ?? p.reserved_pieces;
    const wt  = weight_ct ?? p.reserved_weight_ct;
    if (pcs > p.reserved_pieces) return res.status(400).json({ error: 'Unreserve exceeds reserved balance' });

    db.prepare(`
      UPDATE parcels SET reserved_pieces = reserved_pieces - @p, reserved_weight_ct = reserved_weight_ct - @w,
        lifecycle_stage = CASE WHEN reserved_pieces - @p <= 0 AND memo_pieces = 0 AND wip_pieces = 0 THEN 'available' ELSE lifecycle_stage END,
        updated_at = CURRENT_TIMESTAMP WHERE id = @id
    `).run({ p: pcs, w: wt, id: p.id });

    if (reservation_id) {
      db.prepare("UPDATE parcel_reservations SET status = 'released' WHERE id = ?").run(reservation_id);
    } else {
      db.prepare("UPDATE parcel_reservations SET status = 'released' WHERE parcel_id = ? AND status = 'active'").run(p.id);
    }

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct, physical_date, posting_date, created_by, reason_code, notes)
      VALUES
        (@id, @pid, 'unreservation', @bp, @bw, @dp, @dw, 0, @bp, @bw, @date, @date, @by, 'UNRESERVE', @notes)
    `).run({
      id: uuidv4(), pid: p.id, bp: p.current_pieces, bw: p.current_weight_ct,
      dp: pcs, dw: wt, date: today(), by: created_by || 'uat_user',
      notes: notes || `Released reservation of ${pcs} pcs`,
    });

    res.json({ message: 'Reservation released' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Sale / Consumption
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/sale', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    assertOperable(p);
    const { pieces, weight_ct, sales_ref, customer, notes, created_by } = req.body;
    const avail = available(p);
    if (!pieces || pieces <= 0) return res.status(400).json({ error: 'pieces required' });
    if (pieces > avail.pieces) return res.status(400).json({ error: 'Insufficient available pieces' });
    if ((weight_ct || 0) > avail.weight + 0.0001) return res.status(400).json({ error: 'Insufficient available weight' });

    const moved = costMoved(p, pieces, weight_ct || 0);
    const newPieces = p.current_pieces - pieces;
    const newWeight = +(p.current_weight_ct - (weight_ct || 0)).toFixed(4);
    const closeNow = newPieces === 0 && newWeight <= 0.0001;

    db.prepare(`
      UPDATE parcels SET current_pieces = @p, current_weight_ct = @w,
        current_avg_cost = current_avg_cost - @c,
        status = CASE WHEN @close THEN 'closed' ELSE status END,
        lifecycle_stage = CASE WHEN @close THEN 'closed' ELSE lifecycle_stage END,
        updated_at = CURRENT_TIMESTAMP WHERE id = @id
    `).run({ p: newPieces, w: newWeight, c: moved, close: closeNow ? 1 : 0, id: p.id });

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, reference_number,
         before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct, custodian_to,
         physical_date, posting_date, created_by, reason_code, notes)
      VALUES
        (@id, @pid, 'sale', @ref, @bp, @bw, @dp, @dw, @dc, @ap, @aw, @ct,
         @date, @date, @by, 'SALE', @notes)
    `).run({
      id: uuidv4(), pid: p.id, ref: sales_ref || null,
      bp: p.current_pieces, bw: p.current_weight_ct,
      dp: -pieces, dw: -(weight_ct || 0), dc: -moved,
      ap: newPieces, aw: newWeight, ct: customer || null,
      date: today(), by: created_by || 'uat_user',
      notes: notes || `Sold ${pieces} pcs to ${customer || 'customer'}`,
    });

    res.json({ message: 'Sale recorded', cost_cogs: moved, closed: closeNow });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Regrade / Resort
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/regrade', (req, res) => {
  try {
    const db = getDb();
    const src = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    assertOperable(src);
    const { outputs, process_loss_weight_ct, process_loss_pieces, approved_by, notes, created_by, tolerance_ct } = req.body;
    // outputs: [{parcel_number, pieces, weight_ct, color, clarity, assortment_grade, notes}]
    if (!outputs || outputs.length < 1) return res.status(400).json({ error: 'Provide at least one output grade' });

    const outPieces = outputs.reduce((s, o) => s + (o.pieces || 0), 0);
    const outWeight = +outputs.reduce((s, o) => s + (o.weight_ct || 0), 0).toFixed(4);
    const lossPcs   = process_loss_pieces || 0;
    const lossWt    = process_loss_weight_ct || 0;
    const unexplainedPcs = src.current_pieces - outPieces - lossPcs;
    const unexplainedWt  = +(src.current_weight_ct - outWeight - lossWt).toFixed(4);
    const tol = tolerance_ct != null ? tolerance_ct : 0.02;

    if (Math.abs(unexplainedWt) > tol && !approved_by) {
      return res.status(400).json({
        error: `Unexplained weight variance ${unexplainedWt} ct exceeds tolerance ${tol} ct — approved_by required`,
        unexplained_weight_ct: unexplainedWt,
        unexplained_pieces: unexplainedPcs,
      });
    }

    const refNum = `REGRADE-${Date.now()}`;
    const children = [];

    db.transaction(() => {
      for (const o of outputs) {
        const childId = uuidv4();
        const childNum = o.parcel_number || `${src.parcel_number}-G${children.length + 1}-${Date.now().toString(36).slice(-4)}`;
        const costAlloc = costMoved(src, o.pieces || 0, o.weight_ct || 0);

        db.prepare(`
          INSERT INTO parcels (
            id, parcel_number, parent_parcel_id, root_parcel_id,
            status, lifecycle_stage, material, material_origin, condition, shape,
            size_min_mm, size_max_mm, color, color_range_max, clarity, clarity_range_max,
            treatment, fluorescence, origin_country, assortment_grade,
            original_pieces, current_pieces, original_weight_ct, current_weight_ct,
            purchase_rate, pricing_unit, landed_cost, current_avg_cost, currency,
            site, vault, bin_location, custodian, owner, legal_entity,
            screening_status, created_by, notes
          ) VALUES (
            @id, @num, @parent, @root, 'active', 'available',
            @mat, @orig, @cond, @shape, @smin, @smax, @col, @colmax, @cla, @clamax,
            @treat, @fluor, @origin, @grade,
            @pieces, @pieces, @weight, @weight,
            @rate, @unit, @cost, @cost, @currency,
            @site, @vault, @bin, @cust, @owner, @entity,
            @screen, @by, @notes
          )
        `).run({
          id: childId, num: childNum, parent: src.id, root: src.root_parcel_id || src.id,
          mat: src.material, orig: src.material_origin, cond: src.condition, shape: src.shape,
          smin: src.size_min_mm, smax: src.size_max_mm,
          col: o.color || src.color, colmax: o.color_range_max || src.color_range_max,
          cla: o.clarity || src.clarity, clamax: o.clarity_range_max || src.clarity_range_max,
          treat: src.treatment, fluor: src.fluorescence, origin: src.origin_country,
          grade: o.assortment_grade || 'regraded',
          pieces: o.pieces || 0, weight: o.weight_ct || 0,
          rate: src.purchase_rate, unit: src.pricing_unit, cost: costAlloc, currency: src.currency,
          site: o.site || src.site, vault: o.vault || src.vault, bin: o.bin_location || null,
          cust: src.custodian, owner: src.owner, entity: src.legal_entity,
          screen: src.screening_status, by: created_by || 'uat_user',
          notes: o.notes || `Regrade from ${src.parcel_number}`,
        });

        db.prepare(`
          INSERT INTO parcel_relationships
            (parent_parcel_id, child_parcel_id, relationship_type, pieces_moved, weight_moved_ct, cost_allocated, allocation_method, notes)
          VALUES (@par, @chi, 'regrade', @p, @w, @c, 'proportional_weight', @n)
        `).run({ par: src.id, chi: childId, p: o.pieces || 0, w: o.weight_ct || 0, c: costAlloc, n: o.notes || null });

        db.prepare(`
          INSERT INTO parcel_transactions
            (id, parcel_id, transaction_type, reference_number, related_parcel_id,
             before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
             after_pieces, after_weight_ct, physical_date, posting_date, created_by, reason_code, notes)
          VALUES
            (@id, @pid, 'opening_balance', @ref, @rel, 0, 0, @p, @w, @c, @p, @w, @date, @date, @by, 'REGRADE_OUT', @notes)
        `).run({
          id: uuidv4(), pid: childId, ref: refNum, rel: src.id,
          p: o.pieces || 0, w: o.weight_ct || 0, c: costAlloc,
          date: today(), by: created_by || 'uat_user',
          notes: `Created by regrade from ${src.parcel_number}`,
        });

        children.push({ id: childId, parcel_number: childNum });
      }

      db.prepare(`
        UPDATE parcels SET current_pieces = 0, current_weight_ct = 0, current_avg_cost = 0,
          status = 'closed', lifecycle_stage = 'closed', updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({ id: src.id });

      db.prepare(`
        INSERT INTO parcel_transactions
          (id, parcel_id, transaction_type, reference_number,
           before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
           after_pieces, after_weight_ct, physical_date, posting_date,
           created_by, approved_by, reason_code, notes)
        VALUES
          (@id, @pid, 'regrade', @ref, @bp, @bw, @dp, @dw, @dc, 0, 0, @date, @date, @by, @apv, 'REGRADE', @notes)
      `).run({
        id: uuidv4(), pid: src.id, ref: refNum,
        bp: src.current_pieces, bw: src.current_weight_ct,
        dp: -src.current_pieces, dw: -src.current_weight_ct, dc: -src.current_avg_cost,
        date: today(), by: created_by || 'uat_user', apv: approved_by || null,
        notes: notes || `Regraded into ${outputs.length} grades; process loss ${lossWt} ct / ${lossPcs} pcs; unexplained ${unexplainedWt} ct`,
      });
    })();

    res.json({
      message: 'Regrade successful',
      children,
      process_loss_weight_ct: lossWt,
      process_loss_pieces: lossPcs,
      unexplained_weight_ct: unexplainedWt,
      unexplained_pieces: unexplainedPcs,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Ownership transfer & Quarantine release
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/ownership', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    assertOperable(p, { allowQuarantine: true });
    const { owner, legal_entity, approved_by, notes, created_by } = req.body;
    if (!owner) return res.status(400).json({ error: 'owner required' });
    if (!approved_by) return res.status(400).json({ error: 'Ownership transfer requires approved_by' });

    db.prepare(`
      UPDATE parcels SET owner = @owner, legal_entity = COALESCE(@entity, legal_entity),
        updated_at = CURRENT_TIMESTAMP WHERE id = @id
    `).run({ owner, entity: legal_entity || null, id: p.id });

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct, physical_date, posting_date, created_by, approved_by, reason_code, notes)
      VALUES
        (@id, @pid, 'ownership_transfer', @bp, @bw, 0, 0, 0, @bp, @bw, @date, @date, @by, @apv, 'OWNERSHIP', @notes)
    `).run({
      id: uuidv4(), pid: p.id, bp: p.current_pieces, bw: p.current_weight_ct,
      date: today(), by: created_by || 'uat_user', apv: approved_by,
      notes: notes || `Ownership changed from ${p.owner} to ${owner}`,
    });

    res.json({ message: 'Ownership transferred', previous_owner: p.owner, owner });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/parcels/:id/quarantine', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Parcel not found' });
    if (p.status !== 'active') return res.status(400).json({ error: 'Parcel is not active' });
    const { reason, notes, created_by } = req.body;

    db.prepare(`
      UPDATE parcels SET lifecycle_stage = 'quarantined', screening_status = 'pending',
        updated_at = CURRENT_TIMESTAMP WHERE id = @id
    `).run({ id: p.id });

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct, physical_date, posting_date, created_by, reason_code, notes)
      VALUES
        (@id, @pid, 'quarantine', @bp, @bw, 0, 0, 0, @bp, @bw, @date, @date, @by, 'QUARANTINE', @notes)
    `).run({
      id: uuidv4(), pid: p.id, bp: p.current_pieces, bw: p.current_weight_ct,
      date: today(), by: created_by || 'uat_user',
      notes: notes || reason || 'Placed in quarantine',
    });

    res.json({ message: 'Parcel quarantined' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/parcels/:id/release-quarantine', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Parcel not found' });
    if (p.lifecycle_stage !== 'quarantined') return res.status(400).json({ error: 'Parcel is not quarantined' });

    const { material_origin, material, screening_status, approved_by, notes, created_by } = req.body;
    if (!approved_by) return res.status(400).json({ error: 'Quarantine release requires approved_by' });
    if (!material_origin || material_origin === 'unknown') {
      return res.status(400).json({ error: 'material_origin must be resolved before release' });
    }

    db.prepare(`
      UPDATE parcels SET
        lifecycle_stage = 'available',
        material_origin = @orig,
        material = COALESCE(@mat, material),
        screening_status = @screen,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      orig: material_origin, mat: material || null,
      screen: screening_status || 'screened', id: p.id,
    });

    db.prepare(`
      INSERT INTO parcel_transactions
        (id, parcel_id, transaction_type, before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
         after_pieces, after_weight_ct, physical_date, posting_date, created_by, approved_by, reason_code, notes)
      VALUES
        (@id, @pid, 'quarantine_release', @bp, @bw, 0, 0, 0, @bp, @bw, @date, @date, @by, @apv, 'RELEASE', @notes)
    `).run({
      id: uuidv4(), pid: p.id, bp: p.current_pieces, bw: p.current_weight_ct,
      date: today(), by: created_by || 'uat_user', apv: approved_by,
      notes: notes || `Released from quarantine as ${material_origin}`,
    });

    res.json({ message: 'Quarantine released', material_origin });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificates
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/certificates', (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Parcel not found' });
    const { cert_type, cert_number, issued_by, issued_date, expiry_date, notes } = req.body;
    if (!cert_type) return res.status(400).json({ error: 'cert_type required' });

    db.prepare(`
      INSERT INTO parcel_certificates
        (parcel_id, cert_type, cert_number, issued_by, issued_date, expiry_date, is_valid, notes)
      VALUES (@pid, @type, @num, @by, @issued, @exp, 1, @notes)
    `).run({
      pid: p.id, type: cert_type, num: cert_number || null, by: issued_by || null,
      issued: issued_date || today(), exp: expiry_date || null, notes: notes || null,
    });

    res.status(201).json({ message: 'Certificate attached' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Disposition audit — trace every carat from a root parcel
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/parcels/:id/disposition', (req, res) => {
  const db = getDb();
  const start = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!start) return res.status(404).json({ error: 'Parcel not found' });

  const rootId = start.root_parcel_id || start.id;
  const root = db.prepare('SELECT * FROM parcels WHERE id = ?').get(rootId);

  function collectFamily(id, acc = []) {
    const p = db.prepare('SELECT * FROM parcels WHERE id = ?').get(id);
    if (!p) return acc;
    acc.push(p);
    const kids = db.prepare('SELECT child_parcel_id FROM parcel_relationships WHERE parent_parcel_id = ?').all(id);
    for (const k of kids) collectFamily(k.child_parcel_id, acc);
    return acc;
  }

  const family = collectFamily(rootId);
  const txns = db.prepare(`
    SELECT t.*, p.parcel_number FROM parcel_transactions t
    JOIN parcels p ON p.id = t.parcel_id
    WHERE t.parcel_id IN (${family.map(() => '?').join(',')})
    ORDER BY t.physical_date, t.created_at
  `).all(family.map(f => f.id));

  const active = family.filter(f => f.status === 'active');
  const closed = family.filter(f => f.status !== 'active');
  const currentPieces = active.reduce((s, f) => s + f.current_pieces, 0);
  const currentWeight = +active.reduce((s, f) => s + f.current_weight_ct, 0).toFixed(4);
  const currentValue  = +active.reduce((s, f) => s + f.current_avg_cost, 0).toFixed(2);

  const sold = txns.filter(t => t.transaction_type === 'sale')
    .reduce((a, t) => ({ pieces: a.pieces + Math.abs(t.pieces_delta), weight: +(a.weight + Math.abs(t.weight_delta_ct)).toFixed(4) }), { pieces: 0, weight: 0 });
  const lost = txns.filter(t => ['loss', 'count_correction'].includes(t.transaction_type) && t.pieces_delta < 0)
    .reduce((a, t) => ({ pieces: a.pieces + Math.abs(t.pieces_delta), weight: +(a.weight + Math.abs(t.weight_delta_ct)).toFixed(4) }), { pieces: 0, weight: 0 });

  res.json({
    root: { id: root.id, parcel_number: root.parcel_number, original_pieces: root.original_pieces, original_weight_ct: root.original_weight_ct },
    family: family.map(f => ({
      id: f.id, parcel_number: f.parcel_number, status: f.status, lifecycle_stage: f.lifecycle_stage,
      current_pieces: f.current_pieces, current_weight_ct: f.current_weight_ct, current_avg_cost: f.current_avg_cost,
      site: f.site, vault: f.vault, owner: f.owner,
    })),
    summary: {
      original_pieces: root.original_pieces,
      original_weight_ct: root.original_weight_ct,
      remaining_pieces: currentPieces,
      remaining_weight_ct: currentWeight,
      remaining_value: currentValue,
      sold_pieces: sold.pieces,
      sold_weight_ct: sold.weight,
      adjusted_or_lost_pieces: lost.pieces,
      family_count: family.length,
      active_count: active.length,
      closed_count: closed.length,
    },
    transactions: txns,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UAT reset — reseed without restarting the process
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/uat/reset', async (req, res) => {
  try {
    const { spawnSync } = require('child_process');
    const { reloadDb } = require('./src/database');
    const result = spawnSync('node', [path.join(__dirname, 'src', 'seed.js')], { encoding: 'utf8' });
    if (result.status !== 0) {
      return res.status(500).json({ error: 'Seed failed', detail: result.stderr || result.stdout });
    }
    await reloadDb();
    res.json({ message: 'UAT data reset to seed baseline', seed_log: (result.stdout || '').trim().split('\n').pop() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Transactions & Genealogy
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/parcels/:id/transactions', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM parcel_transactions WHERE parcel_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows);
});

app.get('/api/parcels/:id/genealogy', (req, res) => {
  const db = getDb();

  function buildTree(id) {
    const parcel = db.prepare('SELECT id, parcel_number, status, lifecycle_stage, current_pieces, current_weight_ct, material FROM parcels WHERE id = ?').get(id);
    if (!parcel) return null;
    const children = db.prepare('SELECT child_parcel_id, relationship_type, pieces_moved, weight_moved_ct FROM parcel_relationships WHERE parent_parcel_id = ?').all(id);
    parcel.children = children.map(c => ({ ...buildTree(c.child_parcel_id), relationship_type: c.relationship_type, pieces_moved: c.pieces_moved, weight_moved_ct: c.weight_moved_ct })).filter(Boolean);
    return parcel;
  }

  const parcel = db.prepare('SELECT root_parcel_id, id FROM parcels WHERE id = ?').get(req.params.id);
  if (!parcel) return res.status(404).json({ error: 'Not found' });

  const rootId = parcel.root_parcel_id || parcel.id;
  res.json(buildTree(rootId));
});

const { MATERIALS, VENDORS } = require('./src/materials');

// Lookup fields (for dropdowns)
app.get('/api/meta/materials', (_req, res) => res.json(MATERIALS));
app.get('/api/meta/vendors', (_req, res) => res.json(VENDORS));
app.get('/api/meta/lifecycle',  (_req, res) => res.json(['available','in_production','on_memo','quarantined','reserved','closed']));

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🔷  Jewelry Parcel UAT Server running at http://localhost:${PORT}`);
    console.log(`    Dashboard : http://localhost:${PORT}`);
    console.log(`    API       : http://localhost:${PORT}/api/parcels\n`);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
