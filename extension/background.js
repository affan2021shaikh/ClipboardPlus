// Background script: fetches remote URLs on behalf of the content script so
// that pulling a file "from a URL" isn't blocked by the host page's CORS
// policy. Extension background contexts are not subject to the page's CORS.

// Using browser.* with a fallback to chrome.* for Chromium compatibility.
if (typeof browser === "undefined") {
  globalThis.browser = globalThis.chrome;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "UA_FETCH_URL") {
    return fetchAsDataUrl(message.url);
  }
  return undefined;
});

async function fetchAsDataUrl(url) {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) {
      return { ok: false, error: `Request failed: ${res.status} ${res.statusText}` };
    }
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    const filename = filenameFromUrl(url, blob.type);
    return { ok: true, dataUrl, mimeType: blob.type, filename };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function filenameFromUrl(url, mimeType) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && last.includes(".")) return last;
  } catch {
    // ignore
  }
  return null;
}
