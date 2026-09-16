const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function validateChain(chain) {
  if (!Array.isArray(chain) || chain.length > 16 || chain.some(p => !p || typeof p.path !== 'string' || !path.isAbsolute(p.path) || !/\.vst3$/i.test(p.path) || typeof p.state !== 'string' || p.state.length > 32 * 1024 * 1024 || typeof p.bypass !== 'boolean')) throw Error('保存されたチェーンが不正です');
  return chain.map(({ path, state, bypass }) => ({ path, state, bypass }));
}
class Chains {
  constructor(directory, host) {
    this.file = path.join(directory, 'effect-chains.json'); this.host = host;
    this.data = { version: 1, last: [], presets: [] }; this.queue = Promise.resolve(); this.protectLast = false;
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.presets)) throw Error('プリセットファイルが不正です');
      validateChain(data.last); data.presets.forEach(p => validateChain(p.chain)); this.data = data;
    }
  }
  list() { return this.data.presets.map(({ id, name }) => ({ id, name })); }
  write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(data)); fs.renameSync(this.file + '.tmp', this.file); this.data = data;
  }
  run(fn) { const result = this.queue.then(fn); this.queue = result.catch(() => {}); return result; }
  snapshot() {
    return new Promise((resolve, reject) => {
      const request = randomUUID();
      const finish = (error, chain) => { clearTimeout(timer); this.host.off('event', event); this.host.off('status', failed); error ? reject(error) : resolve(chain); };
      const event = e => { if (e.type === 'snapshot' && e.request === request) { try { finish(null, validateChain(e.chain)); } catch (error) { finish(error); } } };
      const failed = message => finish(Error(message));
      const timer = setTimeout(() => finish(Error('チェーンの保存がタイムアウトしました')), 30000);
      this.host.on('event', event); this.host.on('status', failed);
      try { this.host.command(7, request); } catch (error) { finish(error); }
    });
  }
  capture() { return this.run(async () => { if (this.protectLast || !this.host.ready) return; const last = await this.snapshot(); this.write({ ...this.data, last }); }); }
  save(name, options = {}) {
    return this.run(async () => {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw Error('プリセット名を1〜80文字で入力してください');
      if (!options || !['create', 'update', undefined].includes(options.mode)) throw Error('保存方法が不正です');
      name = name.trim();
      const existing = options.mode === 'create' ? undefined : this.data.presets.find(p => options.mode === 'update' ? p.id === options.id : p.name === name);
      if (options.mode === 'update' && !existing) throw Error('更新するプリセットが見つかりません');
      const chain = await this.snapshot();
      const presets = this.data.presets.filter(p => p.id !== existing?.id);
      presets.push({ id: existing?.id || randomUUID(), name, chain });
      this.write({ ...this.data, presets, last: chain }); this.protectLast = false; return this.list();
    });
  }
  remove(id) { return this.run(async () => { this.write({ ...this.data, presets: this.data.presets.filter(p => p.id !== id) }); return this.list(); }); }
  restore(chain) {
    return this.run(async () => {
      this.protectLast = true;
      validateChain(chain);
      for (const p of chain) if (!fs.existsSync(p.path)) throw Error(`プラグインが見つかりません: ${p.path}`);
      await this.host.ensureReady();
      const errors = []; const listener = e => { if (e.type === 'error') errors.push(e.message); };
      this.host.on('event', listener);
      try {
        this.host.command(9);
        for (const plugin of chain) this.host.command(8, JSON.stringify(plugin));
        const restored = await this.snapshot();
        if (errors.length || restored.length !== chain.length) throw Error('チェーンの復元に失敗しました: ' + errors.join(' / '));
        this.write({ ...this.data, last: restored }); this.protectLast = false;
      } finally { this.host.off('event', listener); }
    });
  }
  load(id) { const preset = this.data.presets.find(p => p.id === id); if (!preset) throw Error('プリセットが見つかりません'); return this.restore(preset.chain); }
}
module.exports = { Chains, validateChain };
