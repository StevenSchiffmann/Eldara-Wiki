(function () {
  "use strict";

  var trigger = document.querySelector("[data-d20-trigger]");
  var result = document.getElementById("d20-result");
  if (!trigger || !result) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var flavor = {
    20: "Ein seltenes Zeichen: Das Archiv steht dir offen.",
    1: "Selbst der Chronist muss über diesen Wurf schmunzeln."
  };

  trigger.addEventListener("click", function () {
    var roll = Math.floor(Math.random() * 20) + 1;
    result.textContent = "Der Würfel des Archivars zeigt: " + roll +
      (flavor[roll] ? " – " + flavor[roll] : ".");
    result.classList.remove("d20-result--rolling");
    if (!reduced) {
      void result.offsetWidth;
      result.classList.add("d20-result--rolling");
    }
  });
}());
