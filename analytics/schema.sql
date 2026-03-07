-- Pendo Health Check Analytics — D1 Schema
-- Run: wrangler d1 execute phc-analytics --file=schema.sql

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,           -- popup_open, tab_switch, copy_report, feedback_submit
  version TEXT,                  -- extension version (e.g., "1.2.0")
  realm TEXT,                    -- detected Pendo realm (US, EU, US1, JP)
  checks_pass INTEGER,          -- number of passing checks
  checks_warn INTEGER,          -- number of warning checks
  checks_fail INTEGER,          -- number of failing checks
  has_pendo INTEGER,            -- 1 = Pendo detected, 0 = not detected
  created_at TEXT NOT NULL       -- ISO 8601 timestamp
);

-- Index for time-range queries (dashboard)
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- Index for event-type breakdowns
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event, created_at);
