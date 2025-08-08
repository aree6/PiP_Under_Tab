(() => {
    const SIDEBAR_TAB_SELECTOR = '.tab-item'; // Change if Zen's class differs
    const PIP_HEIGHT = '180px';

    // When PiP starts
    document.addEventListener('enterpictureinpicture', (event) => {
        const video = event.target;
        const activeTab = findActiveTab();
        if (!activeTab) return;

        // Increase tab height for PiP
        activeTab.classList.add('pip-active');
        
        // Style the video
        video.classList.add('pip-video');

        // Create PiP container
        const pipContainer = document.createElement('div');
        pipContainer.classList.add('pip-container');
        pipContainer.appendChild(video);

        // Append below tab label
        activeTab.appendChild(pipContainer);
    });

    // When PiP ends
    document.addEventListener('leavepictureinpicture', (event) => {
        const video = event.target;
        const activeTab = findActiveTab();
        if (!activeTab) return;

        // Remove PiP container
        const container = activeTab.querySelector('.pip-container');
        if (container) container.remove();
        activeTab.classList.remove('pip-active');

        // Put video back in DOM if needed
        document.body.appendChild(video);
    });

    function findActiveTab() {
        const tabs = document.querySelectorAll(SIDEBAR_TAB_SELECTOR);
        for (let tab of tabs) {
            if (tab.classList.contains('active') || tab.dataset.playing === "true") {
                return tab;
            }
        }
        return null;
    }
})();
