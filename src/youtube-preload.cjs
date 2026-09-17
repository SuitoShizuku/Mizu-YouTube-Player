const { ipcRenderer } = require('electron');
if (process.isMainFrame) {
  window.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(location.hostname)) return;
    const path = event.composedPath();
    const anchor = path.find(node => node?.tagName === 'A' && node.href);
    const signInButton = path.find(node => (node?.tagName === 'BUTTON' || node?.getAttribute?.('role') === 'button')
      && /^(?:ログイン|Sign in)$/i.test((node.getAttribute('aria-label') || node.textContent || '').trim()));
    try {
      const url = anchor ? new URL(anchor.href) : null;
      if (signInButton || (url?.protocol === 'https:' && ['accounts.google.com', 'accounts.google.co.jp'].includes(url.hostname)
        && /\/(?:ServiceLogin|InteractiveLogin|signin|v3\/signin)/.test(url.pathname))) {
        event.preventDefault(); event.stopImmediatePropagation();
        ipcRenderer.send('sign-in', url?.href);
      }
    } catch { /* Not a URL link. */ }
  }, true);
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'mizu-player') return;
    const { type, value } = event.data;
    if (type === 'playing' && typeof value?.videoId === 'string' && typeof value?.fullUrl === 'string') ipcRenderer.send('player-playing', value);
    if (type === 'toggle-normalization') ipcRenderer.send('normalization-toggle');
  });
  ipcRenderer.on('normalization', (_event, enabled) => window.postMessage({ source: 'mizu-settings', normalizationOff: !!enabled }, location.origin));
}
