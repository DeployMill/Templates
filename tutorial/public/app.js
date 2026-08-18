// Client-side behaviour: copy buttons, the client-setup tabs, the "done"
// checkmarks and progress meter, scroll reveals, and a small completion cheer.
// Deliberately small and dependency-free — this is a tutorial you might rewrite,
// and a build step would get in the way of that.
//
// Progress is stored in this browser only (localStorage). Nothing is sent
// anywhere: DeployMill doesn't need to know which lessons you ticked, and a
// tutorial that phones home would be a strange first impression.

(function () {
  "use strict";

  var STORE_KEY = "deploymill-tutorial-done";

  // Respect the OS "reduce motion" setting for anything we drive from JS (the
  // CSS handles the rest). Guard matchMedia for very old browsers.
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function loadDone() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // A blocked or full localStorage shouldn't break the page — the tutorial
      // still works fine, it just won't remember your checkmarks.
      return [];
    }
  }

  function saveDone(ids) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(ids));
    } catch (e) {
      /* nothing to do — see loadDone */
    }
  }

  var done = loadDone();
  var total = document.querySelectorAll("[data-done]").length;
  var wasComplete = false;

  // ---- progress meter ----
  var meter = document.querySelector("[data-progress-meter]");
  var progressOut = document.querySelector("[data-progress]");
  var pctOut = document.querySelector("[data-progress-pct]");
  var bar = document.querySelector("[data-progress-bar]");
  var track = meter && meter.querySelector(".progress-track");

  function refreshProgress() {
    var n = done.length;
    var pct = total ? Math.round((n / total) * 100) : 0;
    if (progressOut) progressOut.textContent = String(n);
    if (pctOut) pctOut.textContent = pct + "%";
    if (bar) bar.style.width = pct + "%";
    if (track) track.setAttribute("aria-valuenow", String(n));

    var complete = total > 0 && n >= total;
    if (meter) meter.classList.toggle("is-complete", complete);
    // Fire the cheer only on the transition INTO complete — not on every load of
    // an already-finished tutorial.
    if (complete && !wasComplete) celebrate();
    wasComplete = complete;
  }

  // ---- done checkmarks ----
  document.querySelectorAll("[data-done]").forEach(function (box) {
    var id = box.getAttribute("data-done");
    var lesson = document.getElementById("lesson-" + id);
    if (done.indexOf(id) !== -1) {
      box.checked = true;
      if (lesson) lesson.classList.add("is-done");
    }
    box.addEventListener("change", function () {
      if (box.checked) {
        if (done.indexOf(id) === -1) done.push(id);
      } else {
        done = done.filter(function (x) {
          return x !== id;
        });
      }
      if (lesson) lesson.classList.toggle("is-done", box.checked);
      saveDone(done);
      refreshProgress();
    });
  });
  // Seed `wasComplete` so a fully-finished tutorial doesn't confetti on reload,
  // then paint the bar.
  wasComplete = total > 0 && done.length >= total;
  refreshProgress();

  // ---- copy buttons ----
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var block = btn.closest(".copy");
      var code = block && block.querySelector("code");
      if (!code) return;
      var text = code.textContent || "";
      var flash = function (label) {
        btn.textContent = label;
        btn.classList.add("is-copied");
        window.setTimeout(function () {
          btn.textContent = "Copy";
          btn.classList.remove("is-copied");
        }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            flash("Copied ✓");
          },
          function () {
            btn.textContent = "Press ⌘C";
          }
        );
      } else {
        // No clipboard API (older browser, or a page not served over HTTPS):
        // select the text so the user can copy it themselves rather than
        // leaving a button that silently does nothing.
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = "Press ⌘C";
      }
    });
  });

  // ---- client setup tabs ----
  document.querySelectorAll(".tabs").forEach(function (tabs) {
    var scope = tabs.parentElement;
    tabs.querySelectorAll("[data-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var id = tab.getAttribute("data-tab");
        tabs.querySelectorAll("[data-tab]").forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        scope.querySelectorAll("[data-panel]").forEach(function (panel) {
          panel.classList.toggle("active", panel.getAttribute("data-panel") === id);
        });
      });
    });
  });

  // ---- scroll reveal ----
  // Each card eases in as it enters the viewport, lightly staggered so a group
  // arrives as a wave rather than all at once. If IntersectionObserver is
  // missing or motion is reduced, just show everything.
  var reveals = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) {
      el.classList.add("is-in");
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          // Stagger within the same list only — index resets per <ol>.
          var siblings = el.parentElement ? el.parentElement.children : [el];
          var idx = Array.prototype.indexOf.call(siblings, el);
          el.style.transitionDelay = Math.min(idx, 6) * 60 + "ms";
          el.classList.add("is-in");
          obs.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ---- completion cheer ----
  // A short burst of confetti in the palette when the last lesson is ticked.
  // Pure DOM, no library, cleans up after itself, and never runs under reduced
  // motion.
  function celebrate() {
    if (reduceMotion) return;
    var colors = ["#4338ca", "#7c3aed", "#06b6d4", "#8b87ff", "#34d399"];
    var count = 80;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var piece = document.createElement("div");
      piece.className = "confetti-piece";
      var left = (i / count) * 100 + (i % 5) * 1.5;
      piece.style.left = left + "vw";
      piece.style.background = colors[i % colors.length];
      // Deterministic spread — no Math.random needed, and it looks plenty lively.
      var dur = 2.6 + (i % 7) * 0.28;
      var delay = (i % 11) * 0.05;
      piece.style.animationDuration = dur + "s";
      piece.style.animationDelay = delay + "s";
      piece.style.opacity = "0.9";
      if (i % 3 === 0) piece.style.borderRadius = "50%";
      frag.appendChild(piece);
      scheduleCleanup(piece, (dur + delay) * 1000 + 200);
    }
    document.body.appendChild(frag);
  }

  function scheduleCleanup(node, ms) {
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, ms);
  }
})();
