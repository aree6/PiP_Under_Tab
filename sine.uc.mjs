// sine.uc.mjs
// Pinned PiP in sidebar - chrome-side script for Sine (Zen)
// NOTE: this runs in the browser chrome/window context (userChrome-like).
(function () {
  "use strict";
  const MOD = "pinned-pip-sidebar";
  const DEBUG = true;
  function log(...args) { if (DEBUG) console.log(`[${MOD}]`, ...args); }

  // Small registry to keep tails for each tab
  const TAB_STORE = new WeakMap();

  // Frame script string that will be injected into content frames when needed.
  // It listens for messages and toggles the page's first <video> (very simple).
  const FRAME_SCRIPT = `
(function () {
  // frame script context: ` + "`content`" + ` points to the content window.
  addMessageListener("sine-pip:toggle-play", function() {
    try {
      const v = content.document.querySelector("video");
      if (!v) return;
      if (v.paused) v.play().catch(()=>{/*ignore*/});
      else v.pause();
    } catch (e) {}
  });
  addMessageListener("sine-pip:query-state", function() {
    try {
      const v = content.document.querySelector("video");
      const state = {
        hasVideo: !!v,
        paused: !v || v.paused,
        currentSrc: v ? v.currentSrc : null
      };
      sendAsyncMessage("sine-pip:state", state);
    } catch (e) {
      sendAsyncMessage("sine-pip:state", {hasVideo:false, paused:true});
    }
  });
})();
`;

  // Ensure gBrowser is available
  function init() {
    if (!window.gBrowser) {
      // if not ready, try again on load
      window.addEventListener("load", () => setTimeout(init, 50), { once: true });
      return;
    }
    log("init");
    const tabContainer = gBrowser.tabContainer;
    tabContainer.addEventListener("TabAttrModified", onTabAttrModified);
    // Initialize existing tabs that already have audible attribute
    for (const tab of gBrowser.tabs) {
      if (isTabPlaying(tab)) enablePinnedPreview(tab);
    }
    // Cleanup on unload
    window.addEventListener("unload", () => {
      tabContainer.removeEventListener("TabAttrModified", onTabAttrModified);
      for (const tab of gBrowser.tabs) disablePinnedPreview(tab);
    }, { once: true });
  }

  function isTabPlaying(tab) {
    try {
      // Common attributes used by Firefox forks: "audible", "playing"
      return (tab.hasAttribute && (tab.hasAttribute("audible") || tab.hasAttribute("playing")));
    } catch (e) { return false; }
  }

  function onTabAttrModified(e) {
    try {
      const tab = e.target;
      if (!tab) return;
      const playing = isTabPlaying(tab);
      if (playing) enablePinnedPreview(tab);
      else disablePinnedPreview(tab);
    } catch (err) { log("TabAttrModified error", err); }
  }

  function ensureFrameScriptFor(browser) {
    // Load frame script into the content process for this browser if not already loaded.
    try {
      if (!browser || !browser.messageManager) return;
      const mm = browser.messageManager;
      // use a tiny "marker" to check if loaded
      if (mm._sinePinnedPiPLoaded) return;
      // load frame script (data: approach). If your environment blocks data: you can
      // place the script in a resource and load from there.
      mm.loadFrameScript("data:application/javascript;charset=utf-8," + encodeURIComponent(FRAME_SCRIPT), false);
      mm._sinePinnedPiPLoaded = true;
      log("frame script loaded for browser");
    } catch (e) {
      log("ensureFrameScriptFor error", e);
    }
  }

  function postMessageToContent(browser, name, data) {
    try {
      if (!browser || !browser.messageManager) return;
      browser.messageManager.sendAsyncMessage(name, data || {});
    } catch (e) { log("postMessageToContent error", e); }
  }

  function enablePinnedPreview(tab) {
    try {
      if (TAB_STORE.has(tab)) return; // already attached
      const doc = tab.ownerDocument;
      if (!doc) return;
      const container = doc.createElement("div");
      container.className = "sine-pip-container";
      container.setAttribute("role", "button");
      container.innerHTML = `
        <img class="sine-pip-favicon" alt="" />
        <div class="sine-pip-meta">
          <div class="sine-pip-title"></div>
          <div class="sine-pip-source"></div>
        </div>
        <div class="sine-pip-controls">
          <button class="sine-pip-play" title="Play/Pause">▶︎/❚❚</button>
          <button class="sine-pip-close" title="Close preview">✕</button>
        </div>
      `;
      // attach into the tab element (sidebar tab). In Zen, tabs are XUL elements but DOM append works.
      tab.appendChild(container);
      tab.classList.add("sine-pip-attached");

      // wire buttons
      const playBtn = container.querySelector(".sine-pip-play");
      const closeBtn = container.querySelector(".sine-pip-close");
      playBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // ensure frame script for the tab's browser
        const b = tab.linkedBrowser;
        ensureFrameScriptFor(b);
        postMessageToContent(b, "sine-pip:toggle-play");
        // query state shortly after to refresh UI
        setTimeout(() => queryAndRenderState(tab), 250);
      });
      closeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        disablePinnedPreview(tab);
      });

      // Listen for state messages from content for this browser
      const b = tab.linkedBrowser;
      ensureFrameScriptFor(b);
      const mm = b.messageManager;
      const stateHandler = (msg) => {
        if (msg && msg.json) {
          renderStateToContainer(container, msg.json);
        }
      };
      // name the listener so it can be removed
      const listenerName = `_sine_pip_listener_${Math.random().toString(36).slice(2)}`;
      mm.addMessageListener("sine-pip:state", stateHandler);
      // store cleanup data
      TAB_STORE.set(tab, { container, mm, stateHandler });

      // initial query
      queryAndRenderState(tab);
      log("pinned preview enabled for tab", tab);
    } catch (err) { log("enablePinnedPreview error", err); }
  }

  function disablePinnedPreview(tab) {
    try {
      const entry = TAB_STORE.get(tab);
      if (!entry) {
        // ensure class removed anyway
        tab.classList.remove("sine-pip-attached");
        return;
      }
      const { container, mm, stateHandler } = entry;
      if (container && container.parentNode) container.parentNode.removeChild(container);
      try { mm.removeMessageListener && mm.removeMessageListener("sine-pip:state", stateHandler); } catch (e) {}
      tab.classList.remove("sine-pip-attached");
      TAB_STORE.delete(tab);
      log("pinned preview disabled for tab", tab);
    } catch (err) { log("disablePinnedPreview error", err); }
  }

  function queryAndRenderState(tab) {
    try {
      const b = tab.linkedBrowser;
      if (!b || !b.messageManager) return;
      postMessageToContent(b, "sine-pip:query-state");
      // content will reply with "sine-pip:state" which our registered handler will render
    } catch (e) { log("queryAndRenderState error", e); }
  }

  function renderStateToContainer(container, state) {
    try {
      if (!container) return;
      const titleEl = container.querySelector(".sine-pip-title");
      const sourceEl = container.querySelector(".sine-pip-source");
      const fav = container.querySelector(".sine-pip-favicon");
      // set simple text placeholders (real metadata retrieval would be extra)
      titleEl.textContent = (state && state.hasVideo ? "Playing video" : "No video");
      sourceEl.textContent = state && state.currentSrc ? new URL(state.currentSrc).hostname : "";
      // favicon: try to read owner tab's image
      // (we'll let CSS fallback if none)
    } catch (e) { log("renderStateToContainer error", e); }
  }

  // READY
  init();

})();
