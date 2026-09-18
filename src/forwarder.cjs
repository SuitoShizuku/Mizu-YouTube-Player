const { videoId, durationSeconds, formatMessage } = require('./core.cjs');
class Forwarder {
  constructor(getSettings, notify, request = fetch) { this.getSettings = getSettings; this.notify = notify; this.request = request; this.generation = 0; this.current = null; }
  cancel() { this.generation++; this.controller?.abort(); this.current = null; }
  navigate(fullUrl) {
    const next = videoId(fullUrl);
    if (!next) { this.cancel(); return; }
    if (this.current && next !== this.current) {
      this.generation++; this.controller?.abort();
      // Preserve the previous ID until the new video actually plays. This also
      // prevents replaying the old notification during an SPA transition.
    }
  }
  async playing(fullUrl) {
    const id = videoId(fullUrl);
    if (!id || id === this.current) return;
    this.controller?.abort();
    const generation = ++this.generation;
    this.current = id;
    const settings = structuredClone(this.getSettings());
    if (!settings.forwarding || !settings.rules.length) return;
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(20000)]);
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.search = new URLSearchParams({ part: 'snippet,statistics,contentDetails', id, key: settings.apiKey });
      const response = await this.request(url, { signal, redirect: 'error' });
      if (!response.ok) throw Error(`YouTube情報取得: HTTP ${response.status}`);
      const item = (await response.json()).items?.[0];
      if (!item) throw Error('動画情報を取得できませんでした');
      if (generation !== this.generation) return;
      const data = { fullUrl, title: item.snippet.title, channel: item.snippet.channelTitle,
        categoryId: item.snippet.categoryId, date: item.snippet.publishedAt, view: item.statistics?.viewCount, like: item.statistics?.likeCount,
        dislike: item.statistics?.dislikeCount, duration: durationSeconds(item.contentDetails?.duration) };
      const matching = settings.rules.filter(rule => rule.categoryId === item.snippet.categoryId);
      if (matching.some(rule => rule.format.includes('{channel-subscribers}')) && item.snippet.channelId) {
        try {
          const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
          channelUrl.search = new URLSearchParams({ part: 'statistics', id: item.snippet.channelId, key: settings.apiKey });
          const channelResponse = await this.request(channelUrl, { signal, redirect: 'error' });
          if (channelResponse.ok) {
            const statistics = (await channelResponse.json()).items?.[0]?.statistics;
            if (!statistics?.hiddenSubscriberCount) data.channelSubscribers = statistics?.subscriberCount;
          }
        } catch (error) { if (signal.aborted) throw error; }
      }
      for (const rule of matching) {
        if (generation !== this.generation) return;
        const content = formatMessage(rule.format, data);
        if (content.length > 2000) throw Error('展開後のメッセージがDiscordの2000文字上限を超えています');
        // Do not retry an ambiguous POST: a duplicate playback message is worse than a reported failure.
        const result = await this.request(rule.url, { method: 'POST', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
        if (!result.ok) throw Error(`Discord転送: HTTP ${result.status}${result.status === 429 ? '（レート制限）' : ''}`);
      }
      if (matching.length) this.notify(`「${data.title}」を${matching.length}件のWebhookへ転送しました`);
    } catch (error) {
      if (generation === this.generation) this.notify(error.name === 'TimeoutError' ? '転送がタイムアウトしました' : error.message);
    }
  }
}
module.exports = { Forwarder };
