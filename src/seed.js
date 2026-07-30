'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb, initDb } = require('./database');

const TODAY = new Date().toISOString().split('T')[0];

const PARCELS = [
  // ── Natural round diamonds – the flagship example from the spec ────────────
  {
    id: 'p-001',
    parcel_number: 'DP-000184',
    vendor_parcel_number: 'VND-RD-8821',
    po_number: 'PO-2024-0041',
    receipt_reference: 'GRN-2024-0089',
    status: 'active',
    lifecycle_stage: 'available',
    material: 'natural_diamond',
    material_origin: 'natural',
    condition: 'polished',
    shape: 'Round Brilliant',
    size_min_mm: 2.0, size_max_mm: 2.2,
    color: 'G', color_range_max: 'H',
    clarity: 'SI1', clarity_range_max: 'SI2',
    treatment: 'none',
    fluorescence: 'none',
    origin_country: 'Botswana',
    assortment_grade: 'commercial',
    // Original receipt was 525 / 18.42 ct; 200 pcs / 7.02 ct already split to DP-000184-A
    original_pieces: 525, current_pieces: 325,
    reserved_pieces: 0, memo_pieces: 0, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 18.42, current_weight_ct: 11.40,
    reserved_weight_ct: 0, memo_weight_ct: 0, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 610, pricing_unit: 'per_carat',
    landed_cost: 11236.20, current_avg_cost: 6954.00,
    currency: 'USD',
    site: 'Main Office', vault: 'Vault A', bin_location: 'Tray-14-B',
    custodian: 'Alice Chen', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'screened',
    kimberley_cert: 'KP-2024-BW-00441',
    responsible_source: 'RJC certified',
    created_by: 'admin',
    notes: 'GIA melee screened batch – all natural confirmed',
  },

  // ── Lab-grown round diamonds ───────────────────────────────────────────────
  {
    id: 'p-002',
    parcel_number: 'DP-000211',
    vendor_parcel_number: 'LGD-RT-0042',
    po_number: 'PO-2024-0067',
    status: 'active',
    lifecycle_stage: 'available',
    material: 'lab_diamond',
    material_origin: 'lab_grown',
    condition: 'polished',
    shape: 'Round Brilliant',
    size_min_mm: 1.7, size_max_mm: 1.9,
    color: 'E', color_range_max: 'F',
    clarity: 'VS1', clarity_range_max: 'VS2',
    treatment: 'none',
    fluorescence: 'none',
    original_pieces: 800, current_pieces: 640,
    reserved_pieces: 80, memo_pieces: 0, wip_pieces: 80, damaged_pieces: 0,
    original_weight_ct: 22.40, current_weight_ct: 17.92,
    reserved_weight_ct: 2.24, memo_weight_ct: 0, wip_weight_ct: 2.24, damaged_weight_ct: 0,
    purchase_rate: 290, pricing_unit: 'per_carat',
    landed_cost: 6496.00, current_avg_cost: 5196.80,
    currency: 'USD',
    site: 'Main Office', vault: 'Vault A', bin_location: 'Tray-15-C',
    custodian: 'Alice Chen', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'screened',
    responsible_source: 'Manufacturer COO',
    created_by: 'admin',
    notes: '160 pcs issued to Job WO-2024-0033 (tennis bracelet)',
  },

  // ── Blue sapphire parcel (range-grade) ────────────────────────────────────
  {
    id: 'p-003',
    parcel_number: 'SP-000072',
    vendor_parcel_number: 'GF-SAP-KH-114',
    po_number: 'PO-2024-0022',
    status: 'active',
    lifecycle_stage: 'available',
    material: 'sapphire',
    material_origin: 'natural',
    condition: 'polished',
    shape: 'Oval',
    size_min_mm: 5.0, size_max_mm: 6.0,
    color: 'Royal Blue', color_range_max: 'Cornflower Blue',
    clarity: 'Eye Clean',
    treatment: 'heat',
    origin_country: 'Sri Lanka',
    assortment_grade: 'commercial',
    original_pieces: 48, current_pieces: 48,
    reserved_pieces: 6, memo_pieces: 0, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 62.40, current_weight_ct: 62.40,
    reserved_weight_ct: 7.80, memo_weight_ct: 0, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 320, pricing_unit: 'per_carat',
    landed_cost: 19968.00, current_avg_cost: 19968.00,
    currency: 'USD',
    site: 'Main Office', vault: 'Vault B', bin_location: 'Box-07-A',
    custodian: 'Bob Sharma', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'certified',
    responsible_source: 'Ethical supply chain',
    created_by: 'admin',
    notes: 'Heat treated, origin confirmed by GRS certificates',
  },

  // ── Colombian emerald parcel ───────────────────────────────────────────────
  {
    id: 'p-004',
    parcel_number: 'EM-000031',
    vendor_parcel_number: 'COL-EM-2024-007',
    po_number: 'PO-2024-0018',
    status: 'active',
    lifecycle_stage: 'available',
    material: 'emerald',
    material_origin: 'natural',
    condition: 'polished',
    shape: 'Emerald Cut',
    size_min_mm: 6.0, size_max_mm: 8.0,
    color: 'Vivid Green',
    clarity: 'Minor Inclusions',
    treatment: 'oil',
    origin_country: 'Colombia',
    original_pieces: 12, current_pieces: 10,
    reserved_pieces: 0, memo_pieces: 2, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 28.80, current_weight_ct: 24.00,
    reserved_weight_ct: 0, memo_weight_ct: 4.80, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 1200, pricing_unit: 'per_carat',
    landed_cost: 34560.00, current_avg_cost: 28800.00,
    currency: 'USD',
    site: 'Main Office', vault: 'Vault B', bin_location: 'Box-03-C',
    custodian: 'Bob Sharma', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'certified',
    responsible_source: 'Gemfields sourced',
    created_by: 'admin',
    notes: '2 pcs on memo with Diamond District NY – expires 2024-03-15',
  },

  // ── Vendor memo/consignment – natural pink diamonds ────────────────────────
  {
    id: 'p-005',
    parcel_number: 'PD-000009',
    vendor_parcel_number: 'VEND-MEMO-PD-88',
    status: 'active',
    lifecycle_stage: 'on_memo',
    material: 'natural_diamond',
    material_origin: 'natural',
    condition: 'polished',
    shape: 'Pear',
    size_min_mm: 3.5, size_max_mm: 4.5,
    color: 'Fancy Pink',
    clarity: 'VS2',
    treatment: 'none',
    origin_country: 'Australia',
    original_pieces: 5, current_pieces: 5,
    reserved_pieces: 0, memo_pieces: 5, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 7.25, current_weight_ct: 7.25,
    reserved_weight_ct: 0, memo_weight_ct: 7.25, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 8500, pricing_unit: 'per_carat',
    landed_cost: 0, current_avg_cost: 0,
    currency: 'USD',
    site: 'Main Office', vault: 'Vault A', bin_location: 'Memo-Tray-1',
    custodian: 'Alice Chen', owner: 'Vendor', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'certified',
    created_by: 'admin',
    notes: 'On vendor memo from Argyle Traders – due 2024-04-01. Not company-owned.',
  },

  // ── Pearl parcel ──────────────────────────────────────────────────────────
  {
    id: 'p-006',
    parcel_number: 'PL-000018',
    vendor_parcel_number: 'PEARL-AK-2024-03',
    po_number: 'PO-2024-0031',
    status: 'active',
    lifecycle_stage: 'available',
    material: 'pearl',
    material_origin: 'natural',
    condition: 'polished',
    shape: 'Round',
    size_min_mm: 7.0, size_max_mm: 7.5,
    color: 'White/Rose Overtone',
    treatment: 'none',
    origin_country: 'Japan',
    original_pieces: 200, current_pieces: 200,
    reserved_pieces: 0, memo_pieces: 0, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 0, current_weight_ct: 0,
    reserved_weight_ct: 0, memo_weight_ct: 0, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 45, pricing_unit: 'per_piece',
    landed_cost: 9000.00, current_avg_cost: 9000.00,
    currency: 'USD',
    site: 'Main Office', vault: 'Vault C', bin_location: 'Pearl-Box-2',
    custodian: 'Carol White', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'not_required',
    created_by: 'admin',
    notes: 'Akoya cultured pearls – 200 piece matched strand lot',
  },

  // ── Quarantined parcel (unknown/mixed) ────────────────────────────────────
  {
    id: 'p-007',
    parcel_number: 'QR-000003',
    status: 'active',
    lifecycle_stage: 'quarantined',
    material: 'unknown',
    material_origin: 'unknown',
    condition: 'polished',
    shape: 'Round Brilliant',
    size_min_mm: 1.8, size_max_mm: 2.0,
    color: 'F', color_range_max: 'G',
    original_pieces: 120, current_pieces: 120,
    reserved_pieces: 0, memo_pieces: 0, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 3.00, current_weight_ct: 3.00,
    reserved_weight_ct: 0, memo_weight_ct: 0, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 0, pricing_unit: 'per_carat',
    landed_cost: 0, current_avg_cost: 0,
    currency: 'USD',
    site: 'Main Office', vault: 'Quarantine', bin_location: 'QBOX-01',
    custodian: 'QC Lab', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'pending',
    created_by: 'admin',
    notes: 'Found mixed in return parcel – natural/lab-grown identity unknown. Pending GIA screening.',
  },

  // ── Child parcel – split of DP-000184 already done ────────────────────────
  {
    id: 'p-008',
    parcel_number: 'DP-000184-A',
    parent_parcel_id: 'p-001',
    root_parcel_id: 'p-001',
    status: 'active',
    lifecycle_stage: 'available',
    material: 'natural_diamond',
    material_origin: 'natural',
    condition: 'polished',
    shape: 'Round Brilliant',
    size_min_mm: 2.0, size_max_mm: 2.2,
    color: 'G', color_range_max: 'H',
    clarity: 'SI1', clarity_range_max: 'SI2',
    treatment: 'none',
    fluorescence: 'none',
    origin_country: 'Botswana',
    assortment_grade: 'commercial',
    original_pieces: 200, current_pieces: 200,
    reserved_pieces: 0, memo_pieces: 0, wip_pieces: 0, damaged_pieces: 0,
    original_weight_ct: 7.02, current_weight_ct: 7.02,
    reserved_weight_ct: 0, memo_weight_ct: 0, wip_weight_ct: 0, damaged_weight_ct: 0,
    purchase_rate: 610, pricing_unit: 'per_carat',
    landed_cost: 4282.20, current_avg_cost: 4282.20,
    currency: 'USD',
    site: 'Retail Store 1', vault: 'Store Safe', bin_location: 'Tray-02',
    custodian: 'Dan Lee', owner: 'Company', legal_entity: 'Jewels Co. Ltd.',
    screening_status: 'screened',
    created_by: 'admin',
    notes: 'Split from DP-000184 for Retail Store 1 allocation',
  },
];

