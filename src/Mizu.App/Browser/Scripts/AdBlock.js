// Scoped cosmetic rules; CSS also covers later SPA nodes.
// Leave the video player, ad-block warnings, and login/consent dialogs intact.
(() => {
    if (location.protocol !== 'https:' ||
        !(location.hostname === 'youtube.com' || location.hostname.endsWith('.youtube.com'))) return;
    const id = 'mizu-ad-block-style';
    document.getElementById(id)?.remove();
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
        ytd-ad-slot-renderer,
        ytd-display-ad-renderer,
        ytd-in-feed-ad-layout-renderer,
        ytd-promoted-sparkles-web-renderer,
        ytd-promoted-video-renderer,
        ytd-action-companion-ad-renderer,
        #masthead-ad { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
})();
