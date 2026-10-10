import { CLASSES, STATUSES } from "./data.js";

const STORAGE_UNOFFICIAL = "http-status:unofficial";
const STORAGE_THEME = "theme";
const THEMES = ["system", "light", "dark"];

const $ = (id) => document.getElementById(id);
const els = {
  search: $("search"),
  filters: $("class-filters"),
  unofficial: $("unofficial-toggle"),
  meta: $("result-meta"),
  results: $("results"),
  themeToggle: $("theme-toggle"),
  themeLabel: $("theme-label"),
};

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  },
};

const classNames = new Map(CLASSES.map((c) => [c.cls, c.name]));
for (const s of STATUSES) {
  s.haystack = [
    s.code, s.phrase, classNames.get(s.cls), ...s.aka, s.desc, s.note, s.source, ...s.tags, s.status,
    s.unofficial ? "unofficial" : "",
  ].filter(Boolean).join(" ").toLowerCase();
}
const byCode = new Map(STATUSES.map((s) => [s.code, s]));

const state = {
  query: "",
  cls: null,
  showUnofficial: storage.get(STORAGE_UNOFFICIAL) === "1",
  collapsed: new Set(),
  open: new Set(),
  closed: new Set(), // auto-opened rows the user closed again
  copied: null,
};

// ---------- matching ----------

// "404", "4", "40x", "4xx" match by code prefix; anything else is a word search.
const CODE_PATTERN = /^[1-5][0-9x]{0,2}$/;

function parseQuery(raw) {
  const q = raw.trim().toLowerCase();
  if (!q) return { kind: "all" };
  if (CODE_PATTERN.test(q)) {
    return { kind: "code", re: new RegExp("^" + q.replace(/x/g, "\\d")), exact: /^\d{3}$/.test(q) ? Number(q) : null };
  }
  return { kind: "text", tokens: q.split(/\s+/) };
}

function matches(status, query) {
  if (query.kind === "all") return true;
  if (query.kind === "code") return query.re.test(String(status.code));
  return query.tokens.every((t) => status.haystack.includes(t));
}

