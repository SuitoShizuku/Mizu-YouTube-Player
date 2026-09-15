const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { playbackUrl } = require('../src/core.cjs');
const { Forwarder } = require('../src/forwarder.cjs');
function page() {
  const sent = [], ticks = [], events = {};
  const media = { paused: false, ended: false, readyState: 4 };
  let currentId = 'aaaaaaaaaaa', isAd = false;
  const player = { classList: { contains: name => isAd && name === 'ad-showing' }, querySelector: () => media, getPlayerState: () => 1, getVideoData: () => ({ video_id: currentId }) };
  const location = { href: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PL123&t=20', pathname: '/watch', origin: 'https://www.youtube.com' };
  const document = { documentElement: {}, addEventListener: (name, fn) => { events[name] = fn; }, querySelector: selector => selector === '#movie_player' ? player : selector === 'video' ? media : null, querySelectorAll: () => [] };
  const window = { postMessage: message => sent.push(message), addEventListener() {} };
  const sandbox = { window, document, location, URL, ArrayBuffer, HTMLMediaElement: function() {}, MutationObserver: class { observe() {} }, setInterval: fn => ticks.push(fn), setTimeout: fn => fn() };
  vm.runInNewContext(fs.readFileSync('src/youtube-page.js', 'utf8'), sandbox);
  return { sent, tick: () => ticks.forEach(fn => fn()), current: id => { currentId = id; }, ad: value => { isAd = value; }, media, location, player, events };
}
test('autoplay reports the actual player ID before the address bar updates', () => {
  const p = page(); p.tick(); p.current('bbbbbbbbbbb'); p.tick();
  const reports = p.sent.filter(x => x.type === 'playing');
  assert.equal(reports[0].value.videoId, 'aaaaaaaaaaa');
  assert.equal(reports[1].value.videoId, 'bbbbbbbbbbb');
  assert.equal(playbackUrl(reports[1].value), 'https://www.youtube.com/watch?v=bbbbbbbbbbb&list=PL123');
});
test('autoplay falls back to player response and excludes ads/paused videos', () => {
  const p = page(); p.player.getVideoData = () => ({}); p.player.getPlayerResponse = () => ({ videoDetails: { videoId: 'ccccccccccc' } });
  p.tick(); assert.equal(p.sent.filter(x => x.type === 'playing')[0].value.videoId, 'ccccccccccc');
  const count = p.sent.length; p.ad(true); p.tick(); assert.equal(p.sent.length, count);
  p.ad(false); p.media.paused = true; p.tick(); assert.equal(p.sent.length, count);
});
test('untrusted playback reports cannot forward off-site URLs', () => {
  assert.equal(playbackUrl({ videoId: 'aaaaaaaaaaa', fullUrl: 'https://evil.test/' }), null);
  assert.equal(playbackUrl({ videoId: 'bad', fullUrl: 'https://www.youtube.com/' }), null);
});
test('late URL updates do not cancel or duplicate an autoplay webhook', async () => {
  let resolveMetadata; const posts = [];
  const settings = { forwarding: true, apiKey: 'key', rules: [{ categoryId: '10', url: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456', format: '{url}' }] };
  const forwarder = new Forwarder(() => settings, () => {}, async (url, options) => {
    if (options.method) { posts.push(options.body); return { ok: true }; }
    return new Promise(resolve => { resolveMetadata = resolve; });
  });
  const next = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
  const pending = forwarder.playing(next);
  forwarder.navigate(next); // Electron reports the URL after the playing message.
  resolveMetadata({ ok: true, json: async () => ({ items: [{ snippet: { categoryId: '10' }, contentDetails: { duration: 'PT1S' } }] }) });
  await pending; await forwarder.playing(next);
  assert.equal(posts.length, 1); assert.match(posts[0], /bbbbbbbbbbb/);
});
