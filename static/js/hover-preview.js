/* Eldara Wiki — B20 hover previews. */
(function () {
  "use strict";

  if (window.matchMedia("(pointer: coarse)").matches) {
    return;
  }

  var stylesheet = document.createElement("link");
  var scriptUrl = document.currentScript && document.currentScript.src;
  stylesheet.rel = "stylesheet";
  stylesheet.href = scriptUrl
    ? scriptUrl.replace(/js\/hover-preview\.js(?:\?.*)?$/, "css/hover-preview.css")
    : "static/css/hover-preview.css";
  document.head.appendChild(stylesheet);

  var previewPromise = null;
  var card = document.createElement("aside");
  var currentLink = null;
  var hideTimer = null;
  var hoverTimer = null;

  card.className = "hover-preview";
  card.setAttribute("role", "tooltip");
  card.hidden = true;
  document.body.appendChild(card);

  function getPreviews() {
    if (!previewPromise) {
      previewPromise = fetch("/previews.json")
        .then(function (response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .catch(function () {
          return null;
        });
    }
    return previewPromise;
  }

  function linkFor(target) {
    return target && target.closest ? target.closest("a.wikilink") : null;
  }

  function hideCard() {
    window.clearTimeout(hoverTimer);
    window.clearTimeout(hideTimer);
    currentLink = null;
    card.hidden = true;
    card.classList.remove("is-visible");
  }

  function positionCard(link) {
    var box = link.getBoundingClientRect();
    var gap = 8;
    var left = Math.max(8, Math.min(box.left, window.innerWidth - card.offsetWidth - 8));
    var top = box.bottom + gap;

    if (top + card.offsetHeight > window.innerHeight - 8) {
      top = box.top - card.offsetHeight - gap;
    }
    card.style.left = left + "px";
    card.style.top = Math.max(8, top) + "px";
  }

  function showCard(link) {
    var slug = link.getAttribute("href").replace(/^\/+|\/+$/g, "");

    if (!slug) {
      return;
    }
    getPreviews().then(function (previews) {
      var preview = previews && previews[slug];
      if (!preview || currentLink !== link) {
        return;
      }
      card.textContent = "";
      var title = document.createElement("strong");
      var excerpt = document.createElement("span");
      title.textContent = preview.title || "";
      excerpt.textContent = preview.excerpt || "";
      card.appendChild(title);
      card.appendChild(excerpt);
      card.hidden = false;
      card.classList.add("is-visible");
      link.setAttribute("aria-describedby", "eldara-hover-preview");
      card.id = "eldara-hover-preview";
      positionCard(link);
    });
  }

  function requestCard(link, immediate) {
    if (!link) {
      return;
    }
    window.clearTimeout(hoverTimer);
    window.clearTimeout(hideTimer);
    currentLink = link;
    if (immediate) {
      showCard(link);
    } else {
      hoverTimer = window.setTimeout(function () { showCard(link); }, 300);
    }
  }

  document.addEventListener("mouseover", function (event) {
    var link = linkFor(event.target);
    if (link && link !== currentLink) {
      requestCard(link, false);
    }
  });

  document.addEventListener("mouseout", function (event) {
    var link = linkFor(event.target);
    if (link && !link.contains(event.relatedTarget)) {
      hideTimer = window.setTimeout(hideCard, 40);
    }
  });

  document.addEventListener("focusin", function (event) {
    requestCard(linkFor(event.target), true);
  });
  document.addEventListener("focusout", function (event) {
    if (linkFor(event.target)) {
      hideTimer = window.setTimeout(hideCard, 40);
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      hideCard();
    }
  });
  window.addEventListener("scroll", hideCard, { passive: true });
  window.addEventListener("resize", function () {
    if (currentLink && !card.hidden) {
      positionCard(currentLink);
    }
  });
}());