// ---------- html helpers ----------

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const richText = (str) => escapeHtml(str).replace(/`([^`]+)`/g, "<code>$1</code>");

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function highlight(text, query) {
  if (query.kind !== "text") return escapeHtml(text);
  const re = new RegExp(`(${query.tokens.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(re)
    .map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join("");
}

const CHEVRON = `<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
const ARROW = `<svg class="arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg>`;
const CHECK = `<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>`;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- rendering ----------

function badges(s) {
  const out = [];
  if (s.unofficial) out.push(`<span class="badge badge-unofficial">${escapeHtml(s.source)}</span>`);
  if (s.status === "deprecated") out.push(`<span class="badge badge-warn">deprecated</span>`);
  if (s.status === "unused") out.push(`<span class="badge badge-muted">unused</span>`);
  for (const t of s.tags) out.push(`<span class="badge badge-muted">${escapeHtml(t)}</span>`);
  return out.join("");
}

function copyButton(s, kind, label, text) {
  const key = `${s.code}:${kind}`;
  const copied = state.copied === key;
  return `<button type="button" class="chip${copied ? " is-copied" : ""}" data-action="copy" data-copy="${escapeHtml(text)}" data-key="${key}">${copied ? CHECK + "Copied" : escapeHtml(label)}</button>`;
}

function detail(s) {
  const facts = [];
  if (s.url) {
    facts.push(["Reference", `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.ref)}${ARROW}</a>`]);
  }
  if (s.unofficial) {
    facts.push(["Source", `${escapeHtml(s.source)} <span class="muted">— not in the IANA registry</span>`]);
  } else {
    facts.push(["Cacheable", s.cacheable ? "Yes, by default" : "No, unless headers say so"]);
  }
  if (s.aka.length) facts.push(["Also known as", s.aka.map(escapeHtml).join(", ")]);
  if (s.status === "deprecated") facts.push(["Registry", "Deprecated"]);
  if (s.status === "unused") facts.push(["Registry", "Reserved, not in use"]);

  const full = `${s.code} ${s.phrase}`;
  return `
    <div class="detail" id="d-${s.code}">
      <p class="desc">${richText(s.desc)}</p>
      ${s.note ? `<p class="note"><span class="note-label">Watch out</span>${richText(s.note)}</p>` : ""}
      <dl class="facts">
        ${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}
      </dl>
      <div class="copy-row">
        <span class="copy-label">Copy</span>
        ${copyButton(s, "line", full, full)}
        ${copyButton(s, "status", `HTTP/1.1 ${full}`, `HTTP/1.1 ${full}`)}
        ${copyButton(s, "link", "Link", linkFor(s.code))}
      </div>
    </div>`;
}

function row(s, query, isOpen) {
  const copied = state.copied === `${s.code}:code`;
  return `
    <div class="row tint-${s.cls}${isOpen ? " is-open" : ""}${s.unofficial ? " is-unofficial" : ""}" id="s-${s.code}">
      <button type="button" class="code${copied ? " is-copied" : ""}" data-action="copy" data-copy="${s.code}" data-key="${s.code}:code" aria-label="Copy ${s.code}" title="Copy code">
        <span class="code-num">${s.code}</span>${copied ? CHECK : ""}
      </button>
      <button type="button" class="row-toggle" data-action="toggle" data-code="${s.code}" data-key="${s.code}:toggle" aria-expanded="${isOpen}" aria-controls="d-${s.code}">
        <span class="phrase">${highlight(s.phrase, query)}</span>
        <span class="badges">${badges(s)}</span>
        ${CHEVRON}
      </button>
      ${isOpen ? detail(s) : ""}
    </div>`;
}

function render() {
  const query = parseQuery(state.query);
  const pool = STATUSES.filter((s) => state.showUnofficial || !s.unofficial);
  const matched = pool.filter((s) => matches(s, query));
  const visible = matched.filter((s) => state.cls === null || s.cls === state.cls);
  const hiddenUnofficial = state.showUnofficial
    ? 0
    : STATUSES.filter((s) => s.unofficial && matches(s, query) && (state.cls === null || s.cls === state.cls)).length;

  // An exact code, or a single result, opens on its own.
  const autoOpen = new Set();
  if (query.kind === "code" && query.exact && visible.some((s) => s.code === query.exact)) autoOpen.add(query.exact);
  else if (query.kind !== "all" && visible.length === 1) autoOpen.add(visible[0].code);

  renderFilters(matched);

  let meta = plural(visible.length, "code");
  if (state.cls !== null) meta += ` in ${state.cls}xx`;
  if (hiddenUnofficial && visible.length && query.kind !== "all") {
    meta += ` · <button type="button" class="link-button" data-action="show-unofficial" data-key="meta-unofficial">show ${hiddenUnofficial} unofficial</button>`;
  }
  els.meta.innerHTML = meta;

  if (!visible.length) {
    els.results.innerHTML = `
      <div class="empty">
        <p>No codes match “${escapeHtml(state.query.trim())}”${state.cls !== null ? ` in ${state.cls}xx` : ""}.</p>
        ${hiddenUnofficial ? `<button type="button" class="chip" data-action="show-unofficial" data-key="empty-unofficial">Show ${plural(hiddenUnofficial, "unofficial match")}</button>` : ""}
        ${state.cls !== null ? `<button type="button" class="chip" data-action="class" data-cls="" data-key="empty-all">Search all classes</button>` : ""}
      </div>`;
    return;
  }

  const searching = query.kind !== "all";
  els.results.innerHTML = CLASSES.map(({ cls, name }) => {
    const items = visible.filter((s) => s.cls === cls);
    if (!items.length) return "";
    const expanded = searching || !state.collapsed.has(cls);
    return `
      <section class="group" aria-label="${cls}xx ${name}">
        <button type="button" class="group-head" data-action="group" data-cls="${cls}" data-key="group:${cls}" aria-expanded="${expanded}">
          <span class="group-tag tint-${cls}">${cls}xx</span>
          <span class="group-name">${name}</span>
          <span class="group-count">${plural(items.length, "code")}</span>
          ${CHEVRON}
        </button>
        ${expanded ? `<div class="group-body">${items.map((s) => row(s, query, state.open.has(s.code) || (autoOpen.has(s.code) && !state.closed.has(s.code)))).join("")}</div>` : ""}
      </section>`;
  }).join("");
}

function renderFilters(matched) {
  const count = (cls) => matched.filter((s) => cls === null || s.cls === cls).length;
  const btn = (cls, label) => {
    const active = state.cls === cls;
    const n = count(cls);
    return `<button type="button" class="seg${active ? " is-active" : ""}${cls ? ` tint-${cls}` : ""}" data-action="class" data-cls="${cls ?? ""}" data-key="class:${cls ?? "all"}" aria-pressed="${active}"${n === 0 && !active ? " disabled" : ""}>
      ${label}<span class="seg-count">${n}</span></button>`;
  };
  els.filters.innerHTML = btn(null, "All") + CLASSES.map(({ cls }) => btn(cls, `${cls}xx`)).join("");
}

// Re-rendering replaces buttons, so keep keyboard focus on the logical control.
function update() {
  const key = document.activeElement?.dataset?.key;
  render();
  if (key) document.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

// ---------- url sync ----------

function linkFor(code) {
  return `${location.origin}${location.pathname}#${code}`;
}

function syncUrl(hashCode) {
  const params = new URLSearchParams(location.search);
  const q = state.query.trim();
  if (q) params.set("q", q); else params.delete("q");
  const search = params.toString();
  const hash = hashCode === undefined ? location.hash : hashCode ? `#${hashCode}` : "";
  history.replaceState(null, "", `${location.pathname}${search ? `?${search}` : ""}${hash}`);
}

// ---------- actions ----------

async function copy(text, key) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.className = "visually-hidden";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  state.copied = key;
  update();
  clearTimeout(copy.timer);
  copy.timer = setTimeout(() => {
    state.copied = null;
    update();
  }, 1200);
}

function setUnofficial(on, persist = true) {
  state.showUnofficial = on;
  els.unofficial.checked = on;
  if (persist) storage.set(STORAGE_UNOFFICIAL, on ? "1" : null);
}

els.results.addEventListener("click", handleAction);
els.meta.addEventListener("click", handleAction);
els.filters.addEventListener("click", handleAction);

function handleAction(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;

  if (action === "copy") {
    copy(target.dataset.copy, target.dataset.key);
  } else if (action === "toggle") {
    const code = Number(target.dataset.code);
    if (target.getAttribute("aria-expanded") === "true") {
      state.open.delete(code);
      state.closed.add(code);
      if (location.hash === `#${code}`) syncUrl(null);
    } else {
      state.open.add(code);
      state.closed.delete(code);
      syncUrl(code);
    }
    update();
  } else if (action === "group") {
    const cls = Number(target.dataset.cls);
    if (state.collapsed.has(cls)) state.collapsed.delete(cls); else state.collapsed.add(cls);
    update();
  } else if (action === "class") {
    const cls = target.dataset.cls ? Number(target.dataset.cls) : null;
    state.cls = state.cls === cls ? null : cls;
    update();
  } else if (action === "show-unofficial") {
    setUnofficial(true);
    update();
    els.search.focus();
  }
}

// ---------- search & keyboard ----------

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  state.closed.clear();
  syncUrl();
  render();
});

