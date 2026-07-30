# Jewelry Parcel Management — UAT Test Scenarios

User Acceptance Testing scenarios for the Jewelry Parcel Management ERP module.
Each scenario maps to a business rule in the parcel management specification.

---

## How to Use

1. `npm install && npm run seed && npm start`
2. Open `http://localhost:3000`
3. Use **Reset Data** before each scenario that depends on seed balances
4. Record **Pass / Fail / Blocked** in the UAT Scenarios tab (or below)

**Tester:** ___________________  
**Date:** ___________________  
**Environment:** UAT (localhost)  
**Build/Seed:** fresh seed / Reset Data

Optional automation: `npm run test:smoke`

---

## Scenario Summary

| ID | Scenario | Area | Result | Defect # |
|----|----------|------|--------|----------|
| UAT-01 | Receive new natural diamond parcel | Receipt | | |
| UAT-02 | Split parcel into children | Split | | |
| UAT-03 | Merge compatible; reject incompatible | Merge | | |
| UAT-04 | Manufacturing issue + return with breakage | Production | | |
| UAT-05 | Memo issue and partial return | Memo | | |
| UAT-06 | Transfer between vaults | Transfer | | |
| UAT-07 | Count adjustment with approval | Count | | |
| UAT-08 | Quarantine blocks issue; release QC | Quarantine | | |
| UAT-09 | Vendor memo ownership | Ownership | | |
| UAT-10 | Genealogy + disposition audit | Genealogy | | |
| UAT-11 | Immutable ledger | Audit | | |
| UAT-12 | Pearl per-piece / zero weight | Valuation | | |
| UAT-13 | Dual-unit discrepancy | Data Integrity | | |
| UAT-14 | Natural/lab-grown merge rejection | Compliance | | |
| UAT-15 | Dashboard portfolio accuracy | Reporting | | |
| UAT-16 | Regrade into quality grades | Regrade | | |
| UAT-17 | Reserve and unreserve | Reservation | | |
| UAT-18 | Sale closes parcel at zero | Sale | | |

---

## Detailed Scenarios

### UAT-01: Receive a New Natural Diamond Parcel

**Steps:** Receive `DP-TEST-001` — natural round, G–H/SI1–SI2, 100 pcs, 3.500 ct @ $600/ct, Vault A.

**Expected:** Available 100 / 3.5000. Receipt ledger +100 pcs. Landed cost **$2,100**.

---

### UAT-02: Split Into Two Children

**Pre-condition:** `DP-000184` = **325 pcs / 11.40 ct** after seed.

**Steps:** Split 150/5.27 and 100/3.52.

**Expected:** Parent −250 pcs / −8.79 ct. Two children with genealogy + opening_balance txns.

---

### UAT-03: Merge Compatible; Reject Natural + Lab-Grown

**Steps:** Merge two available natural parcels (no memo/WIP/reserve). Then attempt natural + `DP-000211`.

**Expected:** Valid merge creates new parcel, closes sources. Invalid merge: *"Cannot merge natural and lab-grown material"*.

---

### UAT-04: Manufacturing Issue and Partial Return With Breakage

**Steps:** On `DP-000211`, issue 50 pcs / 1.4 ct; return 45, broken 3, lost 2.

**Expected:** WIP +50 then −50. `damaged_pieces` +3. Ledger shows issue + return.

---

### UAT-05: Memo Issue and Partial Return

**Steps:** On `EM-000031`, memo 2 pcs / 4.80 ct; memo-return 1 pc.

**Expected:** `memo_pieces` adjusts; available adjusts; memo_issue + memo_return in ledger.

---

### UAT-06: Transfer Between Vaults

**Steps:** Transfer any available parcel to Retail Store 2 / Store Safe 2 / Tray-05.

**Expected:** Location updates; pieces/weight unchanged; transfer txn deltas = 0.

---

### UAT-07: Count Adjustment With Approval

**Steps:** Adjust `DP-000184` pieces −5 with Approved By = Manager A. Retry without approver.

**Expected:** Approved adjust logs `count_correction` with `before_pieces`. Missing approver → 400.

---

### UAT-08: Quarantine Blocks Issue; Release QC

**Steps:** Attempt issue on `QR-000003`. Release with origin `natural` + approver.

**Expected:** Issue rejected while quarantined. After release: `available`, origin resolved.

---

### UAT-09: Vendor Memo Ownership

**Steps:** Open `PD-000009`.

**Expected:** Owner=Vendor, `on_memo`, memo_pieces=5, available=0, landed_cost=$0.

---

### UAT-10: Genealogy + Disposition Audit

**Steps:** Open `DP-000184-A` genealogy. Open Disposition on `DP-000184`.

**Expected:** Tree shows root→child. Disposition original pieces = 525; family listed.

---

### UAT-11: Immutable Ledger

**Steps:** Confirm no delete UI. `DELETE /api/parcels/{id}/transactions`.

**Expected:** 404/405. No mutation controls in UI.

---

### UAT-12: Pearl Per-Piece / Zero Weight

**Steps:** Open `PL-000018`; issue 10 pcs at weight 0.

**Expected:** Displays correctly; issue succeeds; weight_delta_ct = 0.

---

### UAT-13: Dual-Unit Discrepancy

**Steps:** Receive 10 pcs / 3.0000 ct. Adjust pieces to 9 only (with approver).

**Expected:** pieces=9, weight still 3.0000. No auto-recalc.

---

### UAT-14: Natural / Lab-Grown Separation

**Steps:** Merge natural parcel with `DP-000211`.

**Expected:** Rejected; no balance change.

---

### UAT-15: Dashboard Portfolio Accuracy

**Steps:** Reset Data. Compare Dashboard totals to Parcel List sums.

**Expected:** Portfolio value, pieces, and weight match active parcels.

---

### UAT-16: Regrade Into Quality Grades

**Steps:** Regrade `DP-000184-A` into Premium 120/4.20 and Commercial 80/2.80.

**Expected:** Source closed. Two regrade children. Input = outputs (+ loss/variance rules).

---

### UAT-17: Reserve and Unreserve

**Steps:** Reserve 20 pcs on `DP-000184`. Confirm available drops. Unreserve.

**Expected:** Reserved dimension moves; available = current − reserved − memo − wip.

---

### UAT-18: Sale Closes Parcel at Zero

**Steps:** Receive small parcel; sell entire balance.

**Expected:** Sale COGS posted; parcel `closed` at zero remaining.

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
