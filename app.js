const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 20;

const KEEPERS = /todo|fixme|hack|xxx|note:|copyright|license|spdx|eslint|prettier|ts-ignore|ts-expect|nolint|noqa|pragma|deprecated/i;
const TELLS =
  /\b(real unlock|load[- ]bearing|acceptance ladder|byte for byte|rapidly evolving|leverage|seamless|robust solution|comprehensive|cutting[- ]edge|it's important to note|in order to|this function(?:ality)? (?:is|will|ensures)|delve|utilize|holistic|synerg|unlock the|production[- ]grade|battle[- ]tested)\b/i;

const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|vendor|\.next)(\/|$)/;

const els = {
  drop: document.getElementById("drop"),
  file: document.getElementById("file"),
  pick: document.getElementById("pick"),
  sample: document.getElementById("sample"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  counts: document.getElementById("counts"),
  preview: document.getElementById("preview"),
  run: document.getElementById("run"),
};

let results = [];

function setError(msg) {
  els.error.hidden = !msg;
  els.error.textContent = msg ? [els.error.textContent, msg].filter(Boolean).join(" ") : "";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isTexty(name) {
  return /\.(js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|c|h|cpp|cc|cs|rb|php|swift|kt|scala|sql|css|html|md|json|yml|yaml|toml|sh)$/i.test(
    name
  );
}

function kind(name) {
  if (/\.(py|rb|sh|yml|yaml|toml)$/i.test(name)) return "hash";
  if (/\.(sql)$/i.test(name)) return "sql";
  if (/\.(html|md)$/i.test(name)) return "html";
  return "c";
}

function isSlop(text) {
  const t = text.replace(/^[\s/*#<!\-]+/gm, "").trim();
  if (!t) return false;
  if (KEEPERS.test(t)) return false;
  const lines = t.split(/\n/).filter(Boolean);
  if (TELLS.test(t)) return true;
  if (lines.length >= 6) return true;
  if (t.length >= 280 && lines.length >= 3) return true;
  if (t.length >= 160 && /this (function|method|class|module|component)/i.test(t)) return true;
  return false;
}

function stripC(src) {
  let i = 0;
  let out = "";
  let cut = [];
  const n = src.length;
  while (i < n) {
    if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const q = src[i];
      let j = i + 1;
      out += src[i];
      while (j < n) {
        out += src[j];
        if (src[j] === "\\") {
          j += 1;
          if (j < n) out += src[j];
        } else if (src[j] === q) {
          j += 1;
          break;
        }
        j += 1;
      }
      i = j;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j += 1;
      const block = src.slice(i, j);
      if (isSlop(block)) {
        cut.push(block);
        i = j;
        continue;
      }
      out += block;
      i = j;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j === -1 ? n : j + 2;
      const block = src.slice(i, end);
      if (isSlop(block)) {
        cut.push(block);
        out += block.includes("\n") ? block.replace(/[^\n]/g, "") : " ";
        i = end;
        continue;
      }
      out += block;
      i = end;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return { cleaned: collapse(out), cut };
}

function stripHash(src, prefix) {
  const lines = src.split("\n");
  const cut = [];
  const kept = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const text = run.join("\n");
    if (isSlop(text)) cut.push(text);
    else kept.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (line.trimStart().startsWith(prefix) && !line.trimStart().startsWith("#!")) {
      run.push(line);
    } else {
      flush();
      kept.push(line);
    }
  }
  flush();
  return { cleaned: collapse(kept.join("\n")), cut };
}

function stripHtml(src) {
  const cut = [];
  const cleaned = src.replace(/<!--([\s\S]*?)-->/g, (full, inner) => {
    if (isSlop(inner)) {
      cut.push(full);
      return "";
    }
    return full;
  });
  return { cleaned: collapse(cleaned), cut };
}

function collapse(s) {
  return s;
}

function stripFile(name, src) {
  const k = kind(name);
  if (k === "hash") return stripHash(src, "#");
  if (k === "sql") return stripHash(src, "--");
  if (k === "html") return stripHtml(src);
  return stripC(src);
}

function linesRemoved(chunks) {
  return chunks.reduce((n, c) => n + c.split("\n").length, 0);
}

function render() {
  const files = results.length;
  const cuts = results.reduce((n, r) => n + r.cut.length, 0);
  const lines = results.reduce((n, r) => n + linesRemoved(r.cut), 0);
  els.status.textContent = files
    ? `${files} file${files === 1 ? "" : "s"} · ${cuts} comment${cuts === 1 ? "" : "s"} cut · files stayed in this tab`
    : "Waiting for a file.";
  els.counts.hidden = !files;
  document.getElementById("c-files").textContent = String(files);
  document.getElementById("c-cut").textContent = String(cuts);
  document.getElementById("c-lines").textContent = String(lines);
  const first = results[0];
  els.preview.hidden = !first;
  if (first) {
    const shown = first.cut
      .slice(0, 8)
      .map((c) => `<mark>${escapeHtml(c.trim())}</mark>`)
      .join("\n\n");
    els.preview.innerHTML =
      `<strong>${escapeHtml(first.name)}</strong>\n` +
      (shown || "(nothing cut in the first file)");
  }
  els.run.disabled = !results.some((r) => r.cut.length);
}

async function addFiles(list) {
  setError("");
  for (const file of list) {
    if (results.length >= MAX_FILES) {
      setError(`Cap is ${MAX_FILES} files.`);
      break;
    }
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is over 8 MB.`);
      continue;
    }
    if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
      try {
        await fromZip(file);
      } catch (err) {
        setError(`${file.name}: could not read archive.`);
      }
      continue;
    }
    if (!isTexty(file.name)) {
      setError(`${file.name} is not a source file I know.`);
      continue;
    }
    try {
      const src = await file.text();
      const { cleaned, cut } = stripFile(file.name, src);
      results.push({ name: file.name, cleaned, cut });
    } catch (err) {
      setError(`${file.name}: could not read source.`);
    }
  }
  render();
}

async function fromZip(file) {
  const zip = await JSZip.loadAsync(file);
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir && isTexty(p) && !SKIP_DIR.test(p));
  for (const path of paths) {
    if (results.length >= MAX_FILES) {
      setError(`Cap is ${MAX_FILES} files; remaining archive sources were skipped.`);
      break;
    }
    const data = await zip.files[path].async("uint8array");
    if (data.byteLength > MAX_BYTES) {
      setError(`${path} is over 8 MB after extraction; skipped.`);
      continue;
    }
    const src = new TextDecoder().decode(data);
    const { cleaned, cut } = stripFile(path, src);
    results.push({ name: path, cleaned, cut });
  }
}

const SAMPLE = `/**
 * This function is a robust, production-grade helper that will
 * comprehensively leverage a seamless approach to sum two numbers
 * on the load bearing path. The real unlock is byte for byte
 * identical arithmetic. It's important to note the acceptance ladder.
 */
export function add(a, b) {
  // TODO: handle overflow
  return a + b; // sum
}
`;

els.pick.addEventListener("click", () => els.file.click());
els.file.addEventListener("change", () => {
  addFiles([...els.file.files]);
  els.file.value = "";
});
els.sample.addEventListener("click", () => {
  const { cleaned, cut } = stripFile("add.js", SAMPLE);
  results = [{ name: "add.js", cleaned, cut }];
  setError("");
  render();
});
els.run.addEventListener("click", async () => {
  const zip = new JSZip();
  for (const r of results) zip.file(r.name, r.cleaned);
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "slopcut-clean.zip";
  a.click();
  URL.revokeObjectURL(a.href);
});

["dragenter", "dragover"].forEach((ev) => {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.add("over");
  });
});
els.drop.addEventListener("dragleave", () => els.drop.classList.remove("over"));
els.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  els.drop.classList.remove("over");
  addFiles([...e.dataTransfer.files]);
});

render();
