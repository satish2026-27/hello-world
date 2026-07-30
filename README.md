# hello-world

This repository is for practicing the GitHub Flow
i am satish kumar — done master's in the usf — loyal to all mighty

---

# 💎 Jewelry Parcel Management — UAT Environment

A full **User Acceptance Testing (UAT) environment** for a jewelry ERP **Parcel Management** module.

Covers the complete lifecycle of loose-stone parcels: receipt, split, merge, transfer, manufacturing issue/return, memo/consignment, physical count, and compliance.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed sample data (diamonds, sapphires, emeralds, pearls, quarantine, vendor memo)
npm run seed

# 3. Start the UAT server
npm start
# → Open http://localhost:3000
```

---

## What's Included

### Sample Parcels (seeded)

| Parcel # | Material | Description |
|----------|----------|-------------|
| DP-000184 | Natural Diamond | 525 pcs, G–H/SI, 18.42 ct @ $610/ct — the spec example |
| DP-000184-A | Natural Diamond | Child split of DP-000184 — allocated to Retail Store 1 |
| DP-000211 | Lab-Grown Diamond | 640 available + 80 WIP (tennis bracelet job) |
| SP-000072 | Blue Sapphire | Sri Lanka, heat treated, oval, 62.40 ct |
| EM-000031 | Colombian Emerald | 10 available + 2 on memo to NY Diamond District |
| PD-000009 | Pink Diamond | Vendor memo/consignment — NOT company-owned |
| PL-000018 | Akoya Pearl | 200 pcs, per-piece pricing, zero carat weight |
| QR-000003 | Unknown | Quarantined — natural/lab-grown identity pending GIA |

### Business Operations Supported

| Operation | API Endpoint | UI Action |
|-----------|-------------|-----------|
| Receive parcel | `POST /api/parcels` | Receive button |
| Split parcel | `POST /api/parcels/:id/split` | Scissors icon / Split modal |
| Merge parcels | `POST /api/parcels/merge` | Merge modal |
| Transfer location | `POST /api/parcels/:id/transfer` | Transfer modal |
| Issue to manufacturing | `POST /api/parcels/:id/issue` | Issue button |
| Manufacturing return | `POST /api/parcels/:id/return` | Return button |
| Memo issue | `POST /api/parcels/:id/memo` | Memo button |
| Memo return | `POST /api/parcels/:id/memo-return` | — |
| Count/weight adjust | `POST /api/parcels/:id/adjust` | Adjust button |

### UAT Test Scenarios

15 guided UAT scenarios are available:
- **In the browser**: navigate to the **UAT Scenarios** tab.
- **As a document**: [`uat/test-scenarios.md`](uat/test-scenarios.md)

---

## Architecture

```
server.js               Express REST API (all business logic)
src/
  database.js           SQLite schema initialisation (better-sqlite3)
  seed.js               Realistic sample data
public/
  index.html            Single-page Bootstrap 5 UI
  js/app.js             Vanilla JS frontend
  css/custom.css        Styling
database/
  parcel_uat.db         Auto-created SQLite database
uat/
  test-scenarios.md     Printable UAT sign-off document
```

### Core Database Entities

| Table | Purpose |
|-------|---------|
| `parcels` | Current identity, balance, location, valuation |
| `parcel_transactions` | **Immutable** business event ledger |
| `parcel_relationships` | Split / merge / regrade genealogy |
| `parcel_certificates` | Lab, screening, KP compliance |
| `parcel_reservations` | Active allocations to orders / jobs |

### API Reference

```
GET  /api/dashboard                   Portfolio stats
GET  /api/parcels                     List (filter: ?q=, &material=, &lifecycle_stage=)
GET  /api/parcels/:id                 Detail + certs + children + parents
POST /api/parcels                     Receive new parcel
POST /api/parcels/:id/split           Split into children
POST /api/parcels/merge               Merge source parcels
POST /api/parcels/:id/transfer        Relocate / change custodian
POST /api/parcels/:id/issue           Issue to manufacturing
POST /api/parcels/:id/return          Return from manufacturing
POST /api/parcels/:id/memo            Issue on customer/vendor memo
POST /api/parcels/:id/memo-return     Return from memo
POST /api/parcels/:id/adjust          Physical count / weight correction
GET  /api/parcels/:id/transactions    Full transaction ledger
GET  /api/parcels/:id/genealogy       Family tree (split/merge ancestry)
```

---

## Key Design Principles Implemented

1. **Dual-unit management** — pieces and weight are always independent fields.
2. **Immutable ledger** — every operation appends a transaction; none can be deleted.
3. **Genealogy graph** — full split/merge ancestry from root to leaf.
4. **Natural / lab-grown separation** — merge is blocked across origin types.
5. **Ownership ≠ custody** — `owner`, `custodian`, and `legal_entity` are separate fields.
6. **Multiple balance dimensions** — current, reserved, memo, WIP, damaged.
7. **Compliance traceability** — KP certificate, screening status, responsible source.

---

## Re-seed Fresh Data

```bash
npm run seed
```

This resets the database to the original 8 sample parcels.
