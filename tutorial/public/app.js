// Client-side behaviour: copy buttons, the client-setup tabs, and the "done"
// checkmarks. Deliberately small and dependency-free — this is a tutorial you
// might rewrite, and a build step would get in the way of that.
//
// Progress is stored in this browser only (localStorage). Nothing is sent
// anywhere: DeployMill doesn't need to know which lessons you ticked, and a
// tutorial that phones home would be a strange first impression.

(function () {
  "use strict";

  var STORE_KEY = "deploymill-tutorial-done";

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

  function refreshProgress() {
    var out = document.querySelector("[data-progress]");
    if (out) out.textContent = String(done.length);
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
  refreshProgress();

  // ---- copy buttons ----
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var block = btn.closest(".copy");
      var code = block && block.querySelector("code");
      if (!code) return;
      var text = code.textContent || "";
      var restore = function () {
        btn.textContent = "Copied";
        window.setTimeout(function () {
          btn.textContent = "Copy";
        }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(restore, function () {
          btn.textContent = "Press ⌘C";
        });
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
})();
