import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import random from "graphology-layout/random.js";
import Sigma from "sigma";
// import drawLabel from "sigma/rendering/canvas/label";

const palette = {
  background: "#0b1117",
  accent:     "#b7d9ff",
  edgeDefault:"#151823",
  edgeHighlight:"#90c2ff",
};

// For genres
const COLORS = { "Techno": "#546E7A", "House": "#373258", "Hip Hop": "#FAF29E",
                 "Latin": "#98E6A4", "Daria": "#EAC3DE", "Breaks": "#D9D9D9",
                 "Dubstep": "#0D6986", "Pop": "#83C2DD", "RnB": "#583232",
                 "IDM": "#BFEDCC", "Death Drive": "#26303E" };

const container = document.getElementById("sigma-container");
container.style.background = palette.background;

const byId = (id) => document.getElementById(id) || null;
const elHideOrphans = byId("hideOrphans");

// Song information panel references
const sp = {
  title: byId("sp-title"),
  artist: byId("sp-artist"),
  bpm: byId("sp-bpm"),
  key: byId("sp-key"),
  playlists: byId("sp-playlists"),
  playcount: byId("sp-playcount"),
  genre: byId("sp-genre"),
  vibe: byId("sp-vibe"),
  intensity: byId("sp-intensity"),
};

// Load the graph from DB (generated using process-date.js)
let graph = null;
{
  const res = await fetch("/graph.json");
  const data = await res.json();
  graph = Graph.from(data);
}
random.assign(graph, { scale: 1 });

const renderer = new Sigma(graph, container);

// Label styling (white + custom font)
renderer.setSetting("labelFont", "system-ui");
renderer.setSetting("labelWeight", "250");
renderer.setSetting("labelColor", { mode: "override", color: "#888888AA" });
renderer.setSetting("hoverRenderer", () => {});

let hoveredNode = null;
let hoveredEdge = null;
let selectedNode = null; // sticky selection via click

// Song panel helper functions
function textOrDash(x) {
  if (x === null || x === undefined) return "—";
  if (Array.isArray(x)) return x.length ? x.join(", ") : "—";
  const s = String(x).trim();
  return s ? s : "—";
}

function joinOrDash(list) {
  return Array.isArray(list) && list.length ? list.join(", ") : "—";
}

function renderSongPanel(nodeId) {
  if (!nodeId || !graph.hasNode(nodeId)) {
    sp.title.textContent = "None selected";
    sp.artist.textContent = "-";
    sp.bpm.textContent = "-";
    sp.key.textContent = "-";
    sp.playlists.textContent = "-";
    sp.playcount.textContent = "-";
    sp.genre.textContent = "-";
    sp.vibe.textContent = "-";
    sp.intensity.textContent = "-";
    return;
  }
  const a = graph.getNodeAttributes(nodeId);
  const d = a.data || {};

  sp.title.textContent = a.label ?? nodeId;
  sp.artist.textContent = textOrDash(d.Artist);
  sp.bpm.textContent = textOrDash(d.BPM);
  sp.key.textContent = textOrDash(d.Key);
  sp.playlists.textContent = textOrDash(d.Playlists);
  sp.playcount.textContent = textOrDash(d["Play Count"]);
  sp.genre.textContent     = joinOrDash(d.Genre);
  sp.vibe.textContent      = joinOrDash(d.Vibe);
  sp.intensity.textContent = joinOrDash(d.Intensity);
}

renderSongPanel(null);

// Render Color Key
function mountGenreKey(colors) {
  const key = document.createElement("aside");
  key.id = "genre-key";

  const title = document.createElement("h3");
  title.textContent = "Genre Key";
  key.appendChild(title);

  const entries = Object.entries(colors).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [name, color] of entries) {
    const row = document.createElement("div");
    row.className = "legend-item";

    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = color;

    const label = document.createElement("span");
    label.textContent = name;

    row.appendChild(sw);
    row.appendChild(label);
    key.appendChild(row);
  }

  document.body.appendChild(key);
}
mountGenreKey(COLORS);

