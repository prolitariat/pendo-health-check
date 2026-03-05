// Pendo Health Check — Background Service Worker
//
// Handles:
//  - Installation lifecycle logging
//  - Feedback storage with PII scrubbing

chrome.runtime.onInstalled.addListener(() => {
  console.log("Pendo Health Check extension installed");
});

// ---------------------------------------------------------------------------
// PII Scrubbing
// ---------------------------------------------------------------------------
function scrubPII(text) {
  if (!text || typeof text !== "string") return text;

  // Email addresses
  text = text.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    "[REDACTED_EMAIL]"
  );

  // SSN (XXX-XX-XXXX) — must come before phone to avoid overlap
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");

  // Credit card numbers (13-19 digits, with optional spaces or dashes)
  text = text.replace(
    /\b(?:\d[ \-]?){13,19}\b/g,
    "[REDACTED_CC]"
  );

  // US phone numbers: (555) 123-4567, 555-123-4567, 555.123.4567,
  // +1 555 123 4567, +1-555-123-4567, 5551234567
  text = text.replace(
    /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g,
    "[REDACTED_PHONE]"
  );

  // IPv4 addresses
  text = text.replace(
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    "[REDACTED_IP]"
  );

  return text;
}

// ---------------------------------------------------------------------------
// Feedback Message Handler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "save-feedback") return false;

  const entry = {
    timestamp: new Date().toISOString(),
    url: scrubPII(message.url || ""),
    feedback: scrubPII(message.feedback || ""),
    extensionVersion: chrome.runtime.getManifest().version,
  };

  chrome.storage.local.get({ pendoHealthCheckFeedback: [] }, (result) => {
    const feedbackList = result.pendoHealthCheckFeedback;
    feedbackList.push(entry);
    chrome.storage.local.set(
      { pendoHealthCheckFeedback: feedbackList },
      () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, count: feedbackList.length });
        }
      }
    );
  });

  // Return true to indicate async sendResponse
  return true;
});
