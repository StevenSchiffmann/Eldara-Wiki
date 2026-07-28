/* Eldara Wiki — lazy client-side search (B12). */
(function () {
  "use strict";

  var root = document.querySelector("[data-search-root]");
  if (!root || !window.FlexSearch || !window.FlexSearch.Document) {
    return;
  }

  var form = root.querySelector(".search-form");
  var input = root.querySelector("#site-search-input");
  var resultsPanel = root.querySelector("#search-results");
  var indexUrl = root.getAttribute("data-index-url") || "/search-index.json";
  var entries = [];
  var searchIndex = null;
  var loadPromise = null;
  var debounceTimer = null;
  var activeIndex = -1;
  var TYPE_LABELS = {
    npc: "Personen",
    player: "Spieler",
    location: "Orte",
    session: "Sitzungen",
    quest: "Quests",
    event: "Ereignisse",
    faction: "Fraktionen",
    lore: "Wissen",
    artifact: "Artefakte",
    creature: "Kreaturen",
    campaign_hub: "Kampagnen",
    landing: "Archiv"
  };

  // Must stay in sync with updater/stages/searchindex.py.
  var UMLAUT_MAP = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
  var WORD_RE = /[\p{L}\p{N}_]+/gu;

  function foldUmlauts(token) {
    return token.replace(/[äöüß]/g, function (character) {
      return UMLAUT_MAP[character];
    });
  }

  function normalizeQuery(rawQuery) {
    var lowered = String(rawQuery || "").toLowerCase();
    var tokens = lowered.match(WORD_RE) || [];
    var normalized = [];
    tokens.forEach(function (token) {
      normalized.push(token);
      var folded = foldUmlauts(token);
      if (folded !== token) {
        normalized.push(folded);
      }
    });
    return normalized.filter(function (token, index, all) {
      return all.indexOf(token) === index;
    }).join(" ");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function highlight(value, query) {
    var safe = escapeHtml(value);
    var terms = normalizeQuery(query).split(/\s+/).filter(Boolean).map(escapeHtml);
    if (!terms.length) {
      return safe;
    }
    var pattern = new RegExp("(" + terms.sort(function (a, b) { return b.length - a.length; }).join("|") + ")", "gi");
    return safe.replace(pattern, "<mark>$1</mark>");
  }

  function loadIndex() {
    if (loadPromise) {
      return loadPromise;
    }
    loadPromise = fetch(indexUrl, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Suchindex konnte nicht geladen werden.");
        }
        return response.json();
      })
      .then(function (data) {
        entries = Array.isArray(data) ? data : [];
        searchIndex = new window.FlexSearch.Document({
          document: {
            id: "slug",
            index: [
              { field: "title", weight: 3 },
              { field: "text", weight: 1 }
            ],
            store: ["slug", "title", "type", "text"]
          },
          charset: "latin:default",
          tokenize: "forward",
          cache: 20
        });
        entries.forEach(function (entry) {
          searchIndex.add(entry);
        });
        return searchIndex;
      });
    return loadPromise;
  }

  function flattenResults(rawResults) {
    var ids = [];
    rawResults.forEach(function (fieldResult) {
      (fieldResult.result || []).forEach(function (item) {
        var id = typeof item === "object" ? item.id : item;
        if (ids.indexOf(id) === -1) {
          ids.push(id);
        }
      });
    });
    return ids.map(function (id) {
      return entries.find(function (entry) { return entry.slug === id; });
    }).filter(Boolean).slice(0, 12);
  }

  function render(query, found) {
    resultsPanel.innerHTML = "";
    activeIndex = -1;
    if (!query) {
      resultsPanel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      return;
    }
    resultsPanel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (!found.length) {
      resultsPanel.innerHTML = '<p class="search-empty">Das Archiv schweigt zu diesem Namen.</p>';
      return;
    }
    var groups = {};
    found.forEach(function (entry) {
      var label = TYPE_LABELS[entry.type] || "Weitere Einträge";
      (groups[label] = groups[label] || []).push(entry);
    });
    Object.keys(groups).forEach(function (label) {
      var group = document.createElement("section");
      group.className = "search-group";
      group.innerHTML = "<h2>" + escapeHtml(label) + "</h2>";
      var list = document.createElement("ul");
      groups[label].forEach(function (entry) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.className = "search-result";
        link.setAttribute("role", "option");
        link.href = root.getAttribute("data-base-url") + String(entry.slug || "").replace(/^\/+|\/+$/g, "") + "/";
        link.innerHTML = "<strong>" + highlight(entry.title, query) + "</strong>" +
          '<span class="search-result-type">' + escapeHtml(TYPE_LABELS[entry.type] || entry.type || "") + "</span>" +
          '<span class="search-result-snippet">' + highlight(entry.text, query) + "</span>";
        item.appendChild(link);
        list.appendChild(item);
      });
      group.appendChild(list);
      resultsPanel.appendChild(group);
    });
  }

  function runSearch() {
    var query = normalizeQuery(input.value);
    if (!query) {
      render("", []);
      return;
    }
    loadIndex().then(function (index) {
      render(query, flattenResults(index.search(query, { enrich: true, limit: 12 })));
    }).catch(function () {
      render(query, []);
    });
  }

  function scheduleSearch() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runSearch, 140);
  }

  input.addEventListener("focus", loadIndex);
  input.addEventListener("input", scheduleSearch);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    runSearch();
  });
  input.addEventListener("keydown", function (event) {
    var links = resultsPanel.querySelectorAll(".search-result");
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!links.length) return;
      activeIndex = (activeIndex + (event.key === "ArrowDown" ? 1 : links.length - 1)) % links.length;
      links[activeIndex].focus();
    } else if (event.key === "Escape") {
      resultsPanel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.focus();
    }
  });
  resultsPanel.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      resultsPanel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.focus();
    }
  });
}());