// Playlist + Tags picker
let activeKind = null;
let activeValue = null;

function normList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map(String).map(s => s.trim()).filter(Boolean);
  return String(x).split(/[|,;/]/).map(s => s.trim()).filter(Boolean);
}

// Collate tag + playlist information
function collectLists() {
  const playlists = new Set();
  const tags = new Set();

  graph.forEachNode((n, attr) => {
    const d = (attr && attr.data) || {};

    normList(d.Playlists).forEach(v => playlists.add(v));
    normList(d.Tags).forEach(v => tags.add(v));
    normList(d.Genre).forEach(v => tags.add(v));
    normList(d.Vibe).forEach(v => tags.add(v));
    normList(d.Intensity).forEach(v => tags.add(v));
  });

  return {
    playlists: Array.from(playlists).sort((a, b) => a.localeCompare(b)),
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
  };
}

// Used to determine if a node is in a given playlist or tag.
// Used by the reducer
function nodeMatchesTagOrList(id) {
  if (!activeKind || !activeValue) return false;
  const a = graph.getNodeAttributes(id);
  const d = (a && a.data) || {};

  if (activeKind === "playlist") {
    const lists = normList(d.Playlists ?? d.playlists);
    return lists.includes(activeValue);
  } else {
    // tag match across multiple fields
    if (normList(d.Tags ?? d.tags).includes(activeValue)) return true;
    if (normList(d.Genre).includes(activeValue)) return true;
    if (normList(d.Vibe).includes(activeValue)) return true;
    if (normList(d.Intensity).includes(activeValue)) return true;
    return false;
  }
}

// Create panel for picking which tag / playlist to highlight
function mountHighlightPanelLeft() {
  const menu = document.getElementById("menu") || document.body;

  // insert directly after the song panel area
  const songAnchor =
    document.getElementById("song-panel") ||
    sp.title?.closest(".card") ||
    sp.title?.parentElement ||
    menu;

  const el = document.createElement("section");
  el.id = "highlight-panel";
  el.innerHTML = `
    <h3>Highlight</h3>
    <label for="hl-select">Playlist / Tag</label>
    <select id="hl-select"></select>
    <button id="hl-clear" type="button">Clear</button>
    <p class="muted">Highlights nodes with the selected tag / in chosen playlist.</p>
  `;

  if (songAnchor.nextSibling) menu.insertBefore(el, songAnchor.nextSibling);
  else menu.appendChild(el);

  // Create two option subgroups for select
  const { playlists, tags } = collectLists();
  const select = el.querySelector("#hl-select");

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "— None —";
  select.appendChild(optNone);

  if (playlists.length) {
    const og = document.createElement("optgroup");
    og.label = "Playlists";
    playlists.forEach(name => {
      const o = document.createElement("option");
      o.value = `P::${name}`;
      o.textContent = name;
      og.appendChild(o);
    });
    select.appendChild(og);
  }

  if (tags.length) {
    const og = document.createElement("optgroup");
    og.label = "Tags";
    tags.forEach(name => {
      const o = document.createElement("option");
      o.value = `T::${name}`;
      o.textContent = name;
      og.appendChild(o);
    });
    select.appendChild(og);
  }

  select.addEventListener("change", () => {
    const v = select.value;
    if (!v) { activeKind = null; activeValue = null; renderer.refresh(); return; }
    const [kind, val] = v.split("::");
    activeKind = (kind === "P") ? "playlist" : "tag";
    activeValue = val;
    renderer.refresh();
  });

  el.querySelector("#hl-clear").addEventListener("click", () => {
    activeKind = null;
    activeValue = null;
    select.value = "";
    renderer.refresh();
  });
}
mountHighlightPanelLeft();

// Highlight edges by set / date selection
let activeDate = null;

