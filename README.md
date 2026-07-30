# Jewelry Parcel Management — UAT Environment

A **User Acceptance Testing** environment for a jewelry ERP **Parcel Management** module.

A parcel is a traceable, divisible inventory identity for commercially managed groups of loose stones — not merely a quantity field on an item. This UAT stack implements:

> **One parcel identity + immutable ledger + genealogy graph + multiple balance dimensions.**

---

## Quick Start

```bash
npm install
npm run seed
npm start
# → http://localhost:3000
```

Optional API smoke tests (server must be running):

```bash
npm run test:smoke
```

---

## Seeded Sample Parcels

| Parcel # | Material | Highlights |
|----------|----------|------------|
| DP-000184 | Natural diamond | Spec example after partial split — **325 pcs / 11.40 ct** remaining |
| DP-000184-A | Natural diamond | Child split → Retail Store 1 |
| DP-000211 | Lab-grown diamond | WIP + reserved balances |
| SP-000072 | Blue sapphire | Heat-treated, Sri Lanka, reserved qty |
| EM-000031 | Colombian emerald | Partial customer memo |
| PD-000009 | Pink diamond | **Vendor memo** — Owner=Vendor, cost $0 |
| PL-000018 | Akoya pearl | Per-piece pricing, **zero carat weight** |
| QR-000003 | Unknown | **Quarantined** pending GIA screening |

Use **Reset Data** in the UI (or `POST /api/uat/reset`) to restore this baseline between scenarios.

---

## Operations Covered

| Operation | Endpoint | UI |
|-----------|----------|----|
| Receive | `POST /api/parcels` | Receive |
| Split | `POST /api/parcels/:id/split` | Split |
| Merge | `POST /api/parcels/merge` | Merge |
| Transfer | `POST /api/parcels/:id/transfer` | Transfer |
| Manufacturing issue / return | `…/issue`, `…/return` | Issue / Return |
| Memo issue / return | `…/memo`, `…/memo-return` | Memo / Memo Return |
| Reserve / unreserve | `…/reserve`, `…/unreserve` | Reserve |
| Sale | `…/sale` | Sale |
| Regrade / resort | `…/regrade` | Regrade |
| Count adjust (maker-checker) | `…/adjust` | Adjust |
| Quarantine / release | `…/quarantine`, `…/release-quarantine` | Quarantine / Release QC |
| Ownership transfer | `…/ownership` | API |
| Certificate attach | `…/certificates` | API |
| Disposition audit | `GET …/disposition` | Disposition |
| Genealogy | `GET …/genealogy` | Detail |
| UAT reset | `POST /api/uat/reset` | Reset Data |

---

## UAT Scenarios

**18 guided scenarios** in the **UAT Scenarios** tab (Pass / Fail / Blocked with browser persistence).

Printable checklist: [`uat/test-scenarios.md`](uat/test-scenarios.md)

Automated coverage: `npm run test:smoke`

---

## Architecture

```
server.js               Express REST API + business rules
src/database.js         sql.js SQLite schema
src/seed.js             Realistic sample data
public/                 Bootstrap UAT SPA
uat/test-scenarios.md   Sign-off document
uat/smoke-tests.js      API smoke suite
database/parcel_uat.db  Auto-created (gitignored)
```

### Core entities

| Table | Purpose |
|-------|---------|
| `parcels` | Current identity, dual-unit balances, ownership, custody, valuation |
| `parcel_transactions` | **Immutable** append-only ledger |
| `parcel_relationships` | Split / merge / regrade genealogy |
| `parcel_certificates` | Lab, screening, KP / compliance |
| `parcel_reservations` | Order / job allocations |

---

## Non-negotiable controls implemented

1. Dual quantity management — pieces and weight are independent  
2. Complete genealogy across splits, merges, and regrades  
3. Separate ownership, custody, and location  
4. Immutable transaction ledger  
5. Natural / lab-grown / treatment merge separation  
6. Multiple pricing units (incl. per-piece zero-weight pearls)  
7. Memo and consignment lifecycle  
8. Manufacturing issue, return, breakage, and loss  
9. Physical count with maker-checker approval  
10. Certificate and disposition (carat-trace) reports  
11. Quarantine blocks production issue until release  
12. Configurable regrade variance tolerance  
13. Reservation dimension on available balance  
14. Sale / COGS with parcel closure at zero  
15. UAT reset + interactive sign-off checklist  

---

## Design principle

> **A parcel is an inventory identity; the parcel ledger is the accounting truth.**
