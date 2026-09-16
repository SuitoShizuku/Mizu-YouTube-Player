const $ = id => document.getElementById(id);
let settings, categories, variables, timer;
const invoke = (name, ...args) => window.mizu.invoke(name, ...args);
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => { $('toast').hidden = true; }, 6000); }
async function action(name, ...args) { try { return await invoke(name, ...args); } catch (error) { toast(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } }
function button(label, callback) { const el = document.createElement('button'); el.textContent = label; el.addEventListener('click', callback); return el; }
function renderState(state) {
  if (document.activeElement !== $('address')) $('address').value = state.url;
  $('plugin-count').textContent = `${state.plugins.length} / 16`;
  $('plugin-loading').hidden = !state.loadingPlugin;
  $('plugin-loading').textContent = state.loadingPlugin ? `${state.loadingPlugin} を読み込み中…` : '';
  $('plugins').replaceChildren();
  if (!state.plugins.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'まだエフェクトがありません。\nお気に入りのVST3を追加しましょう。'; $('plugins').append(empty); }
  for (const plugin of state.plugins) {
    const el = document.createElement('div'); el.className = `plugin ${plugin.bypass ? 'bypassed' : ''}`;
    const title = document.createElement('strong'); title.textContent = plugin.name;
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('編集', () => action('plugin-action', 'editor', plugin.id)), button(plugin.bypass ? '有効にする' : 'バイパス', () => action('plugin-action', 'bypass', plugin.id)), button('削除', () => action('plugin-action', 'remove', plugin.id)));
    el.append(title, actions); $('plugins').append(el);
  }
}
function addRule(rule = { categoryId: '10', url: '', format: '🎵 {title}\n{channel}\n{url}' }) {
  const el = document.createElement('div'); el.className = 'rule';
  const title = document.createElement('div'); title.className = 'rule-title';
  const label = document.createElement('span'); label.textContent = '転送先';
  title.append(label, button('削除', () => el.remove())); el.append(title);
  function field(name, control) { const label = document.createElement('label'); label.className = 'field'; label.append(document.createTextNode(name), control); el.append(label); }
  const genre = document.createElement('select'); genre.className = 'category';
  for (const category of categories) { const option = document.createElement('option'); option.value = category.id; option.textContent = `${category.title} (${category.id})`; genre.append(option); } genre.value = rule.categoryId;
  const url = document.createElement('input'); url.type = 'url'; url.autocomplete = 'off'; url.spellcheck = false; url.className = 'webhook'; url.placeholder = 'https://discord.com/api/webhooks/…'; url.value = rule.url;
  const format = document.createElement('textarea'); format.className = 'format'; format.value = rule.format; format.maxLength = 1800;
  field('ジャンル', genre); field('Webhook URL', url); field('フォーマット', format);
  const preview = document.createElement('div'); preview.className = 'preview';
  const sample = { url: 'https://youtu.be/dQw4w9WgXcQ', 'full-url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30', title: 'サンプル動画', channel: 'サンプルチャンネル', view: '123456', like: '1234', dislike: '取得不可', date: '2026/09/16/12/00', 'relative-date': '1時間前', duration: '213秒', 'format-duration': '3分33秒' };
  function updatePreview() { preview.textContent = 'プレビュー（サンプル）\n' + format.value.replace(/\{([^{}]+)\}/g, (m, key) => sample[key] ?? m); }
  format.addEventListener('input', updatePreview); updatePreview(); el.append(preview); $('rules').append(el);
}
function fillSettings(value) {
  settings = value; $('api-key').value = value.apiKey; $('forwarding').checked = value.forwarding; $('normalization').checked = value.normalizationOff;
  $('rules').replaceChildren(); value.rules.forEach(addRule); $('save-status').textContent = '';
}
$('address-form').addEventListener('submit', event => { event.preventDefault(); void action('navigate', $('address').value.trim()); });
$('back').onclick = () => action('back'); $('reload').onclick = () => action('reload');
$('copy').onclick = async () => { const url = await action('copy'); if (url) toast(`コピーしました: ${url}`); };
$('settings-button').onclick = async () => {
  const open = $('settings').hidden;
  $('settings').hidden = !open;
  $('settings-button').setAttribute('aria-pressed', String(open));
  await action('settings-open', open);
  if (open) { const info = await action('extensions-info'); if (info) renderExtensions(info); }
};
let catalogData, scanning = false;
function renderCatalog() {
  const query = $('plugin-search').value.trim().toLowerCase();
  const matches = (catalogData?.plugins || []).filter(p => (p.name + ' ' + p.path).toLowerCase().includes(query));
  $('catalog-list').replaceChildren();
  for (const plugin of matches) {
    const row = document.createElement('div'); row.className = 'catalog-plugin';
    const info = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = plugin.name;
    const location = document.createElement('small'); location.textContent = plugin.path;
    info.append(name, location);
    const add = button('追加', async () => {
      add.disabled = true;
      try { await invoke('plugin-add', plugin.id); await closePicker(); }
      catch (error) { toast(error.message); }
      finally { add.disabled = false; }
    });
    row.append(info, add); $('catalog-list').append(row);
  }
  if (!matches.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = query ? '一致するプラグインがありません。' : 'VST3が見つかりません。インストール後に再スキャンしてください。'; $('catalog-list').append(empty); }
  $('catalog-status').textContent = matches.length + ' / ' + (catalogData?.plugins.length || 0) + ' 件の VST3' + (catalogData?.dllCount ? ' · 未対応の DLL ' + catalogData.dllCount + ' 件' : '');
}
async function scanCatalog(refresh = false) {
  if (scanning) return;
  scanning = true; $('plugin-rescan').disabled = true;
  $('catalog-status').textContent = 'プラグインをスキャン中…';
  try {
    catalogData = await invoke('plugin-catalog', refresh);
    $('catalog-roots').textContent = catalogData.roots.join('\n');
    $('catalog-warnings').textContent = catalogData.warnings.join('\n');
    renderCatalog();
  } catch (error) { $('catalog-status').textContent = 'スキャンに失敗しました: ' + error.message; }
  finally { scanning = false; $('plugin-rescan').disabled = false; }
}
async function closePicker() {
  $('plugin-picker').close();
  await action('plugin-picker-open', false);
  $('plugin-add').focus();
}
$('plugin-add').onclick = async () => {
  await action('plugin-picker-open', true);
  $('plugin-picker').showModal(); $('plugin-search').focus();
  await scanCatalog();
};
$('picker-close').onclick = closePicker;
$('plugin-picker').addEventListener('cancel', event => { event.preventDefault(); void closePicker(); });
$('plugin-search').oninput = () => { if (!scanning) renderCatalog(); };
$('plugin-rescan').onclick = () => scanCatalog(true);
function renderPresets(items) {
  const selected = $('preset-list').value; $('preset-list').replaceChildren();
  for (const item of items) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $('preset-list').append(option); }
  if (items.some(p => p.id === selected)) $('preset-list').value = selected;
  $('preset-load').disabled = $('preset-delete').disabled = !items.length;
}
async function presetAction(name, value) {
  const controls = ['preset-save', 'preset-load', 'preset-delete', 'plugin-add'];
  controls.forEach(id => $(id).disabled = true);
  try { await invoke(name, value); renderPresets(await invoke('presets')); toast(name === 'preset-load' ? 'チェーンを読み込みました' : name === 'preset-save' ? 'プリセットを保存しました' : 'プリセットを削除しました'); }
  catch (error) { toast(error.message); }
  finally { controls.forEach(id => $(id).disabled = false); const items = await action('presets'); if (items) renderPresets(items); }
}
$('preset-list').onchange = () => { $('preset-name').value = $('preset-list').selectedOptions[0]?.textContent || ''; };
$('preset-save').onclick = () => presetAction('preset-save', $('preset-name').value);
$('preset-load').onclick = () => presetAction('preset-load', $('preset-list').value);
$('preset-delete').onclick = () => presetAction('preset-delete', $('preset-list').value);
function renderExtensions(info) {
  $('extensions-path').textContent = info.directory; $('extensions-list').replaceChildren();
  for (const item of info.entries) {
    const row = document.createElement('div'); row.className = 'extension-entry';
    const label = document.createElement('p'); label.textContent = item.name + (item.loaded ? ' · ' + item.version : ' · 読み込み失敗: ' + item.error); row.append(label);
    if (item.loaded && item.options) row.append(button('拡張機能の設定', () => action('extension-options', item.id)));
    $('extensions-list').append(row);
  }
}
$('extensions-folder').onclick = () => action('extensions-folder');
$('extensions-scan').onclick = async () => {
  $('extensions-scan').disabled = true;
  try { renderExtensions(await invoke('extensions-scan')); } catch (error) { toast(error.message); }
  finally { $('extensions-scan').disabled = false; }
};
(async () => { const items = await action('presets'); if (items) renderPresets(items); const info = await action('extensions-info'); if (info) renderExtensions(info); })();
$('rule-add').onclick = () => { if ($('rules').children.length < 50) addRule(); else toast('転送先は50件までです'); };
$('save').onclick = async () => {
  const rules = [...document.querySelectorAll('.rule')].map(el => ({ categoryId: el.querySelector('.category').value, url: el.querySelector('.webhook').value.trim(), format: el.querySelector('.format').value }));
  const saved = await action('settings-save', { ...settings, apiKey: $('api-key').value, forwarding: $('forwarding').checked, normalizationOff: $('normalization').checked, rules });
  if (saved) { settings = saved; $('save-status').textContent = '保存しました'; }
};
window.mizu.onState(renderState); window.mizu.onNotice(toast);
(async () => { const initial = await action('initial'); if (!initial) return; categories = initial.categories; variables = initial.variables; fillSettings(initial.settings); renderState(initial.status);
  for (const variable of variables) { const code = document.createElement('code'); code.textContent = `{${variable}}`; $('variables').append(code); }
})();
