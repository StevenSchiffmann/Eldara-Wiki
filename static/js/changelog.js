/* Eldara Wiki — B22 "Neu seit letzter Session" panel.
 * Fetch failure or empty additions never shows an error box — the panel just stays quiet.
 */
(function () {
  "use strict";

  var TYPE_LABELS = {
    session: "Sitzungen",
    npc: "Personen",
    location: "Orte",
    quest: "Aufträge",
    event: "Ereignisse",
    faction: "Fraktionen",
  };

  var panel = document.querySelector("[data-changelog-panel]");
  if (!panel) {
    return;
  }
  var campaign = panel.getAttribute("data-campaign") || null;
  var scriptUrl = document.currentScript && document.currentScript.src;
  var baseUrl = scriptUrl ? scriptUrl.replace(/static\/js\/changelog\.js(?:\?.*)?$/, "") : "/";

  fetch(baseUrl + "changelog.json")
    .then(function (response) {
      return response.json();
    })
    .then(render)
    .catch(function () {
      // Silent — a missing changelog.json should not alarm players.
    });

  function render(data) {
    var additions = (data.additions || []).filter(function (entry) {
      return entry.campaign === campaign || entry.campaign === null;
    });

    var heading = document.createElement("h3");
    heading.className = "changelog-heading";
    heading.textContent = "Neu seit letzter Session";
    panel.appendChild(heading);

    if (data.baseline_session === null) {
      var subline = document.createElement("p");
      subline.className = "changelog-subline";
      subline.textContent = "Der Anfang der Aufzeichnungen.";
      panel.appendChild(subline);
    }

    if (additions.length === 0) {
      var empty = document.createElement("p");
      empty.className = "changelog-empty";
      empty.textContent = "Nichts Neues seit der letzten Sitzung.";
      panel.appendChild(empty);
      return;
    }

    var groups = {};
    var order = [];
    additions.forEach(function (entry) {
      var key = TYPE_LABELS[entry.type] ? entry.type : "_archiv";
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(entry);
    });

    order.forEach(function (key) {
      var label = TYPE_LABELS[key] || "Archiv";
      var group = document.createElement("div");
      group.className = "changelog-group";

      var groupHeading = document.createElement("h4");
      groupHeading.textContent = label;
      group.appendChild(groupHeading);

      var list = document.createElement("ul");
      groups[key].forEach(function (entry) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = baseUrl + entry.slug + "/";
        link.textContent = entry.title;
        item.appendChild(link);
        list.appendChild(item);
      });
      group.appendChild(list);
      panel.appendChild(group);
    });
  }
})();