const CERTIFICATES = [
  { parcel_id: 'p-001', cert_type: 'screening', cert_number: 'GIA-ML-2024-18821', issued_by: 'GIA', issued_date: '2024-01-10', is_valid: 1, notes: 'Full melee batch screened – all natural' },
  { parcel_id: 'p-003', cert_type: 'origin',    cert_number: 'GRS-2024-0078421',  issued_by: 'GRS', issued_date: '2024-01-20', is_valid: 1, notes: 'Ceylon origin confirmed, heat treated' },
  { parcel_id: 'p-004', cert_type: 'origin',    cert_number: 'GRS-2024-0041290',  issued_by: 'GRS', issued_date: '2023-12-05', is_valid: 1, notes: 'Colombian origin, minor oil treatment' },
  { parcel_id: 'p-005', cert_type: 'gia',        cert_number: 'GIA-7401123841',    issued_by: 'GIA', issued_date: '2023-11-22', is_valid: 1, notes: 'Fancy Pink Natural – individual report' },
  { parcel_id: 'p-008', cert_type: 'screening', cert_number: 'GIA-ML-2024-18821', issued_by: 'GIA', issued_date: '2024-01-10', is_valid: 1, notes: 'Inherits from parent DP-000184' },
];

const TRANSACTIONS = [
  // Receipt of DP-000184
  {
    id: uuidv4(), parcel_id: 'p-001', transaction_type: 'receipt',
    reference_number: 'GRN-2024-0089', related_document: 'PO-2024-0041',
    before_pieces: 0, before_weight_ct: 0,
    pieces_delta: 525, weight_delta_ct: 18.42, cost_delta: 11236.20,
    after_pieces: 525, after_weight_ct: 18.42,
    location_to: 'Vault A / Tray-14-B', custodian_to: 'Alice Chen',
    physical_date: '2024-01-08', document_date: '2024-01-08', posting_date: '2024-01-08',
    created_by: 'admin', reason_code: 'PURCHASE', notes: 'Initial receipt from vendor',
  },
  // Receipt of lab diamond
  {
    id: uuidv4(), parcel_id: 'p-002', transaction_type: 'receipt',
    reference_number: 'GRN-2024-0104',
    before_pieces: 0, before_weight_ct: 0,
    pieces_delta: 800, weight_delta_ct: 22.40, cost_delta: 6496.00,
    after_pieces: 800, after_weight_ct: 22.40,
    location_to: 'Vault A / Tray-15-C', custodian_to: 'Alice Chen',
    physical_date: '2024-01-15', document_date: '2024-01-15', posting_date: '2024-01-15',
    created_by: 'admin', reason_code: 'PURCHASE',
  },
  // Issue from lab diamond to production
  {
    id: uuidv4(), parcel_id: 'p-002', transaction_type: 'manufacturing_issue',
    reference_number: 'WO-2024-0033',
    before_pieces: 800, before_weight_ct: 22.40,
    pieces_delta: -160, weight_delta_ct: -4.48, cost_delta: -1299.20,
    after_pieces: 640, after_weight_ct: 17.92,
    location_from: 'Vault A / Tray-15-C', location_to: 'Production Floor',
    custodian_from: 'Alice Chen', custodian_to: 'Production Team',
    physical_date: '2024-01-22', document_date: '2024-01-22', posting_date: '2024-01-22',
    created_by: 'admin', reason_code: 'PRODUCTION', notes: 'Tennis bracelet batch WO-2024-0033',
  },
  // Memo issue for emerald
  {
    id: uuidv4(), parcel_id: 'p-004', transaction_type: 'memo_issue',
    reference_number: 'MEMO-2024-0012',
    before_pieces: 12, before_weight_ct: 28.80,
    pieces_delta: -2, weight_delta_ct: -4.80, cost_delta: 0,
    after_pieces: 10, after_weight_ct: 24.00,
    location_from: 'Vault B / Box-03-C', location_to: 'Diamond District NY',
    custodian_from: 'Bob Sharma', custodian_to: 'Customer: NY Jewelers',
    physical_date: '2024-02-01', document_date: '2024-02-01', posting_date: '2024-02-01',
    created_by: 'admin', reason_code: 'MEMO', notes: 'Memo to Diamond District NY – 30 days',
  },
  // Split from DP-000184
  {
    id: uuidv4(), parcel_id: 'p-001', transaction_type: 'split',
    reference_number: 'SPLIT-2024-0001', related_parcel_id: 'p-008',
    before_pieces: 525, before_weight_ct: 18.42,
    pieces_delta: -200, weight_delta_ct: -7.02, cost_delta: -4282.20,
    after_pieces: 325, after_weight_ct: 11.40,
    physical_date: '2024-01-18', document_date: '2024-01-18', posting_date: '2024-01-18',
    created_by: 'admin', reason_code: 'SPLIT', notes: 'Allocating 200 pcs to Retail Store 1',
  },
  // Receipt of child split parcel
  {
    id: uuidv4(), parcel_id: 'p-008', transaction_type: 'opening_balance',
    reference_number: 'SPLIT-2024-0001', related_parcel_id: 'p-001',
    before_pieces: 0, before_weight_ct: 0,
    pieces_delta: 200, weight_delta_ct: 7.02, cost_delta: 4282.20,
    after_pieces: 200, after_weight_ct: 7.02,
    location_to: 'Store Safe / Tray-02', custodian_to: 'Dan Lee',
    physical_date: '2024-01-18', document_date: '2024-01-18', posting_date: '2024-01-18',
    created_by: 'admin', reason_code: 'SPLIT_RECEIVE', notes: 'Created by split from DP-000184',
  },
];

