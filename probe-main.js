// Pendo Health Check — Lightweight page probe (MAIN world)
// Polls for Pendo initialization, counts basic issues, dispatches result
// to ISOLATED world bridge via CustomEvent.
(function () {
  var MAX_WAIT = 6000;
  var INTERVAL = 500;
  var elapsed = 0;

  function send(detail) {
    window.dispatchEvent(
      new CustomEvent("__pendo_hc_probe", { detail: JSON.stringify(detail) })
    );
  }

  function probe() {
    elapsed += INTERVAL;
    var hasPendo =
      typeof window.pendo !== "undefined" && !!window.pendo;

    // Keep waiting if Pendo not found yet
    if (!hasPendo && elapsed < MAX_WAIT) {
      setTimeout(probe, INTERVAL);
      return;
    }
    if (!hasPendo) {
      send({ hasPendo: false, issues: 0, criticals: 0, warnings: 0 });
      return;
    }

    // Pendo found — wait for isReady
    var isReady = false;
    try {
      isReady =
        typeof pendo.isReady === "function" ? pendo.isReady() : !!pendo.visitorId;
    } catch (e) {}

    if (!isReady && elapsed < MAX_WAIT) {
      setTimeout(probe, INTERVAL);
      return;
    }

    // Score basic issues (mirrors runPendoHealthCheck)
    var criticals = 0;
    var warnings = 0;

    if (!isReady) criticals++;

    try {
      var vid = "";
      if (typeof pendo.getVisitorId === "function") vid = pendo.getVisitorId();
      else vid = pendo.visitorId || "";

      if (!vid) criticals++;
      else if (
        /^_PENDO_T_/.test(vid) ||
        vid === "VISITOR-UNIQUE-ID" ||
        /^anonymous/i.test(vid)
      )
        warnings++;
    } catch (e) {}

    send({
      hasPendo: true,
      issues: criticals + warnings,
      criticals: criticals,
      warnings: warnings,
    });
  }

  // Start after initial page settle
  setTimeout(probe, INTERVAL);
})();
