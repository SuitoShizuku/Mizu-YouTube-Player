const { test } = require('node:test');
const assert = require('node:assert/strict');
const { videoId, shortUrl, validWebhook, formatMessage, formatDate, durationSeconds, validateSettings } = require('../src/core.cjs');
const id = 'dQw4w9WgXcQ';
const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456';
test('canonical URLs remove timestamps, playlists, and sharing parameters', () => {
  for (const url of [`https://www.youtube.com/watch?v=${id}&list=PL12&t=20&si=foo`, `https://youtu.be/${id}?si=foo`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`]) assert.equal(shortUrl(url), `https://youtu.be/${id}`);
});
test('URL parsing rejects lookalike hosts, non-HTTPS URLs and malformed IDs', () => {
  for (const url of ['https://youtube.com.evil.test/watch?v='+id, 'javascript:alert(1)', 'https://www.youtube.com/watch?v=short', 'https://evil.test/'+id, 'http://youtu.be/'+id, 'https://attacker@youtu.be/'+id]) assert.equal(videoId(url), null);
});
test('webhooks cannot point to arbitrary servers or carry redirect query strings', () => {
  assert.equal(validWebhook(webhook), true);
  for (const url of [webhook.replace('discord.com', 'localhost'), webhook.replace('https:', 'http:'), webhook+'?x=1', webhook.replace('discord.com', 'discord.com:444'), 'https://discord.com/api/webhooks/foo/bar']) assert.equal(validWebhook(url), false);
});
test('all template variables retain zeros and format durations / Japanese dates', () => {
  const data = { fullUrl: `https://www.youtube.com/watch?v=${id}&t=3`, title: 'title', channel: 'channel', view: '0', like: 0, date: '2026-01-01T00:00:00Z', duration: 3661 };
  assert.equal(formatMessage('{url}|{full-url}|{title}|{channel}|{view}|{like}|{dislike}|{date}|{relative-date}|{duration}|{format-duration}', data, Date.parse('2026-01-02T00:00:00Z')),
    `https://youtu.be/${id}|${data.fullUrl}|title|channel|0|0|取得不可|2026/01/01/09/00|1日前|3661秒|61分1秒`);
  assert.equal(formatDate('bad'), '取得不可');
  assert.equal(durationSeconds('P1DT2H3M4S'), 93784);
  assert.equal(durationSeconds('PT0S'), 0);
  assert.equal(durationSeconds('bad'), null);
});
test('settings validation prevents unknown variables and forwarding without API key', () => {
  const input = { apiKey: 'key', forwarding: true, normalizationOff: false, rules: [{ categoryId: '10', url: webhook, format: '{title} {url}' }] };
  assert.equal(validateSettings(input).rules.length, 1);
  assert.throws(() => validateSettings({ ...input, apiKey: '' }));
  assert.throws(() => validateSettings({ ...input, rules: [{ ...input.rules[0], format: '{unknown}' }] }));
  assert.throws(() => validateSettings({ ...input, rules: [{ ...input.rules[0], categoryId: '999' }] }));
});

test('compact counts truncate one decimal and preserve missing versus zero', () => {
  for (const [view, en, ja] of [['12500','12.5k','1.2万'],['0','0','0'],['999','999','999'],['1000','1k','1000'],['1000000','1M','100万'],['1000000000','1B','10億'],[undefined,'取得不可','取得不可']]) {
    assert.equal(formatMessage('{format-view-en}|{format-view-ja}', {view}), `${en}|${ja}`);
  }
  assert.equal(formatMessage('{channel-subscribers}|{genre}|{genre-en}', {channelSubscribers:'0',categoryId:'10'}), '0|音楽|Music');
  assert.equal(formatMessage('{genre}|{genre-en}', {categoryId:'27'}), '教育|Education');
  assert.equal(formatMessage('{channel-subscribers}|{genre}', {}), '取得不可|取得不可');
});

test('output device defaults migrate and selection is validated', () => {
  const input={apiKey:'',forwarding:false,rules:[]};
  assert.equal(validateSettings(input).outputDevice,'');
  assert.equal(validateSettings({...input,outputDevice:'Headphones'}).outputDevice,'Headphones');
  for(const outputDevice of [123,'x'.repeat(513),'a\0b']) assert.throws(()=>validateSettings({...input,outputDevice}));
});
