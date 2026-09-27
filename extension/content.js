(function () {
  if (typeof browser === "undefined") {
    globalThis.browser = globalThis.chrome;
  }

  const DEFAULT_SETTINGS = {
    format: "YYYY-MM-DD_HH-mm-ss",
    enabled: true,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let activeInput = null; // the <input type=file> we're standing in for
  let popupHost = null;
  let currentFile = null; // { blob, name, ext, url (object URL for preview) }
  let suppressNextNativeClick = false; // set when "Upload custom file" triggers input.click()

  loadSettings();
  browser.storage.onChanged.addListener((changes) => {
    if (changes.uaSettings) {
      settings = { ...DEFAULT_SETTINGS, ...changes.uaSettings.newValue };
    }
  });

  async function loadSettings() {
    try {
      const stored = await browser.storage.sync.get("uaSettings");
      settings = { ...DEFAULT_SETTINGS, ...(stored.uaSettings || {}) };
    } catch {
      // storage may be briefly unavailable during extension reload; keep defaults
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!settings.enabled) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "file") return;

      if (suppressNextNativeClick) {
        suppressNextNativeClick = false;
        return; // let this one through natively
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      openPopupFor(target);
    },
    true
  );

  function openPopupFor(inputEl) {
    activeInput = inputEl;
    currentFile = null;
    if (popupHost) popupHost.remove();

    popupHost = document.createElement("ua-popup-host");
    document.body.appendChild(popupHost);
    positionNear(popupHost, inputEl);

    const shadow = popupHost.attachShadow({ mode: "open" });
    shadow.innerHTML = buildPopupMarkup();
    injectShadowStyles(shadow);
    wireUpPopup(shadow, inputEl);

    // Default filename based on "now".
    setFilenameFromNow(shadow);

    // Close on outside click / Escape.
    setTimeout(() => {
      document.addEventListener("mousedown", onOutsideClick, true);
      document.addEventListener("keydown", onEscape, true);
    }, 0);
  }

  function onOutsideClick(e) {
    if (!popupHost) return;
    const path = e.composedPath();
    if (!path.includes(popupHost)) closePopup();
  }

  function onEscape(e) {
    if (e.key === "Escape") closePopup();
  }

  function closePopup() {
    if (popupHost) popupHost.remove();
    popupHost = null;
    document.removeEventListener("mousedown", onOutsideClick, true);
    document.removeEventListener("keydown", onEscape, true);
    if (currentFile?.url) URL.revokeObjectURL(currentFile.url);
    currentFile = null;
  }

  function positionNear(host, inputEl) {
    const rect = inputEl.getBoundingClientRect();
    const top = window.scrollY + rect.bottom + 6;
    let left = window.scrollX + rect.left;
    const popupWidth = 320;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - popupWidth - 12;
    left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
  }

  function buildPopupMarkup() {
    return `
      <div class="ua-panel" role="dialog" aria-label="Upload a file">
        <div class="ua-header">
          <span class="ua-title">Upload a file</span>
          <button class="ua-close" type="button" aria-label="Close" title="Close">×</button>
        </div>

        <div class="ua-preview" hidden>
          <img class="ua-thumb" alt="" hidden />
          <div class="ua-filetype-badge" hidden></div>
        </div>

        <div class="ua-dropzone" tabindex="0">
          <span class="ua-dropzone-text">Drop a file, or paste from clipboard (Ctrl+V)</span>
        </div>

        <label class="ua-field-label" for="ua-filename">File name</label>
        <input class="ua-input" id="ua-filename" type="text" spellcheck="false" autocomplete="off" />
        <p class="ua-hint"></p>

        <div class="ua-status" hidden></div>

        <div class="ua-actions">
          <button class="ua-btn ua-btn-secondary" id="ua-btn-url" type="button">Upload from URL</button>
          <button class="ua-btn ua-btn-primary" id="ua-btn-upload" type="button" disabled>Upload</button>
          <button class="ua-btn ua-btn-secondary" id="ua-btn-custom" type="button">Upload custom file</button>
        </div>

        <div class="ua-url-row" hidden>
          <input class="ua-input" id="ua-url-input" type="text" placeholder="https://example.com/image.png" autocomplete="off" />
          <button class="ua-btn ua-btn-primary" id="ua-url-fetch" type="button">Fetch</button>
        </div>
      </div>
    `;
  }

  function injectShadowStyles(shadow) {
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .ua-panel {
        width: 320px;
        font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        color: #15141a;
        background: #ffffff;
        border: 1px solid #cfcfd8;
        border-radius: 4px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
        padding: 12px;
      }
      .ua-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .ua-title { font-weight: 600; font-size: 13px; color: #15141a; }
      .ua-close {
        background: none; border: none; cursor: pointer;
        font-size: 16px; line-height: 1; color: #5b5b66;
        padding: 2px 6px; border-radius: 2px;
      }
      .ua-close:hover { background: #f0f0f4; }

      .ua-dropzone {
        border: 1px dashed #b1b1bc;
        border-radius: 4px;
        padding: 14px 10px;
        text-align: center;
        color: #5b5b66;
        margin-bottom: 10px;
        cursor: text;
        transition: border-color 0.1s, background 0.1s;
      }
      .ua-dropzone:focus { outline: none; border-color: #0060df; background: #f0f7ff; }
      .ua-dropzone.ua-dragover { border-color: #0060df; background: #f0f7ff; }
      .ua-dropzone-text { font-size: 12px; }

      .ua-preview {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        padding: 8px;
        background: #f9f9fb;
        border-radius: 4px;
      }
      .ua-thumb {
        width: 40px; height: 40px; object-fit: cover;
        border-radius: 3px; border: 1px solid #e0e0e6;
        background: #fff;
      }
      .ua-filetype-badge {
        width: 40px; height: 40px;
        display: flex; align-items: center; justify-content: center;
        background: #e0e0e6; border-radius: 3px;
        font-size: 10px; font-weight: 700; color: #42414d;
        text-transform: uppercase;
      }

      .ua-field-label {
        display: block;
        font-size: 11px;
        color: #5b5b66;
        margin-bottom: 4px;
      }
      .ua-input {
        width: 100%;
        font-size: 13px;
        padding: 6px 8px;
        border: 1px solid #b1b1bc;
        border-radius: 4px;
        color: #15141a;
        background: #fff;
        font-family: inherit;
      }
      .ua-input:focus {
        outline: none;
        border-color: #0060df;
        box-shadow: 0 0 0 1px #0060df;
      }
      .ua-hint {
        font-size: 11px;
        color: #8f8f9d;
        margin: 4px 0 10px 0;
        min-height: 14px;
      }

      .ua-status {
        font-size: 12px;
        padding: 6px 8px;
        border-radius: 4px;
        margin-bottom: 10px;
      }
      .ua-status.ua-status-error { background: #fff0f0; color: #c50042; }
      .ua-status.ua-status-info { background: #f0f7ff; color: #0060df; }

      .ua-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ua-btn {
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        padding: 7px 12px;
        border-radius: 4px;
        border: 1px solid transparent;
        cursor: pointer;
        width: 100%;
      }
      .ua-btn-primary {
        background: #0060df;
        color: #ffffff;
      }
      .ua-btn-primary:hover:not(:disabled) { background: #0250bb; }
      .ua-btn-primary:disabled { background: #b1b1bc; cursor: not-allowed; }
      .ua-btn-secondary {
        background: #f0f0f4;
        color: #15141a;
        border-color: #cfcfd8;
      }
      .ua-btn-secondary:hover { background: #e0e0e6; }

      .ua-url-row {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .ua-url-row .ua-input { flex: 1; }
      .ua-url-row .ua-btn { width: auto; white-space: nowrap; }
    `;
    shadow.appendChild(style);
  }

  function wireUpPopup(shadow, inputEl) {
    const closeBtn = shadow.querySelector(".ua-close");
    const filenameInput = shadow.querySelector("#ua-filename");
    const hint = shadow.querySelector(".ua-hint");
    const dropzone = shadow.querySelector(".ua-dropzone");
    const uploadBtn = shadow.querySelector("#ua-btn-upload");
    const urlBtn = shadow.querySelector("#ua-btn-url");
    const customBtn = shadow.querySelector("#ua-btn-custom");
    const urlRow = shadow.querySelector(".ua-url-row");
    const urlInput = shadow.querySelector("#ua-url-input");
    const urlFetchBtn = shadow.querySelector("#ua-url-fetch");
    const status = shadow.querySelector(".ua-status");
    const preview = shadow.querySelector(".ua-preview");
    const thumb = shadow.querySelector(".ua-thumb");
    const badge = shadow.querySelector(".ua-filetype-badge");

    closeBtn.addEventListener("click", closePopup);

    // Track whether the filename field is still "auto" (following the live
    // clock) or has been manually customized (a literal from here on).
    let filenameMode = "auto";
    let tickTimer = null;

    function startTicking() {
      stopTicking();
      tickTimer = setInterval(() => {
        if (filenameMode !== "auto") return;
        setFilenameFromNow(shadow, /* preserveExt */ true);
      }, 1000);
    }
    function stopTicking() {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = null;
    }
    startTicking();

    filenameInput.addEventListener("input", () => {
      filenameMode = "manual";
      stopTicking();
      updateHint();
    });

    function updateHint() {
      hint.textContent =
        filenameMode === "manual"
          ? "Custom name — won't auto-update. Changing the extension converts the file on upload."
          : "Auto-updating with the current time. Edit to customize.";
    }
    updateHint();

    function showStatus(message, kind) {
      status.hidden = !message;
      status.textContent = message || "";
      status.className = "ua-status" + (kind ? ` ua-status-${kind}` : "");
    }

    function setFile(blob, suggestedName) {
      currentFile = { blob, name: suggestedName };
      updatePreview(blob);
      uploadBtn.disabled = false;

      // Only overwrite the filename field if the user hasn't customized it,
      // otherwise just make sure we keep a sensible extension available.
      const { ext } = splitName(filenameInput.value);
      const incomingExt = suggestedName ? splitName(suggestedName).ext : guessExtFromMime(blob.type);
      if (!ext && incomingExt) {
        filenameInput.value = filenameInput.value + "." + incomingExt;
      }
    }

    function updatePreview(blob) {
      preview.hidden = false;
      if (blob.type && blob.type.startsWith("image/")) {
        const url = URL.createObjectURL(blob);
        thumb.src = url;
        thumb.hidden = false;
        badge.hidden = true;
      } else {
        thumb.hidden = true;
        badge.hidden = false;
        const ext = splitName(filenameInput.value).ext || "file";
        badge.textContent = ext.slice(0, 4);
      }
    }

    // --- Clipboard paste ---
    dropzone.addEventListener("click", () => dropzone.focus());
    shadow.addEventListener("paste", (e) => handlePaste(e));
    popupHost.addEventListener("paste", (e) => handlePaste(e));

    function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            setFile(file, file.name);
            showStatus("Pasted from clipboard.", "info");
            return;
          }
        }
      }
    }

    // --- Drag and drop ---
    ["dragenter", "dragover"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("ua-dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("ua-dragover");
      })
    );
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        setFile(file, file.name);
        showStatus("File loaded.", "info");
      }
    });

    // --- Upload from URL ---
    urlBtn.addEventListener("click", () => {
      urlRow.hidden = !urlRow.hidden;
      if (!urlRow.hidden) urlInput.focus();
    });

    urlFetchBtn.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      showStatus("Fetching…", "info");
      urlFetchBtn.disabled = true;
      try {
        const response = await browser.runtime.sendMessage({ type: "UA_FETCH_URL", url });
        if (!response?.ok) {
          showStatus(response?.error || "Couldn't fetch that URL.", "error");
          return;
        }
        const blob = dataUrlToBlob(response.dataUrl);
        setFile(blob, response.filename);
        showStatus("Fetched from URL.", "info");
        urlRow.hidden = true;
      } catch (err) {
        showStatus(String(err?.message || err), "error");
      } finally {
        urlFetchBtn.disabled = false;
      }
    });

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") urlFetchBtn.click();
    });

    // --- Custom file picker ---
    customBtn.addEventListener("click", () => {
      suppressNextNativeClick = true;
      const handleChange = () => {
        inputEl.removeEventListener("change", handleChange);
        const file = inputEl.files?.[0];
        if (file) {
          // Reset the native input so the page doesn't see this as the
          // "real" selection yet — we still control final assignment.
          setFile(file, file.name);
          showStatus("File selected.", "info");
          reopenAtSamePosition();
        }
      };
      inputEl.addEventListener("change", handleChange);
      inputEl.click();
    });

    function reopenAtSamePosition() {
      // The popup stays open; just make sure it's still visible/positioned
      // (page layout may have shifted while the native picker was open).
      positionNear(popupHost, inputEl);
    }

    // --- Final upload ---
    uploadBtn.addEventListener("click", async () => {
      if (!currentFile) return;
      const finalName = filenameInput.value.trim() || "file";
      const { ext: targetExt } = splitName(finalName);
      showStatus("Preparing file…", "info");
      try {
        const finalBlob = await maybeConvert(currentFile.blob, targetExt);
        assignFileToInput(inputEl, finalBlob, finalName);
        showStatus("Uploaded.", "info");
        setTimeout(closePopup, 400);
      } catch (err) {
        showStatus("Couldn't convert file: " + String(err?.message || err), "error");
      }
    });

    filenameInput.addEventListener("input", () => {
      if (currentFile) updatePreview(currentFile.blob);
    });
  }

  function setFilenameFromNow(shadow, preserveExt) {
    const filenameInput = shadow.querySelector("#ua-filename");
    const stem = uaFormatDate(new Date(), settings.format);
    const currentExt = preserveExt ? splitName(filenameInput.value).ext : "";
    filenameInput.value = currentExt ? `${stem}.${currentExt}` : `${stem}`;
    if (!currentExt) {
      // No file loaded yet — show a placeholder extension slot visually via hint only;
      // actual default extension gets appended once a file is set.
    }
  }

  function splitName(filename) {
    const idx = filename.lastIndexOf(".");
    if (idx <= 0) return { stem: filename, ext: "" };
    return { stem: filename.slice(0, idx), ext: filename.slice(idx + 1) };
  }

  function guessExtFromMime(mime) {
    const map = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "application/pdf": "pdf",
      "text/plain": "txt",
    };
    return map[mime] || "";
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(",");
    const mimeMatch = /data:(.*?);base64/.exec(meta);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  const IMAGE_MIME_BY_EXT = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };

  /** If the target extension implies a different image format than the
   * current blob, re-encode via canvas. Otherwise return the blob as-is
   * (a plain rename). */
  async function maybeConvert(blob, targetExt) {
    const targetMime = IMAGE_MIME_BY_EXT[targetExt.toLowerCase()];
    if (!targetMime) return blob; // not a convertible image extension — plain rename
    if (blob.type === targetMime) return blob; // already correct format

    const isSourceImage = blob.type.startsWith("image/");
    if (!isSourceImage) return blob; // can't raster-convert non-images here

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Conversion failed"))),
        targetMime,
        0.92
      );
    });
  }

  function assignFileToInput(inputEl, blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
})();
