/**
 * Filename formatting: turns a Date + a format string into a filename stem.
 *
 * Tokens (case-sensitive), each repeatable for a longer representation:
 *   Y   year        Y=00-style last 2 digits repeated / YYYY=full 4 digits
 *   M   month       M=1, MM=01, MMM... clamps to 2 digits (months only go to 12)
 *   D   day         D=1, DD=01
 *   H   hour (24h)  H=1, HH=01
 *   m   minute      m=1, mm=01   (lowercase, to disambiguate from month)
 *   s   second      s=1, ss=01
 *
 * Anything that is not one of these letters is treated as a literal
 * separator and passed through unchanged (e.g. "-", "_", ".").
 */

const UA_TOKEN_ORDER = ["YYYY", "YY", "Y", "MM", "M", "DD", "D", "HH", "H", "mm", "m", "ss", "s"];

const UA_DEFAULT_FORMAT = "YYYY-MM-DD_HH-mm-ss";

function uaPad(n, width) {
  const s = String(n);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

/** Render a Date into a filename stem (no extension) using the given format string. */
function uaFormatDate(date, format) {
  const Y = date.getFullYear();
  const M = date.getMonth() + 1;
  const D = date.getDate();
  const H = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();

  let out = "";
  let i = 0;
  while (i < format.length) {
    const ch = format[i];
    // Count run length of the same token character (Y/M/D/H, case-sensitive;
    // 'm' and 's' are their own runs too).
    if ("YMDHms".includes(ch)) {
      let j = i;
      while (j < format.length && format[j] === ch) j++;
      const run = j - i;
      out += uaRenderToken(ch, run, { Y, M, D, H, m, s });
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function uaRenderToken(letter, run, vals) {
  switch (letter) {
    case "Y": {
      if (run >= 4) return uaPad(vals.Y, 4);
      if (run === 1) return String(vals.Y);
      // Y, YY, YYY all give a 2-digit "short year" style; YY is the common case.
      return uaPad(vals.Y % 100, 2);
    }
    case "M":
      return run === 1 ? String(vals.M) : uaPad(vals.M, 2);
    case "D":
      return run === 1 ? String(vals.D) : uaPad(vals.D, 2);
    case "H":
      return run === 1 ? String(vals.H) : uaPad(vals.H, 2);
    case "m":
      return run === 1 ? String(vals.m) : uaPad(vals.m, 2);
    case "s":
      return run === 1 ? String(vals.s) : uaPad(vals.s, 2);
    default:
      return "";
  }
}

/** Split "name.ext" into { stem, ext } (ext excludes the dot; may be ""). */
function uaSplitFilename(filename) {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { stem: filename, ext: "" };
  return { stem: filename.slice(0, idx), ext: filename.slice(idx + 1) };
}

/**
 * Try to infer a format string from a stem the user typed, by diffing it
 * against what today's date renders as for a set of candidate formats.
 * This is best-effort: we fall back to treating the whole thing as a
 * literal (non-regenerating) name if nothing matches.
 *
 * We take a simpler, robust approach: rather than reverse-parsing arbitrary
 * text, we only re-derive the format when the stem still looks like a
 * timestamp shaped like the *current* configured format's punctuation
 * skeleton with digit runs matching token widths. Otherwise the typed stem
 * is kept as a literal string going forward (no more auto-updating).
 */
function uaSkeletonOf(format) {
  // Replace each token run with a marker of its length, keep literals.
  let out = "";
  let i = 0;
  while (i < format.length) {
    const ch = format[i];
    if ("YMDHms".includes(ch)) {
      let j = i;
      while (j < format.length && format[j] === ch) j++;
      out += "#".repeat(j - i);
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Does `stem` match the digit/literal skeleton of `format`? */
function uaMatchesFormatShape(stem, format) {
  const skeleton = uaSkeletonOf(format);
  if (stem.length !== skeleton.length) return false;
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i] === "#") {
      if (!/[0-9]/.test(stem[i])) return false;
    } else if (skeleton[i] !== stem[i]) {
      return false;
    }
  }
  return true;
}

if (typeof module !== "undefined") {
  module.exports = {
    uaFormatDate,
    uaSplitFilename,
    uaMatchesFormatShape,
    uaSkeletonOf,
    UA_DEFAULT_FORMAT,
  };
}
