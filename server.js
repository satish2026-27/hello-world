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
  const db = getDb();
  const d  = req.body;
  const id = uuidv4();
  const num = d.parcel_number || `PCL-${Date.now()}`;
  const cost = (d.purchase_rate || 0) * (d.pricing_unit === 'per_carat' ? (d.original_weight_ct || 0) : (d.original_pieces || 0));

  db.prepare(`
    INSERT INTO parcels (
      id, parcel_number, vendor_parcel_number, po_number, receipt_reference,
      status, lifecycle_stage, material, material_origin, condition, shape,
      size_min_mm, size_max_mm, color, color_range_max, clarity, clarity_range_max,
      treatment, fluorescence, origin_country,
      original_pieces, current_pieces, original_weight_ct, current_weight_ct,
      purchase_rate, pricing_unit, landed_cost, current_avg_cost, currency,
      site, vault, bin_location, custodian, owner, legal_entity,
      screening_status, created_by, notes
    ) VALUES (
      @id, @parcel_number, @vendor_parcel_number, @po_number, @receipt_reference,
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
    po_number: d.po_number || null,
    receipt_reference: d.receipt_reference || null,
    material: d.material, material_origin: d.material_origin || 'natural',
    condition: d.condition || 'polished', shape: d.shape || null,
    size_min_mm: d.size_min_mm || null, size_max_mm: d.size_max_mm || null,
    color: d.color || null, color_range_max: d.color_range_max || null,
    clarity: d.clarity || null, clarity_range_max: d.clarity_range_max || null,
    treatment: d.treatment || 'none', fluorescence: d.fluorescence || 'none',
    origin_country: d.origin_country || null,
    original_pieces: d.original_pieces || 0,
    original_weight_ct: d.original_weight_ct || 0,
    purchase_rate: d.purchase_rate || 0,
    pricing_unit: d.pricing_unit || 'per_carat',
    landed_cost: d.landed_cost || cost,
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
    ref: d.receipt_reference || null, doc: d.po_number || null,
    pieces: d.original_pieces || 0, weight: d.original_weight_ct || 0,
    cost: d.landed_cost || cost,
    loc: [d.vault, d.bin_location].filter(Boolean).join(' / ') || null,
    cust: d.custodian || null, date: today(),
    by: d.created_by || 'uat_user', notes: d.notes || null,
  });

  res.status(201).json({ id, parcel_number: num });
});

// ─────────────────────────────────────────────────────────────────────────────
// Split
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/split', (req, res) => {
  const db  = getDb();
  const src = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Source parcel not found' });
  if (src.status !== 'active') return res.status(400).json({ error: 'Parcel is not active' });

  const splits = req.body.splits; // [{pieces, weight_ct, site, vault, bin_location, notes}]
  if (!splits || splits.length < 1) return res.status(400).json({ error: 'Provide at least one split' });

  const totalPieces = splits.reduce((s, x) => s + (x.pieces || 0), 0);
  const totalWeight = +splits.reduce((s, x) => s + (x.weight_ct || 0), 0).toFixed(4);

  if (totalPieces > src.current_pieces)      return res.status(400).json({ error: 'Split pieces exceed available' });
  if (totalWeight > src.current_weight_ct + 0.0001) return res.status(400).json({ error: 'Split weight exceeds available' });

  const refNum = `SPLIT-${Date.now()}`;
  const childIds = [];

  // Count existing children to get the right letter suffix
  const existingChildren = db.prepare('SELECT COUNT(*) AS cnt FROM parcel_relationships WHERE parent_parcel_id = ?').get(src.id);
  const childOffset = (existingChildren?.cnt || 0);

  db.transaction(() => {
    for (const s of splits) {
      const childId  = uuidv4();
      const suffix   = String.fromCharCode(65 + childOffset + childIds.length);
      const childNum = `${src.parcel_number}-${suffix}-${Date.now().toString(36).slice(-4)}`;
      const costAlloc = src.current_weight_ct > 0
        ? +(src.current_avg_cost * (s.weight_ct / src.current_weight_ct)).toFixed(2)
        : 0;

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
        VALUES (@par, @chi, 'split', @p, @w, @c, 'proportional_weight', @n)
      `).run({ par: src.id, chi: childId, p: s.pieces || 0, w: s.weight_ct || 0, c: costAlloc, n: s.notes || null });

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
    const costReduced = +(src.current_avg_cost * (totalWeight / src.current_weight_ct)).toFixed(2);

    db.prepare(`
      UPDATE parcels SET
        current_pieces = @p, current_weight_ct = @w,
        current_avg_cost = current_avg_cost - @c,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ p: newPieces, w: newWeight, c: costReduced, id: src.id });

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
      notes: `Split into ${splits.length} child parcel(s)`,
    });
  })();

  res.json({ message: 'Split successful', children: childIds });
});

// ─────────────────────────────────────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/merge', (req, res) => {
  const db = getDb();
  const { source_ids, target_parcel_number, created_by } = req.body;
  if (!source_ids || source_ids.length < 2) return res.status(400).json({ error: 'Provide at least 2 source parcels' });

  const sources = source_ids.map(id => db.prepare('SELECT * FROM parcels WHERE id = ?').get(id));
  if (sources.some(s => !s))        return res.status(404).json({ error: 'One or more source parcels not found' });
  if (sources.some(s => s.status !== 'active')) return res.status(400).json({ error: 'All source parcels must be active' });

  // Basic compatibility: same material origin
  const origins = [...new Set(sources.map(s => s.material_origin))];
  if (origins.length > 1) return res.status(400).json({ error: 'Cannot merge natural and lab-grown material' });

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
});

// ─────────────────────────────────────────────────────────────────────────────
// Transfer
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/transfer', (req, res) => {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

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
});

// ─────────────────────────────────────────────────────────────────────────────
// Manufacturing Issue
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/issue', (req, res) => {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

  const { pieces, weight_ct, work_order, notes, created_by } = req.body;
  const avail = available(p);
  if (pieces > avail.pieces) return res.status(400).json({ error: 'Insufficient available pieces' });
  if (weight_ct > avail.weight + 0.0001) return res.status(400).json({ error: 'Insufficient available weight' });

  const costMoved = +(p.current_avg_cost * (weight_ct / p.current_weight_ct)).toFixed(2);

  db.prepare(`
    UPDATE parcels SET
      wip_pieces = wip_pieces + @p,
      wip_weight_ct = wip_weight_ct + @w,
      lifecycle_stage = CASE WHEN current_pieces - reserved_pieces - memo_pieces - wip_pieces - @p <= 0 THEN 'in_production' ELSE lifecycle_stage END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ p: pieces, w: weight_ct, id: p.id });

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
    dp: -pieces, dw: -weight_ct, dc: -costMoved,
    lf: [p.vault, p.bin_location].filter(Boolean).join(' / ') || null,
    cf: p.custodian, date: today(), by: created_by || 'uat_user',
    notes: notes || `Issued to ${work_order || 'production'}`,
  });

  res.json({ message: 'Issue recorded', cost_moved: costMoved });
});

