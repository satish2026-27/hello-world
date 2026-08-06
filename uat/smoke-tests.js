'use strict';

/**
 * API smoke tests for the Jewelry Parcel UAT environment.
 * Requires the server to be running on PORT (default 3000).
 *
 * Usage: npm run test:smoke
 */

const BASE = process.env.UAT_BASE || 'http://localhost:3000';

let passed = 0;
let failed = 0;
const failures = [];

async function req(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: r.status, data };
}

function assert(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function reset() {
  const r = await req('POST', '/api/uat/reset');
  assert('UAT reset succeeds', r.status === 200, JSON.stringify(r.data));
}

async function run() {
  console.log(`\n🧪 Parcel UAT smoke tests → ${BASE}\n`);

  // Health
  {
    const r = await req('GET', '/api/dashboard');
    assert('Dashboard responds', r.status === 200);
    assert('Seed has parcels', r.data.stats?.total_parcels >= 8, `got ${r.data.stats?.total_parcels}`);
  }

  await reset();

  // Fetch seed parcels
  const list = await req('GET', '/api/parcels');
  assert('List parcels', list.status === 200 && list.data.length >= 8);
  const byNum = Object.fromEntries(list.data.map(p => [p.parcel_number, p]));

  const dp184 = byNum['DP-000184'];
  assert('DP-000184 balance after seed split is 325 pcs', dp184?.current_pieces === 325, `got ${dp184?.current_pieces}`);
  assert('DP-000184 weight is 11.40 ct', Math.abs(dp184?.current_weight_ct - 11.4) < 0.001, `got ${dp184?.current_weight_ct}`);

  // UAT-01 Receive
  {
    const r = await req('POST', '/api/parcels', {
      parcel_number: 'DP-SMOKE-001',
      vendor: 'RUCHI DIAMONDS',
      invoice_number: 'INV-SMOKE-001',
      material: 'natural_diamond', material_origin: 'natural',
      shape: 'Round Brilliant', size_min_mm: 2.0, size_max_mm: 2.2,
      color: 'G', color_range_max: 'H', clarity: 'SI1', clarity_range_max: 'SI2',
      treatment: 'none', screening_status: 'screened',
      original_pieces: 100, original_weight_ct: 3.5,
      purchase_rate: 600, pricing_unit: 'per_carat',
      vault: 'Vault A', bin_location: 'Tray-20-A', custodian: 'Alice Chen',
    });
    assert('Receive creates parcel', r.status === 201, JSON.stringify(r.data));
    const d = await req('GET', `/api/parcels/${r.data.id}`);
    assert('Receipt landed cost = 2100', Math.abs(d.data.landed_cost - 2100) < 0.01, `got ${d.data.landed_cost}`);
    assert('Vendor stored', d.data.vendor === 'RUCHI DIAMONDS');
    assert('Invoice stored', d.data.invoice_number === 'INV-SMOKE-001');
    const tx = await req('GET', `/api/parcels/${r.data.id}/transactions`);
    assert('Receipt ledger entry exists', tx.data.some(t => t.transaction_type === 'receipt'));
  }

  // Invoice/memo rule
  {
    const r = await req('POST', '/api/parcels', {
      parcel_number: 'DP-SMOKE-NODOC',
      vendor: 'KASPHUL LLC',
      material: 'sapphire', material_origin: 'natural',
      original_pieces: 5, original_weight_ct: 2.0, purchase_rate: 100,
    });
    assert('Receive without invoice/memo rejected', r.status === 400 && /invoice|memo/i.test(r.data.error), JSON.stringify(r.data));
  }

  // Materials catalog size
  {
    const r = await req('GET', '/api/meta/materials');
    assert('Materials catalog is searchable size', r.status === 200 && r.data.length >= 150, `got ${r.data?.length}`);
    const v = await req('GET', '/api/meta/vendors');
    assert('Vendors list has 7 entries', v.status === 200 && v.data.length === 7, `got ${v.data?.length}`);
  }

  // UAT-02 Split
  {
    const r = await req('POST', `/api/parcels/${dp184.id}/split`, {
      splits: [
        { pieces: 150, weight_ct: 5.27, bin_location: 'Retail-Tray-A' },
        { pieces: 100, weight_ct: 3.52, bin_location: 'Retail-Tray-B' },
      ],
    });
    assert('Split succeeds', r.status === 200, JSON.stringify(r.data));
    assert('Split creates 2 children', r.data.children?.length === 2);
    const parent = await req('GET', `/api/parcels/${dp184.id}`);
    assert('Parent reduced by 250 pcs', parent.data.current_pieces === 75, `got ${parent.data.current_pieces}`);
  }

  // UAT-03 Merge reject natural + lab
  {
    const fresh = await req('GET', '/api/parcels');
    const natural = fresh.data.find(p => p.material_origin === 'natural' && p.lifecycle_stage === 'available' && p.memo_pieces === 0 && p.wip_pieces === 0 && p.reserved_pieces === 0);
    const lab = fresh.data.find(p => p.parcel_number === 'DP-000211');
    const r = await req('POST', '/api/parcels/merge', {
      source_ids: [natural.id, lab.id],
      target_parcel_number: 'BAD-MERGE',
    });
    assert('Reject natural+lab merge', r.status === 400 && /natural and lab-grown/i.test(r.data.error), JSON.stringify(r.data));
  }

  // UAT-08 Quarantine blocks issue
  {
    const qr = byNum['QR-000003'];
    const r = await req('POST', `/api/parcels/${qr.id}/issue`, {
      pieces: 10, weight_ct: 0.25, work_order: 'WO-BLOCK',
    });
    assert('Quarantine blocks manufacturing issue', r.status === 400 && /quarantin/i.test(r.data.error), JSON.stringify(r.data));
  }

  // UAT-04 Issue + return with breakage
  {
    await reset();
    const lab = (await req('GET', '/api/parcels')).data.find(p => p.parcel_number === 'DP-000211');
    const beforeWip = lab.wip_pieces;
    const iss = await req('POST', `/api/parcels/${lab.id}/issue`, {
      pieces: 50, weight_ct: 1.4, work_order: 'WO-UAT-001',
    });
    assert('Manufacturing issue succeeds', iss.status === 200, JSON.stringify(iss.data));
    const mid = await req('GET', `/api/parcels/${lab.id}`);
    assert('WIP increased by 50', mid.data.wip_pieces === beforeWip + 50, `got ${mid.data.wip_pieces}`);

    const ret = await req('POST', `/api/parcels/${lab.id}/return`, {
      pieces: 45, weight_ct: 1.26, broken_pieces: 3, lost_pieces: 2, work_order: 'WO-UAT-001',
    });
    assert('Manufacturing return succeeds', ret.status === 200, JSON.stringify(ret.data));
    assert('Return reports broken=3 lost=2', ret.data.broken === 3 && ret.data.lost === 2);
    const after = await req('GET', `/api/parcels/${lab.id}`);
    assert('Damaged pieces increased by 3', after.data.damaged_pieces === lab.damaged_pieces + 3, `got ${after.data.damaged_pieces}`);
  }

  // Dual-unit independence
  {
    await reset();
    const recv = await req('POST', '/api/parcels', {
      parcel_number: 'DUAL-UNIT-001', material: 'natural_diamond', material_origin: 'natural',
      vendor: 'PALA INTERNATIONAL', memo_number: 'MEMO-DUAL-1',
      original_pieces: 10, original_weight_ct: 3.0, purchase_rate: 500, pricing_unit: 'per_carat',
      screening_status: 'screened',
    });
    const adj = await req('POST', `/api/parcels/${recv.data.id}/adjust`, {
      new_pieces: 9, approved_by: 'Manager A', reason: 'One stone removed unknown weight',
    });
    assert('Dual-unit adjust succeeds', adj.status === 200);
    const d = await req('GET', `/api/parcels/${recv.data.id}`);
    assert('Pieces changed independently', d.data.current_pieces === 9);
    assert('Weight unchanged after piece-only adjust', Math.abs(d.data.current_weight_ct - 3.0) < 0.0001, `got ${d.data.current_weight_ct}`);
  }

  // Adjust requires approval
  {
    const p = (await req('GET', '/api/parcels')).data.find(x => x.parcel_number === 'PL-000018');
    const r = await req('POST', `/api/parcels/${p.id}/adjust`, { new_pieces: 199 });
    assert('Adjust without approver rejected', r.status === 400 && /approved_by/i.test(r.data.error));
  }

  // Disposition audit
  {
    await reset();
    const root = (await req('GET', '/api/parcels')).data.find(p => p.parcel_number === 'DP-000184');
    const r = await req('GET', `/api/parcels/${root.id}/disposition`);
    assert('Disposition report returns', r.status === 200);
    assert('Disposition includes child family', r.data.family?.length >= 2, `family ${r.data.family?.length}`);
    assert('Disposition summary has original pieces', r.data.summary?.original_pieces === 525);
  }

  // Immutable ledger — no DELETE
  {
    const p = (await req('GET', '/api/parcels')).data[0];
    const r = await req('DELETE', `/api/parcels/${p.id}/transactions`);
    assert('DELETE transactions not supported', r.status === 404 || r.status === 405);
  }

  // Pearl zero-weight issue
  {
    await reset();
    const pearl = (await req('GET', '/api/parcels')).data.find(p => p.parcel_number === 'PL-000018');
    const r = await req('POST', `/api/parcels/${pearl.id}/issue`, {
      pieces: 10, weight_ct: 0, work_order: 'WO-PEARL',
    });
    assert('Pearl zero-weight issue succeeds', r.status === 200, JSON.stringify(r.data));
  }

  // Quarantine release
  {
    await reset();
    const qr = (await req('GET', '/api/parcels')).data.find(p => p.parcel_number === 'QR-000003');
    const bad = await req('POST', `/api/parcels/${qr.id}/release-quarantine`, {
      material_origin: 'natural', approved_by: 'QC Lead',
    });
    // Wait - need approved_by AND material_origin - that should work
    assert('Quarantine release succeeds', bad.status === 200, JSON.stringify(bad.data));
    const after = await req('GET', `/api/parcels/${qr.id}`);
    assert('Released parcel is available', after.data.lifecycle_stage === 'available');
    assert('Origin resolved to natural', after.data.material_origin === 'natural');
  }

  console.log(`\n────────────────────────────`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.detail || ''}`));
  }
  console.log('');
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('Smoke test runner failed:', err);
  process.exit(1);
});
