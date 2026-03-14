// Pendo Health Check — Probe bridge (ISOLATED world)
// Relays probe results from MAIN world CustomEvent to background service worker.
window.addEventListener("__pendo_hc_probe", function (e) {
  try {
    var data =
      typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail;
    chrome.runtime.sendMessage({ type: "pendo-probe", data: data });
  } catch (err) {}
});
