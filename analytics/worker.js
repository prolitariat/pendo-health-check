// Pendo Health Check — Analytics Worker (Cloudflare Workers + D1)
//
// Lightweight, privacy-first event tracking. No cookies, no PII, no IP logging.
// Accepts POST /event from the extension, stores in D1, serves dashboard on GET /stats.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers for Chrome extension
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /event — record an analytics event
    if (request.method === "POST" && url.pathname === "/event") {
      try {
        const body = await request.json();
        const { event, version, realm, checks_pass, checks_warn, checks_fail, has_pendo } = body;

        if (!event || typeof event !== "string") {
          return new Response(JSON.stringify({ error: "missing event" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await env.DB.prepare(
          `INSERT INTO events (event, version, realm, checks_pass, checks_warn, checks_fail, has_pendo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            event.slice(0, 50),
            (version || "").slice(0, 20),
            (realm || "").slice(0, 10),
            checks_pass ?? null,
            checks_warn ?? null,
            checks_fail ?? null,
            has_pendo ?? null,

          )
          .run();

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // GET /stats — basic analytics dashboard (JSON)
    if (request.method === "GET" && url.pathname === "/stats") {
      const days = parseInt(url.searchParams.get("days") || "30", 10);

      const [totals, daily, byEvent, byVersion] = await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) as total, COUNT(DISTINCT date(created_at)) as active_days
           FROM events WHERE created_at > datetime('now', '-' || ? || ' days')`
        ).bind(days).first(),

        env.DB.prepare(
          `SELECT date(created_at) as day, COUNT(*) as count
           FROM events WHERE created_at > datetime('now', '-' || ? || ' days')
           GROUP BY day ORDER BY day DESC LIMIT 30`
        ).bind(days).all(),

        env.DB.prepare(
          `SELECT event, COUNT(*) as count
           FROM events WHERE created_at > datetime('now', '-' || ? || ' days')
           GROUP BY event ORDER BY count DESC`
        ).bind(days).all(),

        env.DB.prepare(
          `SELECT version, COUNT(*) as count
           FROM events WHERE created_at > datetime('now', '-' || ? || ' days')
           GROUP BY version ORDER BY count DESC`
        ).bind(days).all(),
      ]);

      return new Response(
        JSON.stringify({ days, totals, daily: daily.results, byEvent: byEvent.results, byVersion: byVersion.results }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /stats/pendo — Pendo-specific stats
    if (request.method === "GET" && url.pathname === "/stats/pendo") {
      const days = parseInt(url.searchParams.get("days") || "30", 10);

      const [pendoRate, byRealm, avgChecks] = await Promise.all([
        env.DB.prepare(
          `SELECT
             COUNT(CASE WHEN has_pendo = 1 THEN 1 END) as detected,
             COUNT(CASE WHEN has_pendo = 0 THEN 1 END) as not_detected,
             COUNT(*) as total
           FROM events WHERE event = 'popup_open' AND created_at > datetime('now', '-' || ? || ' days')`
        ).bind(days).first(),

        env.DB.prepare(
          `SELECT realm, COUNT(*) as count
           FROM events WHERE realm IS NOT NULL AND realm != '' AND created_at > datetime('now', '-' || ? || ' days')
           GROUP BY realm ORDER BY count DESC`
        ).bind(days).all(),

        env.DB.prepare(
          `SELECT
             ROUND(AVG(checks_pass), 1) as avg_pass,
             ROUND(AVG(checks_warn), 1) as avg_warn,
             ROUND(AVG(checks_fail), 1) as avg_fail
           FROM events WHERE checks_pass IS NOT NULL AND created_at > datetime('now', '-' || ? || ' days')`
        ).bind(days).first(),
      ]);

      return new Response(
        JSON.stringify({ days, pendoRate, byRealm: byRealm.results, avgChecks }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET / — simple health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", service: "pendo-health-check-analytics" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
