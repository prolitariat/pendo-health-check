// Pendo Health Check — Background Service Worker
//
// Handles:
//  - Installation lifecycle logging

chrome.runtime.onInstalled.addListener(() => {
  console.log("Pendo Health Check extension installed");
});
