const { isYouTube } = require('./core.cjs');
const accountHosts = new Set(['accounts.google.com', 'accounts.google.co.jp', 'accounts.youtube.com']);
function allowedNavigation(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (isYouTube(value) || accountHosts.has(url.hostname)) return true;
    if (['consent.youtube.com', 'consent.google.com', 'consent.google.co.jp', 'myaccount.google.com'].includes(url.hostname)) return true;
    return ['www.google.com', 'www.google.co.jp'].includes(url.hostname) && url.pathname.startsWith('/accounts/');
  } catch { return false; }
}
function signInUrl(candidate) {
  try {
    const url = new URL(candidate);
    if (allowedNavigation(url.href) && ['accounts.google.com', 'accounts.google.co.jp'].includes(url.hostname)
      && /^\/(?:ServiceLogin|InteractiveLogin|AccountChooser|signin(?:\/|$)|v3\/signin(?:\/|$))/.test(url.pathname)) return url.href;
  } catch { /* A button without an anchor uses the standard sign-in entry. */ }
  const url = new URL('https://accounts.google.com/ServiceLogin');
  url.search = new URLSearchParams({ service: 'youtube', hl: 'ja', continue: 'https://www.youtube.com/signin?action_handle_signin=true&app=desktop&next=https%3A%2F%2Fwww.youtube.com%2F' });
  return url.href;
}
function navigationCode(error) {
  if (/^ERR_[A-Z_]+$/.test(error?.code || '')) return error.code;
  const match = /\bERR_[A-Z_]+\b/.exec(error?.message || '');
  if (match) return match[0];
  return Number.isInteger(error?.errno) ? String(error.errno) : 'UNKNOWN';
}
function wasAborted(error) { return error?.errno === -3 || error?.errorCode === -3 || navigationCode(error) === 'ERR_ABORTED'; }
function safeLocation(value) { try { const url = new URL(value); return url.origin + url.pathname; } catch { return 'invalid-url'; } }
module.exports = { allowedNavigation, signInUrl, navigationCode, wasAborted, safeLocation };