els.search.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (els.search.value) {
      els.search.value = "";
      els.search.dispatchEvent(new Event("input"));
    } else {
      els.search.blur();
    }
  } else if (event.key === "Enter") {
    const first = els.results.querySelector(".row-toggle");
    if (!first) return;
    event.preventDefault();
    if (first.getAttribute("aria-expanded") !== "true") first.click();
    els.results.querySelector(`[data-key="${first.dataset.key}"]`)?.focus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  event.preventDefault();
  els.search.focus();
  els.search.select();
});

els.unofficial.addEventListener("change", () => {
  setUnofficial(els.unofficial.checked);
  render();
});

// ---------- theme ----------

function currentTheme() {
  const t = storage.get(STORAGE_THEME);
  return THEMES.includes(t) ? t : "system";
}

function applyTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  els.themeLabel.textContent = theme;
  els.themeToggle.setAttribute("aria-label", `Theme: ${theme}. Switch theme`);
}

els.themeToggle.addEventListener("click", () => {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  storage.set(STORAGE_THEME, next === "system" ? null : next);
  applyTheme(next);
});

// ---------- init ----------

function openFromHash() {
  const match = /^#(\d{3})$/.exec(location.hash);
  const status = match && byCode.get(Number(match[1]));
  if (!status) return;
  if (status.unofficial && !state.showUnofficial) setUnofficial(true, false);
  if (state.cls !== null && state.cls !== status.cls) state.cls = null;
  state.open.add(status.code);
  state.closed.delete(status.code);
  state.collapsed.delete(status.cls);
  render();
  document.getElementById(`s-${status.code}`)?.scrollIntoView({ block: "center" });
}

const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery) {
  state.query = initialQuery;
  els.search.value = initialQuery;
}
els.unofficial.checked = state.showUnofficial;
applyTheme(currentTheme());
render();
openFromHash();
window.addEventListener("hashchange", openFromHash);
