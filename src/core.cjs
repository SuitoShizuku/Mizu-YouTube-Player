const CATEGORY_LIST = [
  ['1', '映画とアニメ'], ['2', '自動車と乗り物'], ['10', '音楽'], ['15', 'ペットと動物'],
  ['17', 'スポーツ'], ['19', '旅行とイベント'], ['20', 'ゲーム'], ['22', 'ブログ'],
  ['23', 'コメディー'], ['24', 'エンターテイメント'], ['25', 'ニュースと政治'],
  ['26', 'ハウツーとスタイル'], ['27', '教育'], ['28', '科学と技術'], ['29', '非営利団体と社会活動'],
  ['30', '映画'], ['31', 'アニメーション'], ['32', 'アクション／アドベンチャー'], ['33', 'クラシック'],
  ['34', 'コメディー映画'], ['35', 'ドキュメンタリー'], ['36', 'ドラマ'], ['37', 'ファミリー'],
  ['38', '外国映画'], ['39', 'ホラー'], ['40', 'SF／ファンタジー'], ['41', 'スリラー'],
  ['42', '短編'], ['43', '番組'], ['44', '予告編']
].map(([id, title]) => ({ id, title }));
const VARIABLES = ['url', 'full-url', 'title', 'channel', 'view', 'like', 'dislike', 'date', 'relative-date', 'duration', 'format-duration'];
function videoId(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    let id;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(u.hostname)) {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(?:shorts|live|embed)\/([^/]+)/.exec(u.pathname)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
function shortUrl(url) { const id = videoId(url); return id ? `https://youtu.be/${id}` : null; }
function playbackUrl(report) {
  if (!report || !/^[\w-]{11}$/.test(report.videoId || '') || typeof report.fullUrl !== 'string' || report.fullUrl.length > 4000 || !isYouTube(report.fullUrl)) return null;
  if (videoId(report.fullUrl) === report.videoId) return report.fullUrl;
  const url = new URL(report.fullUrl);
  url.pathname = '/watch'; url.searchParams.set('v', report.videoId);
  for (const key of ['t', 'start', 'si', 'index']) url.searchParams.delete(key);
  url.hash = '';
  return url.href;
}
function isYouTube(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(u.hostname); } catch { return false; }
}
function validWebhook(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'discord.com' && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/api\/webhooks\/\d{10,25}\/[A-Za-z0-9_-]{20,200}$/.test(u.pathname); } catch { return false; }
}
function relativeDate(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '取得不可';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  for (const [unit, label] of [[31536000, '年前'], [2592000, 'ヶ月前'], [86400, '日前'], [3600, '時間前'], [60, '分前']]) {
    if (seconds >= unit) return `${Math.floor(seconds / unit)}${label}`;
  }
  return '1分未満前';
}
function formatDate(value) {
  if (!Number.isFinite(Date.parse(value))) return '取得不可';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return [p.year, p.month, p.day, p.hour, p.minute].join('/');
}
function durationSeconds(iso) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso || '');
  return m ? Math.floor(Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0)) : null;
}
function formatMessage(template, data, now) {
  const seconds = Number.isFinite(data.duration) ? Math.max(0, Math.floor(data.duration)) : null;
  const vars = {
    url: shortUrl(data.fullUrl), 'full-url': data.fullUrl, title: data.title, channel: data.channel,
    view: data.view, like: data.like, dislike: data.dislike,
    date: formatDate(data.date), 'relative-date': relativeDate(data.date, now),
    duration: seconds === null ? null : `${seconds}秒`,
    'format-duration': seconds === null ? null : `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  };
  return template.replace(/\{([^{}]+)\}/g, (token, key) => Object.hasOwn(vars, key) ? String(vars[key] ?? '取得不可') : token);
}
function validateSettings(input) {
  if (!input || typeof input !== 'object') throw Error('設定が不正です');
  if (typeof input.apiKey !== 'string' || input.apiKey.length > 200) throw Error('APIキーが不正です');
  if (!Array.isArray(input.rules) || input.rules.length > 50) throw Error('転送ルールは50件までです');
  const rules = input.rules.map(rule => {
    if (!CATEGORY_LIST.some(c => c.id === rule.categoryId)) throw Error('ジャンルが不正です');
    if (!validWebhook(rule.url)) throw Error('Discord Webhook URLが不正です（discord.com/api/webhooks/…）');
    if (typeof rule.format !== 'string' || !rule.format.trim() || rule.format.length > 1800) throw Error('フォーマットは1〜1800文字です');
    const unknown = [...rule.format.matchAll(/\{([^{}]+)\}/g)].find(m => !VARIABLES.includes(m[1]));
    if (unknown) throw Error(`未対応の変数: ${unknown[0]}`);
    return { categoryId: rule.categoryId, url: rule.url, format: rule.format };
  });
  if (input.forwarding && !input.apiKey.trim()) throw Error('転送にはYouTube Data API v3キーが必要です');
  return { apiKey: input.apiKey.trim(), forwarding: !!input.forwarding, normalizationOff: !!input.normalizationOff, rules };
}
module.exports = { CATEGORY_LIST, VARIABLES, videoId, shortUrl, playbackUrl, isYouTube, validWebhook, formatMessage, relativeDate, formatDate, durationSeconds, validateSettings };