async function fetchSessionNames() {
  const res = await fetch("/session_names.txt");
  const text = await res.text();
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function edgeMatchesDate(eid) {
  if (!activeDate) return false;
  const a = graph.getEdgeAttributes(eid) || {};
  if (!a.Sessions) return false;
  return a.Sessions.some(s => String(s).trim() === activeDate);
}

// Create the panel for selecting sets to view
async function mountDatePanelLeft() {
  const menu = document.getElementById("menu") || document.body;
  const anchor =
    document.getElementById("highlight-panel") ||
    document.getElementById("song-panel") ||
    menu;

  const el = document.createElement("section");
  el.id = "date-panel";
  el.innerHTML = `
    <h3>Highlight by Date</h3>
    <label for="date-select">Session</label>
    <select id="date-select">
      <option value="">— None —</option>
    </select>
    <button id="date-clear" type="button">Clear</button>
    <p class="muted">Select set to highlight its transitions.</p>
  `;

  (anchor.nextSibling) ? menu.insertBefore(el, anchor.nextSibling) : menu.appendChild(el);

  const select = el.querySelector("#date-select");
  const names = await fetchSessionNames();
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    activeDate = select.value || null;
    renderer.refresh();
  });
  el.querySelector("#date-clear").addEventListener("click", () => {
    activeDate = null;
    select.value = "";
    renderer.refresh();
  });
}
mountDatePanelLeft();

// Reducers: Used to highlight / dim edges and nodes in special circumstances

renderer.setSetting("nodeReducer", (n, data) => {
  if (elHideOrphans?.checked && graph.degree(n) === 0)
    return { ...data, hidden: true };

  const focusNode = selectedNode ?? hoveredNode;
  const isFocused = n === focusNode;

  const isMatch = nodeMatchesTagOrList(n);
  const baseColor = data.color ?? palette.accent;
  const dimColor  = "#1B1D27";

  // Size/opacity treatment
  const size =
    isFocused ? data.size * 1.35 :
    activeKind ? (isMatch ? data.size * 1.25 : data.size * 0.95) : data.size;

  const color =
    isFocused ? palette.accent :
    activeKind ? (isMatch ? baseColor : dimColor) : baseColor;

  return {
    ...data,
    color,
    size,
    labelColor: "#bbb",
    forceLabel: isFocused,
  };
});

renderer.setSetting("edgeReducer", (e, data) => {
  const attr = graph.getEdgeAttributes(e) || {};
  const isHovered = e === hoveredEdge;

  // Helper: clamp width so it never exceeds the smaller endpoint radius (minus 1px)
  const clampToNodes = (w) => {
    const s = graph.source(e), t = graph.target(e);
    const sSize = graph.getNodeAttributes(s)?.size ?? 1;
    const tSize = graph.getNodeAttributes(t)?.size ?? 1;
    const cap = Math.max(0.1, Math.min(sSize, tSize) - 1);
    return Math.min(w, cap);
  };

  // If date filter is on, only show edges whose sessions include the activeDate
  if (activeDate) {
    const matches = edgeMatchesDate(e);
    if (!matches) return { ...data, hidden: true };

    return {
      ...data,
      hidden: false,
      color: palette.edgeHighlight,
      size: clampToNodes(attr.Weight),
    };
  }

  // If a node is selected, keep only the connected edges
  if (selectedNode) {
    const touches = graph.source(e) === selectedNode || graph.target(e) === selectedNode;
    if (!touches) return { ...data, hidden: true };
    return {
      ...data,
      hidden: false,
      color: palette.edgeHighlight,
      size: clampToNodes(attr.Weight),
    };
  }

  // Default: only hovered edges get weight, others stay thin
  return {
    ...data,
    hidden: false,
    color: isHovered ? palette.edgeHighlight : palette.edgeDefault,
    size: isHovered ? clampToNodes(attr.Weight) : (data.size ?? 0.1),
  };
});

