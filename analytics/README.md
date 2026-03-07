# Pendo Health Check — Analytics

Lightweight, privacy-first analytics for the Pendo Health Check Chrome extension. Runs on Cloudflare Workers + D1 (free tier).

## What it tracks

- `popup_open` — extension opened, with Pendo detection status and check results
- `tab_switch` — which tab (Health Check, Setup, Tools) was viewed
- `copy_report` — report copied to clipboard
- `feedback_submit` — feedback submitted (no feedback content is tracked)

**No PII. No cookies. No IP logging. No user identification.**

## Setup (one-time)

```bash
# 1. Install Wrangler CLI if you don't have it
npm install -g wrangler

# 2. Authenticate with Cloudflare
wrangler login

# 3. Create the D1 database
wrangler d1 create phc-analytics
# Copy the database_id from the output into wrangler.toml

# 4. Initialize the schema
wrangler d1 execute phc-analytics --file=schema.sql

# 5. Deploy the Worker
wrangler deploy

# 6. Note your Worker URL (e.g., https://phc-analytics.<your-subdomain>.workers.dev)
# Update ANALYTICS_URL in the extension's popup.js
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/event` | Record an event |
| GET | `/stats` | General analytics (events, daily counts, version breakdown) |
| GET | `/stats/pendo` | Pendo-specific stats (detection rate, realm distribution, avg check results) |
| GET | `/` | Health check |

### POST /event

```json
{
  "event": "popup_open",
  "version": "1.2.0",
  "realm": "US",
  "checks_pass": 10,
  "checks_warn": 1,
  "checks_fail": 1,
  "has_pendo": 1
}
```

### GET /stats?days=30

Returns event counts, daily breakdown, event type distribution, and version breakdown.

### GET /stats/pendo?days=30

Returns Pendo detection rate, realm distribution, and average check pass/warn/fail counts.

## Free tier limits

Cloudflare's free tier covers this comfortably:

- **Workers:** 100,000 requests/day
- **D1:** 5 million reads/day, 100,000 writes/day, 5 GB storage
- **No credit card required**
