const $ = id => document.getElementById(id);
let settings, categories, variables, timer;
const invoke = (name, ...args) => window.mizu.invoke(name, ...args);
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => { $('toast').hidden = true; }, 6000); }
async function action(name, ...args) { try { return await invoke(name, ...args); } catch (error) { toast(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } }
function button(label, callback) { const el = document.createElement('button'); el.textContent = label; el.addEventListener('click', callback); return el; }
const iconPaths = {
  power: 'M12 2v10 M5.6 5.6a9 9 0 1 0 12.8 0',
  pen: 'm15 4 5 5 M3 21l5-1L21 7a2.1 2.1 0 0 0-5-5L3 15v6Z',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  save: 'M4 3h13l4 4v14H3V3h1 M7 3v6h10V3 M7 21v-8h10v8',
  close: 'm6 6 12 12 M18 6 6 18'
};
function setIcon(el, icon, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', iconPaths[icon]); svg.append(path);
  el.replaceChildren(svg); el.classList.add('tool-icon'); el.title = label; el.setAttribute('aria-label', label);
  return el;
}
function iconButton(icon, label, callback) { return setIcon(button('', callback), icon, label); }
function renderState(state) {
  if (document.activeElement !== $('address')) $('address').value = state.url;
  $('plugin-count').textContent = `${state.plugins.length} / 16`;
  $('plugin-loading').hidden = !state.loadingPlugin;
  $('plugin-loading').textContent = state.loadingPlugin ? `${state.loadingPlugin} を読み込み中…` : '';
  $('plugins').replaceChildren();
  if (!state.plugins.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'まだエフェクトがありません。\nお気に入りのVST3を追加しましょう。'; $('plugins').append(empty); }
  for (const plugin of state.plugins) {
    const el = document.createElement('div'); el.className = `plugin ${plugin.bypass ? 'bypassed' : ''}`;
    const title = document.createElement('strong'); title.textContent = plugin.name; title.title = plugin.name;
    const actions = document.createElement('div'); actions.className = 'actions';
    const power = iconButton('power', plugin.bypass ? 'エフェクトを有効にする' : 'エフェクトをバイパス', () => action('plugin-action', 'bypass', plugin.id));
    power.setAttribute('aria-pressed', String(!plugin.bypass));
    actions.append(power, iconButton('pen', 'エフェクトを編集', () => action('plugin-action', 'editor', plugin.id)), iconButton('trash', 'エフェクトを削除', () => action('plugin-action', 'remove', plugin.id)));
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
let presetItems = [], selectedPreset = null, presetBusy = false, filterPresets = false;
function showPresetMenu(open) {
  $('preset-menu').hidden = !open;
  $('preset-name').setAttribute('aria-expanded', String(open)); $('preset-toggle').setAttribute('aria-expanded', String(open));
}
function renderPresets(items = presetItems) {
  presetItems = items;
  $('preset-menu').replaceChildren();
  const query = filterPresets ? $('preset-name').value.toLowerCase().trim() : '';
  const matches = items.filter(p => p.name.toLowerCase().includes(query));
  for (const item of matches) {
    const row = document.createElement('div'); row.className = 'preset-option';
    const choose = button(item.name, () => presetAction('load', item)); choose.className = 'preset-choose'; choose.title = item.name;
    choose.setAttribute('aria-current', String(item.id === selectedPreset));
    const remove = iconButton('close', item.name + ' を削除', () => presetAction('delete', item));
    choose.disabled = remove.disabled = presetBusy;
    row.append(choose, remove); $('preset-menu').append(row);
  }
  if (!matches.length) { const empty = document.createElement('p'); empty.className = 'preset-empty'; empty.textContent = query ? '新しい名前で保存できます' : '保存済みプリセットはありません'; $('preset-menu').append(empty); }
}
async function presetAction(operation, item) {
  if (presetBusy) return;
  const name = $('preset-name').value.trim();
  if (operation === 'save' && !name) { toast('プリセット名を入力してください'); $('preset-name').focus(); return; }
  presetBusy = true;
  const controls = ['preset-name', 'preset-save', 'preset-toggle', 'plugin-add'];
  controls.forEach(id => $(id).disabled = true); renderPresets();
  try {
    if (operation === 'load') {
      await invoke('preset-load', item.id); selectedPreset = item.id; $('preset-name').value = item.name;
      filterPresets = false; showPresetMenu(false);
    } else if (operation === 'save') {
      const items = await invoke('preset-save', name, selectedPreset ? { mode: 'update', id: selectedPreset } : { mode: 'create' });
      selectedPreset = items.at(-1).id; filterPresets = false; showPresetMenu(false);
    } else {
      await invoke('preset-delete', item.id);
      if (selectedPreset === item.id) { selectedPreset = null; $('preset-name').value = ''; }
    }
    toast(operation === 'load' ? 'チェーンを読み込みました' : operation === 'save' ? 'プリセットを保存しました' : 'プリセットを削除しました');
  } catch (error) { toast(error.message); }
  finally {
    presetBusy = false; controls.forEach(id => $(id).disabled = false);
    const items = await action('presets'); if (items) renderPresets(items);
    if (operation !== 'delete') $('preset-name').focus();
  }
}
setIcon($('preset-save'), 'save', 'プリセットを保存');
$('preset-save').onclick = () => presetAction('save');
$('preset-toggle').onclick = () => { filterPresets = false; renderPresets(); showPresetMenu($('preset-menu').hidden); };
$('preset-name').onclick = () => { renderPresets(); showPresetMenu(true); };
$('preset-name').oninput = () => { selectedPreset = null; filterPresets = true; renderPresets(); showPresetMenu(true); };
$('preset-name').onkeydown = event => {
  if (event.isComposing) return;
  if (event.key === 'ArrowDown') { event.preventDefault(); renderPresets(); showPresetMenu(true); $('preset-menu').querySelector('.preset-choose')?.focus(); }
  if (event.key === 'Escape') showPresetMenu(false);
  if (event.key === 'Enter') { event.preventDefault(); void presetAction('save'); }
};
$('preset-menu').onkeydown = event => {
  if (event.key === 'Escape') { showPresetMenu(false); $('preset-name').focus(); }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); const choices = [...$('preset-menu').querySelectorAll('.preset-choose')];
    const index = choices.indexOf(document.activeElement); choices[(index + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length]?.focus();
  }
};
document.addEventListener('pointerdown', event => { if (!event.target.closest('.presets')) showPresetMenu(false); });
document.addEventListener('focusin', event => { if (!event.target.closest('.presets')) showPresetMenu(false); });
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
