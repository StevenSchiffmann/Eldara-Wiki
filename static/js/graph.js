/* Eldara Wiki — B19 relationship-graph constellation (compendium page).
 * Vendored d3-force (standalone, not full D3) lays out /graph.json once; DOM/SVG
 * rendering is hand-written vanilla JS. Lazy: fetch + init only once the panel
 * scrolls into view. The simulation is run synchronously for a fixed number of
 * ticks and then discarded — there is no ever-running requestAnimationFrame loop.
 */
(function () {
  "use strict";

  var panel = document.querySelector("[data-graph-panel]");
  if (!panel || !window.d3 || typeof window.d3.forceSimulation !== "function") {
    return;
  }

  var fallback = panel.querySelector("[data-graph-fallback]");
  var canvas = panel.querySelector("[data-graph-canvas]");
  var scriptUrl = document.currentScript && document.currentScript.src;
  var baseUrl = scriptUrl ? scriptUrl.replace(/static\/js\/graph\.js(?:\?.*)?$/, "") : "/";
  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var initialized = false;

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;

    fetch(baseUrl + "graph.json")
      .then(function (response) {
        return response.json();
      })
      .then(renderGraph)
      .catch(function (error) {
        // eslint-disable-next-line no-console
        console.error("graph.js: konnte graph.json nicht laden", error);
      });
  }

  function renderGraph(data) {
    var nodes = data.nodes || [];
    var edges = data.edges || [];

    if (nodes.length === 0) {
      panel.hidden = true;
      return;
    }

    fallback.hidden = true;
    canvas.hidden = false;

    var width = canvas.clientWidth || 800;
    var height = 420;

    // d3-force mutates node objects in place (adds x/y/vx/vy) and resolves edge
    // source/target strings into node references — copy so re-render is possible.
    var simNodes = nodes.map(function (n) {
      return Object.assign({}, n);
    });
    var simEdges = edges.map(function (e) {
      return Object.assign({}, e);
    });

    var simulation = window.d3
      .forceSimulation(simNodes)
      .force(
        "link",
        window.d3
          .forceLink(simEdges)
          .id(function (d) {
            return d.id;
          })
          .distance(90)
      )
      .force("charge", window.d3.forceManyBody().strength(-170))
      .force("center", window.d3.forceCenter(width / 2, height / 2))
      .force("collide", window.d3.forceCollide(46))
      .stop();

    var TICKS = 300;
    for (var i = 0; i < TICKS; i++) {
      simulation.tick();
    }

    // Most nodes in this graph have no edge at all (the vault records few explicit
    // relationships), so nothing pulls them back and the charge force pushes them past the
    // frame. Clamping after the run keeps every name inside the panel; the margin leaves
    // room for the label that is drawn beside each node.
    var MARGIN_X = 96;
    var MARGIN_Y = 22;
    simNodes.forEach(function (n) {
      n.x = Math.min(Math.max(n.x, MARGIN_X), width - MARGIN_X);
      n.y = Math.min(Math.max(n.y, MARGIN_Y), height - MARGIN_Y);
    });

    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Beziehungsgeflecht der Personen und Fraktionen");
    if (!prefersReducedMotion) {
      svg.classList.add("graph-fade-in");
    }

    var edgeGroup = document.createElementNS(svgNS, "g");
    var nodeGroup = document.createElementNS(svgNS, "g");

    var nodeById = {};
    simNodes.forEach(function (n) {
      nodeById[n.id] = n;
    });

    var edgeElements = simEdges.map(function (edge) {
      var line = document.createElementNS(svgNS, "line");
      line.setAttribute("class", "graph-edge");
      line.setAttribute("x1", edge.source.x);
      line.setAttribute("y1", edge.source.y);
      line.setAttribute("x2", edge.target.x);
      line.setAttribute("y2", edge.target.y);
      edgeGroup.appendChild(line);

      var labelText = null;
      if (edge.label) {
        labelText = document.createElementNS(svgNS, "text");
        labelText.setAttribute("class", "graph-edge-label");
        labelText.setAttribute("x", (edge.source.x + edge.target.x) / 2);
        labelText.setAttribute("y", (edge.source.y + edge.target.y) / 2);
        labelText.textContent = edge.label;
        labelText.style.display = "none";
        edgeGroup.appendChild(labelText);
      }
      return { edge: edge, line: line, labelText: labelText };
    });

    simNodes.forEach(function (node) {
      var g = document.createElementNS(svgNS, "g");
      g.setAttribute(
        "class",
        "graph-node" + (node.type === "faction" ? " graph-node--faction" : "")
      );
      g.setAttribute("transform", "translate(" + node.x + "," + node.y + ")");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "link");
      g.setAttribute("aria-label", node.title);

      var circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", node.type === "faction" ? 10 : 7);
      g.appendChild(circle);

      var label = document.createElementNS(svgNS, "text");
      label.setAttribute("y", 4);
      label.textContent = node.title;
      g.appendChild(label);

      // Names on nodes near the right edge used to run out of the viewBox and get clipped
      // mid-word ("Hendrick Gogo"), so a label that would overflow is written back towards
      // the centre. Re-evaluated while dragging.
      function placeLabel() {
        // Flip only when the name would actually pass the edge, not merely because the
        // node sits right-of-centre — an eager flip threw labels over their neighbours.
        // ~6.4px per character matches the 11px label font.
        var estimated = node.title.length * 6.4;
        if (node.x + 12 + estimated > width - 6) {
          label.setAttribute("x", -12);
          label.setAttribute("text-anchor", "end");
        } else {
          label.setAttribute("x", 12);
          label.setAttribute("text-anchor", "start");
        }
      }
      placeLabel();
      g.addEventListener("eldara:moved", placeLabel);

      function highlight(on) {
        edgeElements.forEach(function (item) {
          var touches =
            item.edge.source.id === node.id || item.edge.target.id === node.id;
          if (!touches) {
            return;
          }
          item.line.classList.toggle("graph-edge--highlight", on);
          if (item.labelText) {
            item.labelText.style.display = on ? "block" : "none";
          }
        });
      }

      g.addEventListener("mouseenter", function () {
        highlight(true);
      });
      g.addEventListener("mouseleave", function () {
        highlight(false);
      });
      g.addEventListener("focus", function () {
        highlight(true);
      });
      g.addEventListener("blur", function () {
        highlight(false);
      });

      function navigate() {
        window.location.href = baseUrl + node.id + "/";
      }
      g.addEventListener("click", navigate);
      g.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate();
        }
      });

      makeDraggable(g, node, edgeElements);

      nodeGroup.appendChild(g);
    });

    svg.appendChild(edgeGroup);
    svg.appendChild(nodeGroup);
    canvas.appendChild(svg);
  }

  function makeDraggable(g, node, edgeElements) {
    var dragging = false;

    g.addEventListener("pointerdown", function (event) {
      dragging = true;
      g.setPointerCapture(event.pointerId);
    });
    g.addEventListener("pointermove", function (event) {
      if (!dragging) {
        return;
      }
      var svg = g.ownerSVGElement;
      var rect = svg.getBoundingClientRect();
      var viewBox = svg.viewBox.baseVal;
      var scaleX = viewBox.width / rect.width;
      var scaleY = viewBox.height / rect.height;
      // Clamped so a node cannot be dragged out of the frame and lost.
      var pad = 14;
      node.x = Math.min(Math.max((event.clientX - rect.left) * scaleX, pad), viewBox.width - pad);
      node.y = Math.min(Math.max((event.clientY - rect.top) * scaleY, pad), viewBox.height - pad);
      g.setAttribute("transform", "translate(" + node.x + "," + node.y + ")");
      g.dispatchEvent(new CustomEvent("eldara:moved"));
      edgeElements.forEach(function (item) {
        if (item.edge.source.id === node.id) {
          item.line.setAttribute("x1", node.x);
          item.line.setAttribute("y1", node.y);
        }
        if (item.edge.target.id === node.id) {
          item.line.setAttribute("x2", node.x);
          item.line.setAttribute("y2", node.y);
        }
      });
    });
    g.addEventListener("pointerup", function () {
      dragging = false;
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            init();
            observer.disconnect();
          }
        });
      },
      { rootMargin: "200px" }
    );
    observer.observe(panel);
  } else {
    init();
  }
})();
