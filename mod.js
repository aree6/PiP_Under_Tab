export default {
  onload() {
    console.log("[PiP Under Tab] Loaded");

    let pipContainer;

    function createMiniPlayer(tab) {
      removeMiniPlayer();

      pipContainer = document.createElement("div");
      pipContainer.id = "custom-pip-player";
      pipContainer.innerHTML = `
        <iframe 
          src="${tab.linkedBrowser.currentURI.spec}" 
          allow="autoplay; encrypted-media" 
          frameborder="0">
        </iframe>
      `;

      const activeTab = tab;
      activeTab.parentNode.insertBefore(pipContainer, activeTab.nextSibling);
    }

    function removeMiniPlayer() {
      if (pipContainer) {
        pipContainer.remove();
        pipContainer = null;
      }
    }

    function checkMedia() {
      for (let tab of gBrowser.tabs) {
        if (tab.hasAttribute("soundplaying") && !tab.selected) {
          createMiniPlayer(tab);
          return;
        }
      }
      removeMiniPlayer();
    }

    gBrowser.tabContainer.addEventListener("TabAttrModified", checkMedia);
    gBrowser.tabContainer.addEventListener("TabSelect", checkMedia);
  },

  onunload() {
    console.log("[PiP Under Tab] Unloaded");
  }
};
