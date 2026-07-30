# Jewelry Parcel Management — UAT Test Scenarios

This document lists all User Acceptance Testing (UAT) scenarios for the Jewelry Parcel Management ERP module.
Each scenario maps directly to a business rule described in the parcel management specification.

---

## How to Use This Document

1. Start the UAT server (`npm start`).
2. Seed sample data (`npm run seed`).
3. Open `http://localhost:3000` in your browser.
4. Work through each scenario, recording **Pass / Fail / Blocked** and any defect notes.

**Tester:** ___________________  
**Date:** ___________________  
**Environment:** UAT (localhost)  
**Build/Seed:** fresh seed

---

## Scenario Summary

| ID | Scenario | Area | Result | Defect # |
|----|----------|------|--------|----------|
| UAT-01 | Receive new natural diamond parcel | Receipt | | |
| UAT-02 | Split parcel into children | Split | | |
| UAT-03 | Merge compatible parcels; reject incompatible | Merge | | |
| UAT-04 | Manufacturing issue and partial return with breakage | Production | | |
| UAT-05 | Memo issue and partial return | Memo | | |
| UAT-06 | Transfer parcel between vaults | Transfer | | |
| UAT-07 | Physical count adjustment with approval | Count | | |
| UAT-08 | Quarantined parcel visibility and restriction | Quarantine | | |
| UAT-09 | Vendor memo / consignment parcel ownership | Ownership | | |
| UAT-10 | Parcel genealogy trace | Genealogy | | |
| UAT-11 | Immutable ledger — no transaction deletion | Audit | | |
| UAT-12 | Pearl parcel: per-piece pricing, zero weight | Valuation | | |
| UAT-13 | Dual-unit discrepancy — weight differs from pieces | Data Integrity | | |
| UAT-14 | Lab-grown and natural contamination rejection | Compliance | | |
| UAT-15 | Dashboard portfolio value accuracy | Reporting | | |

---

## Detailed Scenarios

---

### UAT-01: Receive a New Natural Diamond Parcel

**Objective:** Verify the system creates a parcel with all required fields and logs an immutable receipt transaction.

**Pre-condition:** Fresh seed data loaded.

**Steps:**
1. Click **Receive** in the navigation bar.
2. Fill in:
   - Parcel # = `DP-TEST-001`
   - Material = `natural_diamond`, Origin = `natural`
   - Shape = `Round Brilliant`, Size = 2.0–2.2 mm
   - Color = `G`, Color Max = `H`, Clarity = `SI1`, Clarity Max = `SI2`
   - Treatment = `none`, Screening = `screened`
   - Pieces = `100`, Weight = `3.5000` ct
   - Purchase Rate = `600`, Pricing Unit = `per_carat`
   - Vault = `Vault A`, Bin = `Tray-20-A`, Custodian = `Alice Chen`
3. Click **Receive Parcel**.

**Expected Result:**
- System redirects to parcel detail for `DP-TEST-001`.
- `current_pieces` = 100, `current_weight_ct` = 3.5000.
- `lifecycle_stage` = `available`, `status` = `active`.
- Transaction Ledger shows one `receipt` entry: `pieces_delta` = +100, `weight_delta_ct` = +3.5000, `location_to` = "Vault A / Tray-20-A".
- `landed_cost` = 100 × 3.5 × 600 = $2,100 (per-carat pricing).

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-02: Split a Parcel Into Two Children

**Objective:** Verify split reduces parent balance, creates children with correct cost allocation, and records genealogy.

**Pre-condition:** Parcel `DP-000184` exists with ≥ 325 pcs.

**Steps:**
1. Open parcel `DP-000184`.
2. Click **Split**.
3. Add Split 1: Pieces = `150`, Weight = `5.2700` ct, Bin = `Retail-Tray-A`.
4. Add Split 2: Pieces = `100`, Weight = `3.5200` ct, Bin = `Retail-Tray-B`.
5. Click **Execute Split**.

**Expected Result:**
- Two child parcels created (`DP-000184-B`, `DP-000184-C` or similar suffix).
- Parent `DP-000184` balance reduces by 250 pcs and 8.79 ct.
- Genealogy section of parent shows both children.
- Each child shows parent `DP-000184` in its genealogy.
- Cost allocation proportional to weight: child A gets ~60% of moved cost, child B ~40%.
- Ledger: parent gets `split` transaction (negative delta), each child gets `opening_balance` (positive delta).

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-03: Merge Two Compatible Parcels; Reject Incompatible

**Objective:** Verify merge succeeds for same-origin parcels; correctly rejects natural + lab-grown combination.

**Pre-condition:** At least two `available` natural diamond parcels exist.

**Steps — Part A (valid merge):**
1. Open the Merge dialog.
2. Select `DP-000184-A` and another available natural diamond parcel.
3. Enter new parcel number `MERGE-TEST-001`.
4. Click **Execute Merge**.

