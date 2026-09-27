if (typeof browser === "undefined") {
  globalThis.browser = globalThis.chrome;
}

const DEFAULT_SETTINGS = {
  format: "YYYY-MM-DD_HH-mm-ss",
  enabled: true,
};

const formatInput = document.getElementById("format");
const enabledInput = document.getElementById("enabled");
const preview = document.getElementById("preview");
const saveBtn = document.getElementById("save");
const savedMsg = document.getElementById("saved-msg");

init();

async function init() {
  const stored = await browser.storage.sync.get("uaSettings");
  const settings = { ...DEFAULT_SETTINGS, ...(stored.uaSettings || {}) };
  formatInput.value = settings.format;
  enabledInput.checked = settings.enabled;
  updatePreview();
  updateLegendExamples();

  formatInput.addEventListener("input", updatePreview);
  setInterval(updatePreview, 1000);

  saveBtn.addEventListener("click", async () => {
    await browser.storage.sync.set({
      uaSettings: {
        format: formatInput.value.trim() || DEFAULT_SETTINGS.format,
        enabled: enabledInput.checked,
      },
    });
    savedMsg.hidden = false;
    setTimeout(() => (savedMsg.hidden = true), 1500);
  });
}

function updatePreview() {
  try {
    preview.textContent = uaFormatDate(new Date(), formatInput.value || DEFAULT_SETTINGS.format);
  } catch {
    preview.textContent = "(invalid format)";
  }
}

function updateLegendExamples() {
  const now = new Date();
  document.getElementById("ex-Y").textContent = `${uaFormatDate(now, "YY")} / ${uaFormatDate(now, "YYYY")}`;
  document.getElementById("ex-M").textContent = `${uaFormatDate(now, "M")} / ${uaFormatDate(now, "MM")}`;
  document.getElementById("ex-D").textContent = `${uaFormatDate(now, "D")} / ${uaFormatDate(now, "DD")}`;
  document.getElementById("ex-H").textContent = `${uaFormatDate(now, "H")} / ${uaFormatDate(now, "HH")}`;
  document.getElementById("ex-m").textContent = `${uaFormatDate(now, "m")} / ${uaFormatDate(now, "mm")}`;
  document.getElementById("ex-s").textContent = `${uaFormatDate(now, "s")} / ${uaFormatDate(now, "ss")}`;
}
