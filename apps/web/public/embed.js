// Placekeeping embeddable card widget. Framework-free by design -- it has to
// run standalone on arbitrary third-party pages, so it can't assume React,
// any bundler, or even that another copy of itself hasn't already loaded.
//
// Usage (see user-stories.md, "Open Graph Integration" #5):
//   <script src="https://placekeeping.org/embed.js" async></script>
//   <pk-card url="https://placekeeping.org/spots/us/ny/mount-kisco/some-spot" width="500"></pk-card>
(function () {
  if (customElements.get("pk-card")) return;

  // Card data (title/notes) is user-submitted content -- fetched from our
  // own API, but rendered on someone else's page, so it's built with DOM
  // APIs (textContent/src) below rather than innerHTML, to avoid a stored
  // XSS vector through the embedding page.
  var SCRIPT_ORIGIN = (function () {
    var script = document.currentScript;
    try {
      return script ? new URL(script.src).origin : "";
    } catch (e) {
      return "";
    }
  })();

  var STYLE = [
    ":host { all: initial; }",
    "* { box-sizing: border-box; }",
    ".pk-card { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; text-decoration: none; color: inherit; background: #fff; }",
    ".pk-card__image-wrap { display: block; border: 2px solid #333; padding: 3px; }",
    ".pk-card__image { display: block; width: 100%; aspect-ratio: 1200 / 630; object-fit: cover; background: #f5f5f5; }",
    ".pk-card__body { padding: 12px 14px; }",
    ".pk-card__title { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: #171717; }",
    ".pk-card__description { font-size: 13px; color: #525252; margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    ".pk-card__brand { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: #2e7d43; letter-spacing: 0.02em; text-transform: uppercase; }",
    ".pk-card--placeholder { padding: 14px; font-size: 13px; color: #737373; }",
  ].join("\n");

  function buildCard(data, href) {
    var link = document.createElement("a");
    link.className = "pk-card";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    if (data.image) {
      var imageWrap = document.createElement("div");
      imageWrap.className = "pk-card__image-wrap";

      var img = document.createElement("img");
      img.className = "pk-card__image";
      img.src = data.image;
      img.alt = "";
      imageWrap.appendChild(img);

      link.appendChild(imageWrap);
    }

    var body = document.createElement("div");
    body.className = "pk-card__body";

    var title = document.createElement("p");
    title.className = "pk-card__title";
    title.textContent = data.title || "";
    body.appendChild(title);

    if (data.description) {
      var description = document.createElement("p");
      description.className = "pk-card__description";
      description.textContent = data.description;
      body.appendChild(description);
    }

    var brand = document.createElement("div");
    brand.className = "pk-card__brand";
    brand.textContent = "Placekeeping";
    body.appendChild(brand);

    link.appendChild(body);
    return link;
  }

  function buildPlaceholder(message) {
    var div = document.createElement("div");
    div.className = "pk-card pk-card--placeholder";
    div.textContent = message;
    return div;
  }

  class PkCard extends HTMLElement {
    connectedCallback() {
      var url = this.getAttribute("url");
      var width = this.getAttribute("width") || "400";
      this.style.display = "block";
      this.style.maxWidth = width + "px";

      var shadow = this.shadowRoot || this.attachShadow({ mode: "open" });
      var style = document.createElement("style");
      style.textContent = STYLE;
      shadow.appendChild(style);

      if (!url || !SCRIPT_ORIGIN) {
        shadow.appendChild(buildPlaceholder("Placekeeping card unavailable"));
        return;
      }

      var placeholder = buildPlaceholder("Loading…");
      shadow.appendChild(placeholder);

      fetch(SCRIPT_ORIGIN + "/api/embed/card?url=" + encodeURIComponent(url))
        .then(function (res) {
          if (!res.ok) throw new Error("pk-card: request failed");
          return res.json();
        })
        .then(function (data) {
          shadow.removeChild(placeholder);
          shadow.appendChild(buildCard(data, url));
        })
        .catch(function () {
          placeholder.textContent = "Placekeeping card unavailable";
        });
    }
  }

  customElements.define("pk-card", PkCard);
})();
