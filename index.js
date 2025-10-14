import Graph from "graphology";
import ForceAtlas2Layout from "graphology-layout-forceatlas2/worker";
import circular from "graphology-layout/circular.js";
import Sigma from "sigma";
import fs from "fs";

// Import the graph
let graph = null
await fetch("/graph.json")
  .then((res) => res.json())
  .then((data) => {
     graph = Graph.from(data);
  });

circular.assign(graph); // Assign initial layout

let slowdown = 100;

// Set up force simulation settings:
const layout = new ForceAtlas2Layout(graph, {
  settings: {
    slowDown: slowdown, // Damper
    gravity: 0.5, // Center Attraction
    scalingRatio: 5, // Repulsion
  },
});
layout.start()

// Taper off motion over time and pause sim
let lastStep = performance.now();

function windDown() {
  if (!layout.isRunning) return;
  const now = performance.now();
  const dt = now - lastStep;
  lastStep = now;

  // Increase slowDown gradually over time (like friction increasing)
  slowdown *= 1.01;
  layout.settings.slowDown = slowdown;

  // if (slowdown > 10000) {
  //   layout.stop();
  //   console.log("Layout stabilized and stopped.");
  //   return;
  // }
  requestAnimationFrame(windDown);
}
windDown();



// Render the graph
const container = document.getElementById("sigma-container")
const renderer = new Sigma(graph, container)

let draggedNode = null;
let isDragging = false;


// Disable camera movement when dragging
renderer.getMouseCaptor().on("mousemovebody", (e) => {
  if (!isDragging || !draggedNode) return;

  // Convert mouse coords to graph space:
  const pos = renderer.viewportToGraph(e);
  graph.setNodeAttribute(draggedNode, "x", pos.x);
  graph.setNodeAttribute(draggedNode, "y", pos.y);
  e.preventSigmaDefault(); // stop camera panning
  e.original.preventDefault();
});

renderer.on("downNode", ({ node }) => {
  draggedNode = node;
  isDragging = true;
  renderer.getMouseCaptor().disableCameraMoves();
});

renderer.getMouseCaptor().on("mouseup", () => {
  if (isDragging && draggedNode) {
    isDragging = false;
    draggedNode = null;
    renderer.getMouseCaptor().enableCameraMoves();
  }
});
