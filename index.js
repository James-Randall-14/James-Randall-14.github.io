import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular.js";
import Sigma from "sigma";

// ---- Load graph ----
let graph = null;
await fetch("/graph.json")
  .then((res) => res.json())
  .then((data) => (graph = Graph.from(data)));

circular.assign(graph);

// ---- Layout settings ----
let slowdown = 100;
const settings = {
  slowDown: slowdown,
  gravity: 0.05,
  scalingRatio: 10,
  barnesHutOptimize: true,
};

// ---- State ----
let settled = false; // instead of stopping the loop
let isDragging = false;
let draggedNode = null;

// ---- Persistent layout loop ----
function layoutLoop() {
  // Always run — but skip heavy work when fully settled
  if (!settled || isDragging) {
    forceAtlas2.assign(graph, { iterations: 1, settings });

    if (!isDragging) {
      slowdown *= 1.02;
      settings.slowDown = slowdown;
      if (slowdown > 8000) {
        settled = true;
        console.log("Layout settled.");
      }
    }
  }

  requestAnimationFrame(layoutLoop); // loop forever
}
layoutLoop();

// ---- Renderer ----
const container = document.getElementById("sigma-container");
const renderer = new Sigma(graph, container);

// ---- Drag handling ----
renderer.on("downNode", ({ node }) => {
  draggedNode = node;
  isDragging = true;
  settled = false;       // wake up simulation
  slowdown = 100;        // reset damping
  settings.slowDown = slowdown;
  renderer.getMouseCaptor().disableCameraMoves();
});

renderer.getMouseCaptor().on("mousemovebody", (e) => {
  if (!isDragging || !draggedNode) return;

  const pos = renderer.viewportToGraph(e);
  graph.setNodeAttribute(draggedNode, "x", pos.x);
  graph.setNodeAttribute(draggedNode, "y", pos.y);

  e.preventSigmaDefault();
  e.original.preventDefault();
});

renderer.getMouseCaptor().on("mouseup", () => {
  if (isDragging && draggedNode) {
    isDragging = false;
    draggedNode = null;
    renderer.getMouseCaptor().enableCameraMoves();

    // allow the graph to settle again
    slowdown = 100;
    settings.slowDown = slowdown;
    settled = false; // ensure it winds down again
  }
});