**Expected (Part A):**
- New parcel `MERGE-TEST-001` created with combined pieces and weight.
- Source parcels status = `merged`, lifecycle_stage = `closed`.
- Each source shows a `merge` transaction in its ledger.

**Steps — Part B (invalid merge):**
1. Open Merge dialog.
2. Select `DP-000184` (natural) and `DP-000211` (lab-grown).
3. Click **Execute Merge**.

**Expected (Part B):**
- System rejects with error: *"Cannot merge natural and lab-grown material"*.
- No parcels are modified.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-04: Manufacturing Issue and Partial Return With Breakage

**Objective:** Verify WIP tracking, breakage/loss accounting, and correct balance reconstruction.

**Pre-condition:** Parcel `DP-000211` has available pieces.

**Steps:**
1. Open `DP-000211`.
2. Click **Issue to Manufacturing**: Pieces = `50`, Weight = `1.4000` ct, WO = `WO-UAT-001`.
3. Verify `wip_pieces` has increased by 50.
4. Click **Return**: Returned = `45`, Weight = `1.2600` ct, Broken = `3`, Lost = `2`, WO = `WO-UAT-001`.

**Expected Result:**
- After issue: `wip_pieces` increases by 50.
- After return: `wip_pieces` decreases by 50 (45 returned + 3 broken + 2 lost).
- `current_pieces` decreases by 5 (3 broken + 2 lost).
- `damaged_pieces` increases by 3.
- Ledger: `manufacturing_issue` (−50 pcs) then `manufacturing_return` entry showing pieces returned.
- Notes display: "returned 45 pcs, broken: 3, lost: 2".

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-05: Issue Emerald on Memo and Return Partial

**Objective:** Verify memo lifecycle tracks pieces correctly and available balance decreases while on memo.

**Pre-condition:** Parcel `EM-000031` has available emeralds.

**Steps:**
1. Open `EM-000031`.
2. Click **Memo**: Pieces = `2`, Weight = `4.80` ct, Customer = `Test Jewelers NYC`, Memo Ref = `MEMO-UAT-001`.
3. Verify `memo_pieces` increases by 2 and `available` decreases by 2.
4. Record a memo return of 1 piece (using Return option or adjust to test partial return).

**Expected Result:**
- `memo_pieces` = previously 2 + new 2 = 4 after step 2.
- Available pieces decreases accordingly.
- Transaction ledger shows `memo_issue` entry, `custodian_to` = "Test Jewelers NYC".
- Memo return (step 4) shows `memo_return` entry and restores available balance.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-06: Transfer Parcel Between Vaults

**Objective:** Verify physical relocation updates location fields without altering quantity or value.

**Pre-condition:** Any active parcel.

**Steps:**
1. Open any available parcel, note current pieces and weight.
2. Click **Transfer**.
3. Enter: Site = `Retail Store 2`, Vault = `Store Safe 2`, Bin = `Tray-05`, Custodian = `Eve Jones`, Reason = `Branch allocation`.
4. Click **Transfer**.

**Expected Result:**
- Location fields update to new values.
- `current_pieces` and `current_weight_ct` unchanged.
- Ledger shows `transfer` entry: `pieces_delta` = 0, `weight_delta_ct` = 0, `location_from` and `location_to` both populated.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-07: Physical Count Adjustment With Approval

**Objective:** Verify count corrections create auditable entries and preserve historical balance.

**Pre-condition:** Parcel `DP-000184` with known piece count.

**Steps:**
1. Open `DP-000184`, note current pieces (call it N).
2. Click **Adjust**.
3. Set new pieces = N − 5.
4. Enter: Reason = `Physical count shortage`, Approved By = `Manager A`, Notes = `5 stones missing after blind count`.
5. Click **Record Adjustment**.

**Expected Result:**
- `current_pieces` decreases by 5.
- Ledger shows `count_correction` entry: `pieces_delta` = −5, `approved_by` = "Manager A".
- `before_pieces` in the transaction preserves the previous count N.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-08: Quarantined Parcel Visibility

**Objective:** Verify quarantined parcels are clearly marked and restricted from normal operations.

**Pre-condition:** Parcel `QR-000003` exists in quarantined state.

**Steps:**
1. In Parcel List, filter by lifecycle_stage = `quarantined`.
2. Verify `QR-000003` appears.
3. Open parcel detail — note stage badge, screening status, and notes.
4. Attempt to issue stones from this parcel.

**Expected Result:**
- `QR-000003` appears with red `quarantined` badge.
- Screening status = `pending`.
- Notes indicate "natural/lab-grown identity unknown. Pending GIA screening."
- Issue operation proceeds (system records the action — note that full restriction enforcement would be added in production).

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-09: Vendor Memo / Consignment Ownership

