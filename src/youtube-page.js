(() => {
  if (window.__mizuInstalled) return;
  window.__mizuInstalled = true;
  const send = (type, value) => window.postMessage({ source: 'mizu-player', type, value }, location.origin, value instanceof ArrayBuffer ? [value] : []);
  let normalizationOff = false;
  const volumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const hooked = new WeakSet();
  function desiredVolume(fallback) {
    const player = document.querySelector('#movie_player');
    const volume = player?.getVolume?.();
    return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume / 100)) : fallback;
  }
  function applyNormalization(video) {
    if (normalizationOff && !hooked.has(video) && volumeDescriptor) {
      Object.defineProperty(video, 'volume', { configurable: true,
        get() { return volumeDescriptor.get.call(this); },
        set(value) { volumeDescriptor.set.call(this, normalizationOff ? desiredVolume(value) : value); }
      });
      hooked.add(video);
    }
    if (normalizationOff && volumeDescriptor) volumeDescriptor.set.call(video, desiredVolume(video.volume));
    if (!normalizationOff && hooked.has(video)) {
      delete video.volume; hooked.delete(video);
      const player = document.querySelector('#movie_player');
      player?.setVolume?.(player.getVolume());
    }
  }
  function playing() {
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (player?.classList.contains('ad-showing') || player?.classList.contains('ad-interrupting')) return;
    const media = player?.querySelector('video') || document.querySelector('video');
    if (!media || media.paused || media.ended || media.readyState < 2) return;
    const read = method => { try { return player?.[method]?.(); } catch { return undefined; } };
    const state = read('getPlayerState');
    if (state !== undefined && state !== 1) return;
    const data = read('getVideoData');
    const response = read('getPlayerResponse');
    // During autoplay the player changes before history.replaceState/getURL.
    // Carry the actual playing ID across IPC instead of re-reading a stale URL.
    const candidates = [data?.video_id, data?.videoId, response?.videoDetails?.videoId,
      document.querySelector('ytd-watch-flexy')?.getAttribute('video-id'),
      new URL(location.href).searchParams.get('v'), /^\/(?:shorts|live)\/([^/]+)/.exec(location.pathname)?.[1]];
    const id = candidates.find(value => typeof value === 'string' && /^[\w-]{11}$/.test(value));
    if (id) send('playing', { videoId: id, fullUrl: location.href });
  }
  function scan() {
    for (const video of document.querySelectorAll('video')) applyNormalization(video);
    const controls = document.querySelector('.ytp-right-controls-left') || document.querySelector('.ytp-right-controls');
    if (controls && !controls.querySelector('.mizu-normalization')) {
      const button = document.createElement('button');
      button.className = 'ytp-button mizu-normalization';
      button.style.cssText = 'width:auto;padding:0 10px;font-size:12px;vertical-align:top;font-weight:700';
      button.addEventListener('click', () => send('toggle-normalization'));
      controls.prepend(button);
    }
    for (const button of document.querySelectorAll('.mizu-normalization')) {
      const label = normalizationOff ? '音量補正 OFF' : '音量補正 ON';
      if (button.textContent !== label) button.textContent = label;
      button.setAttribute('aria-label', 'ラウドネスノーマライゼーションの切り替え');
      button.setAttribute('aria-pressed', String(normalizationOff));
      button.title = 'YouTubeの音量減衰を無効化（実験的・Stable volumeはYouTube設定で別途OFF）';
      button.style.color = normalizationOff ? '#78e3d3' : '#ffffff';
    }
  }
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.source === 'mizu-settings') { normalizationOff = !!event.data.normalizationOff; scan(); }
  });
  for (const event of ['yt-navigate-finish', 'yt-player-updated', 'yt-page-data-updated', 'yt-player-state-change']) {
    document.addEventListener(event, () => { scan(); playing(); });
  }
  document.addEventListener('playing', playing, true);
  document.addEventListener('loadedmetadata', playing, true);
  let scheduled = false;
  new MutationObserver(() => { if (!scheduled) { scheduled = true; setTimeout(() => { scheduled = false; scan(); }, 150); } }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { scan(); playing(); }, 750);
  scan();
})();
