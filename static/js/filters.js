/* Eldara Wiki — progressive-enhancement filters for the NPC compendium (B14). */
(function () {
  "use strict";

  var root = document.querySelector("[data-compendium-root]");
  if (!root) return;

  var cards = Array.prototype.slice.call(root.querySelectorAll("[data-npc-card]"));
  var fields = ["fraktion", "status", "kampagne", "rasse"];
  var active = {};
  var count = root.querySelector("[data-filter-count]");

  function optionsFor(field) {
    var seen = {};
    cards.forEach(function (card) {
      var value = card.getAttribute("data-" + field) || "unbekannt";
      if (!seen[value]) {
        seen[value] = card.getAttribute("data-" + field + "-label") || "Unbekannt";
      }
    });
    return seen;
  }

  function update() {
    var visible = 0;
    cards.forEach(function (card) {
      var matches = fields.every(function (field) {
        return !active[field] || card.getAttribute("data-" + field) === active[field];
      });
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    if (count) count.textContent = visible + " von " + cards.length + " Personen";
  }

  function addButton(container, field, value, label, isAll) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", isAll ? "true" : "false");
    button.addEventListener("click", function () {
      if (isAll) {
        delete active[field];
      } else {
        active[field] = value;
      }
      Array.prototype.forEach.call(container.querySelectorAll("button"), function (item) {
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      update();
    });
    container.appendChild(button);
  }

  fields.forEach(function (field) {
    var container = root.querySelector('[data-filter-options="' + field + '"]');
    if (!container) return;
    addButton(container, field, "", "Alle", true);
    Object.keys(optionsFor(field)).sort().forEach(function (value) {
      addButton(container, field, value, optionsFor(field)[value], false);
    });
  });
  update();
}());