**Objective:** Verify vendor-memo goods show correct owner and are not counted as company assets.

**Pre-condition:** Parcel `PD-000009` (vendor memo pink diamonds).

**Steps:**
1. Open `PD-000009`.
2. Verify Owner field = `Vendor`, lifecycle_stage = `on_memo`.
3. Verify `memo_pieces` = 5 (all pieces are on vendor memo, none in company available balance).
4. Verify `landed_cost` = $0 (vendor bears the cost until purchased).

**Expected Result:**
- Owner = "Vendor".
- lifecycle_stage = "on_memo".
- memo_pieces = 5, current_pieces = 5, available pieces = 0.
- landed_cost = $0.
- Notes describe the vendor memo terms and expiry.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-10: Parcel Genealogy Trace

**Objective:** Verify the genealogy view shows the complete family tree and supports navigation.

**Pre-condition:** Parcel `DP-000184` has child `DP-000184-A`.

**Steps:**
1. Open parcel `DP-000184-A`.
2. Scroll to the **Parcel Genealogy** section.
3. Verify `DP-000184` appears as the root.
4. Click `DP-000184` in the genealogy tree.

**Expected Result:**
- Genealogy tree shows `DP-000184` as root with `DP-000184-A` as a split child.
- Relationship type = `split` is shown on the edge.
- Clicking the root navigates to `DP-000184` detail page.
- Highlighted node shows current parcel `DP-000184-A`.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-11: Immutable Ledger — No Transaction Deletion

**Objective:** Confirm the transaction ledger is append-only.

**Steps:**
1. Open any parcel with multiple ledger entries.
2. Verify no Delete or Edit buttons appear in the Transaction Ledger table.
3. Using browser DevTools (Network tab), attempt `DELETE /api/parcels/{id}/transactions`.

**Expected Result:**
- No delete/edit controls exist in the UI.
- API returns 404 or 405 for unsupported methods on the transactions endpoint.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-12: Pearl Parcel — Per-Piece Pricing and Zero Weight

**Objective:** Verify parcels priced per-piece with no carat weight are handled without errors.

**Pre-condition:** Parcel `PL-000018` (Akoya pearls).

**Steps:**
1. Open `PL-000018`.
2. Verify `pricing_unit` = `per_piece`, `original_weight_ct` = 0.
3. Verify `landed_cost` = $9,000.
4. Issue 10 pieces to manufacturing (weight = 0).

**Expected Result:**
- Parcel displayed correctly with 0 carat weight and no division-by-zero error.
- Issue of 10 pcs at 0 weight succeeds.
- Ledger shows `manufacturing_issue` entry with pieces_delta = −10 and weight_delta_ct = 0.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-13: Dual-Unit Discrepancy

**Objective:** Verify pieces and weight are maintained as independent units and discrepancies are visible.

**Steps:**
1. Receive a new parcel: Pieces = `10`, Weight = `3.0000` ct (avg 0.30 ct/stone).
2. Perform a count adjustment: change pieces to `9` without changing weight (simulate one stone removed of unknown weight).
3. Verify the system records the piece change without auto-adjusting weight.

**Expected Result:**
- After adjustment: `current_pieces` = 9, `current_weight_ct` = 3.0000 (unchanged).
- Ledger shows `count_correction` with `pieces_delta` = −1, `weight_delta_ct` = 0.
- No automatic recalculation of weight from pieces.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-14: Natural/Lab-Grown Identity Separation

**Objective:** Verify the system enforces strict separation of natural and lab-grown goods.

**Steps:**
1. Attempt to merge `DP-000184` (natural_diamond) with `DP-000211` (lab_diamond) using the Merge dialog.
2. Attempt to receive a new parcel with material_origin = `unknown`.

**Expected Result:**
- Merge rejected with "Cannot merge natural and lab-grown material".
- Unknown origin parcel is receivable but should be flagged with `screening_status = pending`.

**Pass/Fail:** ___  
**Notes:** ___

---

### UAT-15: Dashboard Portfolio Value Accuracy

**Objective:** Verify dashboard statistics match expected totals from seed data.

**Steps:**
1. Open the Dashboard.
2. Verify the "Portfolio Value" stat.
3. Manually add up `current_avg_cost` from all active parcels visible in the Parcel List.

**Expected Result:**
- Dashboard "Portfolio Value" matches the sum of `current_avg_cost` for all active parcels.
- "Total Pieces" and "Total Weight (ct)" match sums from the Parcel List.
- Breakdown by material matches individual parcel counts.

**Pass/Fail:** ___  
**Notes:** ___

---

## Defect Log

| Defect # | Scenario | Description | Severity | Status |
|----------|----------|-------------|----------|--------|
| | | | | |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Business Analyst | | | |
| QA Lead | | | |
| Product Owner | | | |
| IT Lead | | | |
