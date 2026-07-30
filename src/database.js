'use strict';

const initSqlJs = require('sql.js');
const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'parcel_uat.db');

let _db   = null;   // sql.js Database instance
let SQL   = null;   // sql.js module

// ── Initialise (async, called once at startup) ───────────────────────────────
async function initDb() {
  if (_db) return _db;
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }
  _db.run('PRAGMA foreign_keys = ON');
  initSchema();
  saveDb();   // write initial file
  return _db;
}

// ── Persist to disk ─────────────────────────────────────────────────────────
function saveDb() {
  if (!_db) return;
  const data = _db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Thin synchronous-style wrapper ──────────────────────────────────────────
// sql.js executes synchronously so we wrap it in a familiar API.
let _inTransaction = false;

function getDb() {
  if (!_db) throw new Error('DB not initialised – await initDb() first');

  return {
    prepare(sql) {
      return {
        run(params = {}) {
          _db.run(sql, normalise(params));
          if (!_inTransaction) saveDb();
          return { changes: _db.getRowsModified() };
        },
        get(params = {}) {
          const stmt = _db.prepare(sql);
          stmt.bind(normalise(params));
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        },
        all(params = {}) {
          const results = [];
          const stmt = _db.prepare(sql);
          stmt.bind(normalise(params));
          while (stmt.step()) results.push(stmt.getAsObject());
          stmt.free();
          return results;
        },
      };
    },
    exec(sql) { _db.run(sql); if (!_inTransaction) saveDb(); },
    transaction(fn) {
      return function(...args) {
        _inTransaction = true;
        _db.run('BEGIN');
        try {
          fn(...args);
          _db.run('COMMIT');
          _inTransaction = false;
          saveDb();
        } catch(e) {
          _db.run('ROLLBACK');
          _inTransaction = false;
          throw e;
        }
      };
    },
  };
}

// sql.js named parameters match the prefix in the SQL statement literally.
// Our SQL uses both @key (named) and ? (positional) syntax.
// Positional params should be passed as an array; named as an object with @key.
function normalise(params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params;
  if (typeof params !== 'object') return [params];   // single positional value
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    const key = (k.startsWith('@') || k.startsWith('$') || k.startsWith(':')) ? k : '@' + k;
    out[key] = v ?? null;
  }
  return out;
}