// ─────────────────────────────────────────────────────────────────────────────
// Manufacturing Return
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/return', (req, res) => {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

  const { pieces, weight_ct, broken_pieces, lost_pieces, work_order, notes, created_by } = req.body;
  const returned = pieces || 0;
  const broken   = broken_pieces || 0;
  const lost     = lost_pieces || 0;

  if (returned + broken + lost > p.wip_pieces) return res.status(400).json({ error: 'Return exceeds WIP quantity' });

  const consumed = p.wip_pieces - returned - broken - lost;

  db.prepare(`
    UPDATE parcels SET
      wip_pieces = wip_pieces - @total,
      wip_weight_ct = wip_weight_ct - @w,
      damaged_pieces = damaged_pieces + @broken,
      current_pieces = current_pieces - @consumed - @broken - @lost,
      current_weight_ct = ROUND(current_weight_ct - @w, 4),
      lifecycle_stage = 'available',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ total: returned + broken + lost, w: weight_ct || 0, broken, lost, consumed, id: p.id });

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
    dp: returned - p.wip_pieces,
    dw: -(weight_ct || 0),
    ap: p.current_pieces + returned - p.wip_pieces,
    aw: +(p.current_weight_ct - (weight_ct || 0)).toFixed(4),
    date: today(), by: created_by || 'uat_user',
    notes: notes || `Returned ${returned} pcs, broken: ${broken}, lost: ${lost}`,
  });

  res.json({ message: 'Return recorded', returned, broken, lost, consumed });
});

// ─────────────────────────────────────────────────────────────────────────────
// Memo Issue
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/memo', (req, res) => {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

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
});

// ─────────────────────────────────────────────────────────────────────────────
// Memo Return
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/memo-return', (req, res) => {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

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
});

// ─────────────────────────────────────────────────────────────────────────────
// Count / Weight Adjustment
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/parcels/:id/adjust', (req, res) => {
  const db = getDb();
  const p  = db.prepare('SELECT * FROM parcels WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

  const { new_pieces, new_weight_ct, reason, approved_by, notes, created_by } = req.body;
  if (new_pieces === undefined && new_weight_ct === undefined) return res.status(400).json({ error: 'Provide new_pieces or new_weight_ct' });

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

// Lookup fields (for dropdowns)
app.get('/api/meta/materials', (_req, res) => res.json(['natural_diamond','lab_diamond','ruby','sapphire','emerald','alexandrite','pearl','opal','spinel','tanzanite','tourmaline','bead','finding','scrap','unknown']));
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