const RELATIONSHIPS = [
  {
    parent_parcel_id: 'p-001',
    child_parcel_id: 'p-008',
    relationship_type: 'split',
    pieces_moved: 200,
    weight_moved_ct: 7.02,
    cost_allocated: 4282.20,
    allocation_method: 'proportional_weight',
    notes: 'Partial split for Retail Store 1',
  },
];

async function run() {
  await initDb();
  const db = getDb();

  console.log('Clearing existing data…');
  db.prepare('DELETE FROM parcel_certificates').run();
  db.prepare('DELETE FROM parcel_reservations').run();
  db.prepare('DELETE FROM parcel_transactions').run();
  db.prepare('DELETE FROM parcel_relationships').run();
  db.prepare('DELETE FROM parcels').run();

  console.log('Inserting parcels…');
  const insertParcel = db.prepare(`
    INSERT INTO parcels (
      id, parcel_number, parent_parcel_id, root_parcel_id,
      vendor_parcel_number, po_number, receipt_reference,
      status, lifecycle_stage,
      material, material_origin, condition, shape,
      size_min_mm, size_max_mm, color, color_range_max,
      clarity, clarity_range_max, treatment, fluorescence,
      origin_country, assortment_grade,
      original_pieces, current_pieces, reserved_pieces,
      memo_pieces, wip_pieces, damaged_pieces,
      original_weight_ct, current_weight_ct, reserved_weight_ct,
      memo_weight_ct, wip_weight_ct, damaged_weight_ct,
      purchase_rate, pricing_unit, landed_cost, current_avg_cost, currency,
      site, vault, bin_location, custodian, owner, legal_entity,
      screening_status, kimberley_cert, responsible_source,
      created_by, notes
    ) VALUES (
      @id, @parcel_number, @parent_parcel_id, @root_parcel_id,
      @vendor_parcel_number, @po_number, @receipt_reference,
      @status, @lifecycle_stage,
      @material, @material_origin, @condition, @shape,
      @size_min_mm, @size_max_mm, @color, @color_range_max,
      @clarity, @clarity_range_max, @treatment, @fluorescence,
      @origin_country, @assortment_grade,
      @original_pieces, @current_pieces, @reserved_pieces,
      @memo_pieces, @wip_pieces, @damaged_pieces,
      @original_weight_ct, @current_weight_ct, @reserved_weight_ct,
      @memo_weight_ct, @wip_weight_ct, @damaged_weight_ct,
      @purchase_rate, @pricing_unit, @landed_cost, @current_avg_cost, @currency,
      @site, @vault, @bin_location, @custodian, @owner, @legal_entity,
      @screening_status, @kimberley_cert, @responsible_source,
      @created_by, @notes
    )
  `);

  for (const p of PARCELS) {
    insertParcel.run({
      parent_parcel_id: null, root_parcel_id: null,
      vendor_parcel_number: null, po_number: null, receipt_reference: null,
      size_min_mm: null, size_max_mm: null,
      color_range_max: null, clarity_range_max: null,
      fluorescence: 'none', origin_country: null, assortment_grade: null,
      kimberley_cert: null, responsible_source: null,
      notes: null,
      ...p,
    });
  }

  console.log('Inserting transactions…');
  const insertTxn = db.prepare(`
    INSERT INTO parcel_transactions (
      id, parcel_id, transaction_type, reference_number,
      related_parcel_id, related_document,
      before_pieces, before_weight_ct, pieces_delta, weight_delta_ct, cost_delta,
      after_pieces, after_weight_ct,
      location_from, location_to, custodian_from, custodian_to,
      physical_date, document_date, posting_date,
      created_by, approved_by, reason_code, notes
    ) VALUES (
      @id, @parcel_id, @transaction_type, @reference_number,
      @related_parcel_id, @related_document,
      @before_pieces, @before_weight_ct, @pieces_delta, @weight_delta_ct, @cost_delta,
      @after_pieces, @after_weight_ct,
      @location_from, @location_to, @custodian_from, @custodian_to,
      @physical_date, @document_date, @posting_date,
      @created_by, @approved_by, @reason_code, @notes
    )
  `);

  for (const t of TRANSACTIONS) {
    insertTxn.run({
      related_parcel_id: null, related_document: null,
      document_date: null,
      location_from: null, location_to: null,
      custodian_from: null, custodian_to: null,
      approved_by: null, reason_code: null, notes: null,
      ...t,
    });
  }

  console.log('Inserting relationships…');
  const insertRel = db.prepare(`
    INSERT INTO parcel_relationships
      (parent_parcel_id, child_parcel_id, relationship_type,
       pieces_moved, weight_moved_ct, cost_allocated, allocation_method, notes)
    VALUES
      (@parent_parcel_id, @child_parcel_id, @relationship_type,
       @pieces_moved, @weight_moved_ct, @cost_allocated, @allocation_method, @notes)
  `);

  for (const r of RELATIONSHIPS) {
    insertRel.run({ notes: null, ...r });
  }

  console.log('Inserting certificates…');
  const insertCert = db.prepare(`
    INSERT INTO parcel_certificates
      (parcel_id, cert_type, cert_number, issued_by, issued_date, is_valid, notes)
    VALUES
      (@parcel_id, @cert_type, @cert_number, @issued_by, @issued_date, @is_valid, @notes)
  `);
  for (const c of CERTIFICATES) {
    insertCert.run({ notes: null, ...c });
  }

  console.log(`✅  Seed complete: ${PARCELS.length} parcels, ${TRANSACTIONS.length} transactions`);
}

run().catch(err => { console.error(err); process.exit(1); });