function initSchema() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS parcels (
      id                  TEXT PRIMARY KEY,
      parcel_number       TEXT UNIQUE NOT NULL,
      parent_parcel_id    TEXT,
      root_parcel_id      TEXT,
      vendor_parcel_number TEXT,
      po_number           TEXT,
      receipt_reference   TEXT,

      status              TEXT NOT NULL DEFAULT 'active',
      lifecycle_stage     TEXT NOT NULL DEFAULT 'available',

      material            TEXT NOT NULL,
      material_origin     TEXT NOT NULL DEFAULT 'natural',
      condition           TEXT NOT NULL DEFAULT 'polished',
      shape               TEXT,
      size_min_mm         REAL,
      size_max_mm         REAL,
      color               TEXT,
      color_range_max     TEXT,
      clarity             TEXT,
      clarity_range_max   TEXT,
      treatment           TEXT DEFAULT 'none',
      fluorescence        TEXT DEFAULT 'none',
      origin_country      TEXT,
      assortment_grade    TEXT,

      original_pieces     INTEGER NOT NULL DEFAULT 0,
      current_pieces      INTEGER NOT NULL DEFAULT 0,
      reserved_pieces     INTEGER NOT NULL DEFAULT 0,
      memo_pieces         INTEGER NOT NULL DEFAULT 0,
      wip_pieces          INTEGER NOT NULL DEFAULT 0,
      damaged_pieces      INTEGER NOT NULL DEFAULT 0,

      original_weight_ct  REAL NOT NULL DEFAULT 0,
      current_weight_ct   REAL NOT NULL DEFAULT 0,
      reserved_weight_ct  REAL NOT NULL DEFAULT 0,
      memo_weight_ct      REAL NOT NULL DEFAULT 0,
      wip_weight_ct       REAL NOT NULL DEFAULT 0,
      damaged_weight_ct   REAL NOT NULL DEFAULT 0,

      purchase_rate       REAL,
      pricing_unit        TEXT NOT NULL DEFAULT 'per_carat',
      landed_cost         REAL NOT NULL DEFAULT 0,
      current_avg_cost    REAL NOT NULL DEFAULT 0,
      currency            TEXT NOT NULL DEFAULT 'USD',

      site                TEXT,
      vault               TEXT,
      bin_location        TEXT,
      custodian           TEXT,
      owner               TEXT,
      legal_entity        TEXT,

      screening_status    TEXT NOT NULL DEFAULT 'pending',
      kimberley_cert      TEXT,
      responsible_source  TEXT,

      created_by          TEXT NOT NULL DEFAULT 'system',
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes               TEXT,

      FOREIGN KEY (parent_parcel_id) REFERENCES parcels(id)
    );

    CREATE TABLE IF NOT EXISTS parcel_relationships (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_parcel_id    TEXT NOT NULL,
      child_parcel_id     TEXT NOT NULL,
      relationship_type   TEXT NOT NULL,
      pieces_moved        INTEGER,
      weight_moved_ct     REAL,
      cost_allocated      REAL,
      allocation_method   TEXT,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes               TEXT,
      FOREIGN KEY (parent_parcel_id) REFERENCES parcels(id),
      FOREIGN KEY (child_parcel_id)  REFERENCES parcels(id)
    );

    CREATE TABLE IF NOT EXISTS parcel_transactions (
      id                  TEXT PRIMARY KEY,
      parcel_id           TEXT NOT NULL,
      transaction_type    TEXT NOT NULL,
      reference_number    TEXT,
      related_parcel_id   TEXT,
      related_document    TEXT,

      before_pieces       INTEGER,
      before_weight_ct    REAL,
      pieces_delta        INTEGER NOT NULL DEFAULT 0,
      weight_delta_ct     REAL    NOT NULL DEFAULT 0,
      cost_delta          REAL    NOT NULL DEFAULT 0,
      after_pieces        INTEGER,
      after_weight_ct     REAL,

      location_from       TEXT,
      location_to         TEXT,
      custodian_from      TEXT,
      custodian_to        TEXT,

      physical_date       DATE NOT NULL,
      document_date       DATE,
      posting_date        DATE NOT NULL,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,

      created_by          TEXT NOT NULL DEFAULT 'system',
      approved_by         TEXT,
      reason_code         TEXT,
      notes               TEXT,

      FOREIGN KEY (parcel_id) REFERENCES parcels(id)
    );

    CREATE TABLE IF NOT EXISTS parcel_certificates (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      parcel_id    TEXT NOT NULL,
      cert_type    TEXT NOT NULL,
      cert_number  TEXT,
      issued_by    TEXT,
      issued_date  DATE,
      expiry_date  DATE,
      is_valid     INTEGER NOT NULL DEFAULT 1,
      notes        TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parcel_id) REFERENCES parcels(id)
    );

    CREATE TABLE IF NOT EXISTS parcel_reservations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      parcel_id       TEXT NOT NULL,
      reserved_pieces INTEGER NOT NULL DEFAULT 0,
      reserved_weight REAL    NOT NULL DEFAULT 0,
      reservation_type TEXT   NOT NULL,
      order_reference TEXT,
      customer        TEXT,
      reserved_by     TEXT,
      reserved_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at      DATETIME,
      status          TEXT NOT NULL DEFAULT 'active',
      notes           TEXT,
      FOREIGN KEY (parcel_id) REFERENCES parcels(id)
    );

    CREATE INDEX IF NOT EXISTS idx_parcels_status   ON parcels(status);
    CREATE INDEX IF NOT EXISTS idx_parcels_material ON parcels(material);
    CREATE INDEX IF NOT EXISTS idx_txn_parcel       ON parcel_transactions(parcel_id);
    CREATE INDEX IF NOT EXISTS idx_rel_parent       ON parcel_relationships(parent_parcel_id);
    CREATE INDEX IF NOT EXISTS idx_rel_child        ON parcel_relationships(child_parcel_id);
  `);
}

async function reloadDb() {
  if (!SQL) SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    if (_db) _db.close();
    _db = new SQL.Database(buf);
  } else {
    if (_db) _db.close();
    _db = new SQL.Database();
    initSchema();
    saveDb();
  }
  _db.run('PRAGMA foreign_keys = ON');
  return _db;
}

module.exports = { getDb, initDb, reloadDb };
