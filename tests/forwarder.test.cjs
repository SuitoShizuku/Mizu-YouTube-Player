const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Forwarder } = require('../src/forwarder.cjs');
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10';
const rule = { categoryId: '10', url: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456', format: '{title} {url}' };
const settings = () => ({ forwarding: true, apiKey: 'key', rules: [rule] });
const item = { snippet: { categoryId: '10', title: '@everyone music', channelTitle: 'channel', publishedAt: '2026-01-01T00:00:00Z' }, statistics: { viewCount: '0' }, contentDetails: { duration: 'PT3M' } };
const response = () => ({ ok: true, json: async () => ({ items: [item] }) });
test('routes matching categories once per playback and suppresses Discord mentions', async () => {
  const calls = [];
  const forwarder = new Forwarder(settings, () => {}, async (u, options) => { calls.push({ u, options }); return response(); });
  await forwarder.playing(url); await forwarder.playing(url+'&si=other');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].u, rule.url);
  assert.deepEqual(JSON.parse(calls[1].options.body).allowed_mentions, { parse: [] });
  assert.match(JSON.parse(calls[1].options.body).content, /youtu\.be\/dQw4w9WgXcQ/);
});
test('nonmatching category does not send a webhook', async () => {
  const calls = [];
  const forwarder = new Forwarder(() => ({ ...settings(), rules: [{ ...rule, categoryId: '20' }] }), () => {}, async (u, options) => { calls.push(options); return response(); });
  await forwarder.playing(url); assert.equal(calls.length, 1);
});
test('switching video invalidates old metadata requests even if transport ignores abort', async () => {
  let complete; const posts = [];
  const forwarder = new Forwarder(settings, () => {}, async (u, options) => {
    if (options.method === 'POST') { posts.push(options.body); return response(); }
    if (String(u).includes('dQw4w9WgXcQ')) return new Promise(resolve => { complete = resolve; });
    return response();
  });
  const first = forwarder.playing(url);
  await forwarder.playing('https://youtu.be/abcdefghijk');
  complete(response()); await first;
  assert.equal(posts.length, 1); assert.match(posts[0], /abcdefghijk/);
});
test('disabled forwarding makes no network requests', async () => {
  const forwarder = new Forwarder(() => ({ ...settings(), forwarding: false }), () => {}, () => { throw Error('should not run'); });
  await forwarder.playing(url);
});
test('429 is reported without repeated posts', async () => {
  const notices = []; let count = 0;
  const forwarder = new Forwarder(settings, text => notices.push(text), async (_u, options) => { if (options.method) { count++; return { ok: false, status: 429 }; } return response(); });
  await forwarder.playing(url); await forwarder.playing(url);
  assert.equal(count, 1); assert.match(notices[0], /429/);
});
test('expanded messages over Discord limit never get sent', async () => {
  let posted = false;
  const forwarder = new Forwarder(settings, () => {}, async (_u, options) => { if (options.method) posted = true; return { ok: true, json: async () => ({ items: [{ ...item, snippet: { ...item.snippet, title: 'x'.repeat(2100) } }] }) }; });
  await forwarder.playing(url); assert.equal(posted, false);
});
