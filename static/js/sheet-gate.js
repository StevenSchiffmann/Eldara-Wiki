/* Eldara Wiki — identity prompt before a character sheet downloads.
 *
 * Progressive enhancement: without this script every [data-sheet-link] is an ordinary
 * download link and still works. With it, the click is held back until the reader confirms
 * they are the character whose sheet it is.
 *
 * Deliberately not a security control — the href is in the markup and "Ja" is one click
 * away. It exists so nobody opens a companion's sheet by reflex.
 */
(function () {
  "use strict";

  var dialog = document.querySelector("[data-sheet-gate]");
  var links = document.querySelectorAll("[data-sheet-link]");
  if (!dialog || !links.length || typeof dialog.showModal !== "function") {
    return; // No <dialog> support: links keep their native behaviour.
  }

  var nameSlot = dialog.querySelector("[data-sheet-gate-name]");
  var pending = null;

  function download(link) {
    var a = document.createElement("a");
    a.href = link.href;
    // Mirrors the link's own filename so the browser saves it under the sheet's name.
    a.download = link.getAttribute("data-sheet-file") || "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      pending = link;
      if (nameSlot) {
        nameSlot.textContent = link.getAttribute("data-sheet-owner") || "du";
      }
      dialog.showModal();
      // Open on the cautious answer: Enter should not hand out someone else's sheet.
      var deny = dialog.querySelector(".sheet-gate-button--deny");
      if (deny) {
        deny.focus();
      }
    });
  });

  // `method="dialog"` closes the form and reports the pressed button in returnValue.
  // Esc and the backdrop both yield "" — treated as No, like every other cancel.
  dialog.addEventListener("close", function () {
    var confirmed = dialog.returnValue === "ja";
    var link = pending;
    pending = null;
    if (confirmed && link) {
      download(link);
    }
  });
})();