// Orphans
elHideOrphans?.addEventListener("change", () => renderer.refresh());

renderer.on("enterEdge", ({ edge }) => {
  hoveredEdge = edge;
  renderer.refresh();
});
renderer.on("leaveEdge", () => {
  hoveredEdge = null;
  renderer.refresh();
});

// Activates sticky hover on click
renderer.on("clickNode", ({ node }) => {
  selectedNode = node;
  hoveredNode = null;
  hoveredEdge = null;
  renderSongPanel(node);
  renderer.refresh();
});

// Removes sticky hover when background clicked
renderer.on("clickStage", () => {
  selectedNode = null;
  hoveredNode = null;
  hoveredEdge = null;
  renderSongPanel(null);
  renderer.refresh();
});


// THE COOLEST PART: THE FIZZIX
const baseFA2 = {
  gravity: 0.06,
  scalingRatio: 20,
  barnesHutOptimize: true,
  linLogMode: true,
};

// Physics sim config
const SLOW_INIT = 5;
const SLOW_RESET = 20;
const SLOW_MAX = 1000;
const STARTUP_DELAY_MS = 15000;
const GROWTH_PER_FRAME = 1.015;
const FRAME_MS = 1000 / 60;
const GROWTH_RATE = Math.log(GROWTH_PER_FRAME);

let slowdown = SLOW_INIT;
let lastInteraction = performance.now();
let hasInteracted = false;

let tickRaf = null;
let lastTickTime = performance.now();

// helpers to start/stop the sim cleanly
function startSim() {
  if (tickRaf == null) {
    lastTickTime = performance.now();
    tickRaf = requestAnimationFrame(tick);
  }
}
function stopSim() {
  if (tickRaf != null) {
    cancelAnimationFrame(tickRaf);
    tickRaf = null;
  }
}

// returns { atCap } so the tick can decide to stop the sim
function updateSlowdown(now) {
  const idle = now - lastInteraction;
  const delay = hasInteracted ? 0 : STARTUP_DELAY_MS
  const base = hasInteracted ? SLOW_RESET : SLOW_INIT;

  if (idle <= delay) {
    slowdown = base;
    return { atCap: false };
  }

  // Exponential ramp, frame-rate independent:
  const dt = now - lastTickTime;
  const frames = dt / FRAME_MS;
  const factor = Math.exp(GROWTH_RATE * frames);
  slowdown = Math.min(SLOW_MAX, slowdown * factor);

  return { atCap: slowdown >= SLOW_MAX - 1e-6 };
}

function layoutStep() {
  forceAtlas2.assign(graph, {
    iterations: 20,
    settings: { ...baseFA2, slowDown: slowdown },
  });
}

function tick(now) {
  const { atCap } = updateSlowdown(now);
  if (atCap) {
    stopSim(); // freeze when at cap
    return;
  }
  layoutStep();
  lastTickTime = now;
  tickRaf = requestAnimationFrame(tick);
}

// Start physics on load
layoutStep();
startSim();

// Dragging physics
let isDragging = false, draggedNode = null;

// Reset helper: called on interaction
function reheat() {
  hasInteracted = true;
  lastInteraction = performance.now();
  slowdown = SLOW_RESET;
  startSim();
}

// Event handlers
renderer.on("downNode", ({ node }) => {
  isDragging = true;
  draggedNode = node;
  reheat();
});

renderer.getMouseCaptor().on("mousemovebody", (e) => {
  if (!isDragging || !draggedNode) return;
  const p = renderer.viewportToGraph(e);
  graph.setNodeAttribute(draggedNode, "x", p.x);
  graph.setNodeAttribute(draggedNode, "y", p.y);
  e.preventSigmaDefault();
  e.original?.preventDefault();
  reheat();
});

renderer.getMouseCaptor().on("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  draggedNode = null;
  reheat();
});
