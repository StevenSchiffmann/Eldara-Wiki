/* Eldara Wiki — B17 map panel + Leaflet lightbox.
 * Progressive enhancement: without this script the panel is a plain <a> to the static
 * map image. Leaflet (vendor/leaflet) and /map-markers.json are only fetched/initialized
 * the first time the panel is opened — the hub itself stays light.
 */
(function () {
  "use strict";

  var panel = document.querySelector("[data-map-panel]");
  if (!panel) {
    return;
  }
  // The hub has a single preview; the map room has one trigger per chart, each naming the
  // map it opens via data-map-id (falling back to andurin, the world map).
  var triggers = panel.querySelectorAll("[data-map-open]");
  if (!triggers.length) {
    return;
  }

  var markersUrl = panel.getAttribute("data-markers-url");
  var markerIconUrl = panel.getAttribute("data-marker-icon");
  var scriptUrl = document.currentScript && document.currentScript.src;
  var baseUrl = scriptUrl ? scriptUrl.replace(/static\/js\/map\.js(?:\?.*)?$/, "") : "/";

  var leafletReady = null;
  var markersData = null;
  var dialog = null;
  var mapInstance = null;
  var mapStack = []; // back-navigation stack of map ids
  var lastFocused = null;

  function loadLeaflet() {
    if (leafletReady) {
      return leafletReady;
    }
    leafletReady = new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = baseUrl + "static/vendor/leaflet/leaflet.css";
      document.head.appendChild(link);

      var script = document.createElement("script");
      script.src = baseUrl + "static/vendor/leaflet/leaflet.js";
      script.onload = function () {
        resolve(window.L);
      };
      script.onerror = function () {
        reject(new Error("map.js: Leaflet konnte nicht geladen werden."));
      };
      document.head.appendChild(script);
    });
    return leafletReady;
  }

  function loadMarkers() {
    if (markersData) {
      return Promise.resolve(markersData);
    }
    return fetch(markersUrl)
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        markersData = data;
        return data;
      });
  }

  function buildDialog() {
    var el = document.createElement("div");
    el.className = "map-lightbox";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Weltkarte von Eldara");
    el.innerHTML =
      '<div class="map-lightbox-toolbar">' +
      '<button type="button" class="map-lightbox-back" data-map-back hidden>&larr; Zurück zur Weltkarte</button>' +
      '<span class="map-lightbox-title" data-map-title></span>' +
      '<button type="button" class="map-lightbox-close" data-map-close>Schließen</button>' +
      "</div>" +
      '<div class="map-lightbox-canvas" data-map-canvas></div>';
    document.body.appendChild(el);
    return el;
  }

  function getFocusable() {
    return Array.prototype.slice.call(
      dialog.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')
    );
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      closeLightbox();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    var focusable = getFocusable();
    if (!focusable.length) {
      return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeLightbox() {
    if (!dialog) {
      return;
    }
    document.removeEventListener("keydown", onKeydown, true);
    dialog.remove();
    dialog = null;
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    mapStack = [];
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function isValidMarker(marker, mapId) {
    var hasSlug = !!marker.target_slug;
    var hasMap = !!marker.target_map;
    if (hasSlug === hasMap) {
      // eslint-disable-next-line no-console
      console.error(
        "map.js: invalid marker on " + mapId + " (“" + marker.label + "”) — " +
        "exactly one of target_slug/target_map must be set. Skipping."
      );
      return false;
    }
    return true;
  }

  function renderMap(mapId) {
    var canvas = dialog.querySelector("[data-map-canvas]");
    var titleEl = dialog.querySelector("[data-map-title]");
    var backBtn = dialog.querySelector("[data-map-back]");
    var mapDef = markersData[mapId];
    if (!mapDef) {
      // eslint-disable-next-line no-console
      console.error("map.js: unknown map id " + mapId);
      return;
    }

    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }

    var L = window.L;
    var bounds = [
      [0, 0],
      [mapDef.height, mapDef.width],
    ];
    mapInstance = L.map(canvas, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 2,
      maxBounds: bounds,
    });
    L.imageOverlay(baseUrl + mapDef.image, bounds).addTo(mapInstance);
    mapInstance.fitBounds(bounds);

    (mapDef.markers || []).forEach(function (marker) {
      if (!isValidMarker(marker, mapId)) {
        return;
      }
      var icon = L.divIcon({
        className: "",
        html:
          '<img class="map-marker-icon" src="' + markerIconUrl + '" alt="" />',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      var latlng = [marker.y, marker.x];
      var leafletMarker = L.marker(latlng, { icon: icon }).addTo(mapInstance);
      leafletMarker.bindTooltip(marker.label);
      leafletMarker.on("click", function () {
        if (marker.target_slug) {
          // target_slug is root-relative without its leading slash ("orte/kharvos"), so it
          // has to be joined onto baseUrl — assigning it raw resolved against the current
          // directory and 404'd from every page below the root.
          window.location.href = baseUrl + marker.target_slug + "/";
        } else if (marker.target_map) {
          mapStack.push(mapId);
          backBtn.hidden = false;
          renderMap(marker.target_map);
        }
      });
    });

    titleEl.textContent = "Karte: " + mapId.charAt(0).toUpperCase() + mapId.slice(1);
    backBtn.hidden = mapStack.length === 0;
  }

  function openLightbox(startMapId) {
    lastFocused = document.activeElement;
    Promise.all([loadLeaflet(), loadMarkers()])
      .then(function () {
        dialog = buildDialog();
        dialog.querySelector("[data-map-close]").addEventListener("click", closeLightbox);
        dialog.querySelector("[data-map-back]").addEventListener("click", function () {
          var previous = mapStack.pop();
          if (previous) {
            renderMap(previous);
          }
        });
        document.addEventListener("keydown", onKeydown, true);
        renderMap(startMapId);
        var closeBtn = dialog.querySelector("[data-map-close]");
        closeBtn.focus();
      })
      .catch(function (error) {
        // eslint-disable-next-line no-console
        console.error(error);
      });
  }

  Array.prototype.forEach.call(triggers, function (trigger) {
    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      openLightbox(trigger.getAttribute("data-map-id") || "andurin");
    });
  });
})();
