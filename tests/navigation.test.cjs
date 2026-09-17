const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowedWebNavigation, allowedNavigation, addressUrl } = require('../src/navigation.cjs');
test('address bar accepts ordinary websites while keeping login-specific boundaries', () => {
  for (const url of ['https://example.com/', 'http://localhost:8080/', 'https://example.org/path?q=one']) assert.equal(allowedWebNavigation(url), true);
  assert.equal(addressUrl(' example.com/path '), 'https://example.com/path');
  assert.equal(addressUrl('localhost:8080/test'), 'https://localhost:8080/test');
  for (const url of ['', 'javascript:alert(1)', 'file:///C:/secret', 'data:text/html,hello', 'https://user:pass@example.com/']) assert.throws(() => addressUrl(url));
  assert.equal(allowedNavigation('https://example.com/'), false);
});
