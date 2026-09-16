const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOTS = ['C:\\Program Files\\Common Files\\VST3', 'C:\\Program Files\\Steinberg\\VstPlugins', 'C:\\Program Files\\VSTPlugins'];
class PluginCatalog {
  constructor(roots = ROOTS) { this.roots = roots; this.entries = new Map(); this.cached = null; this.pending = null; }
  async scan(refresh = false) {
    if (this.pending) return this.pending;
    if (this.cached && !refresh) return this.cached;
    this.pending = this.discover();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async discover() {
    const entries = new Map(), warnings = [], visited = new Set();
    let dllCount = 0;
    const walk = async directory => {
      let children;
      try {
        const real = (await fs.realpath(directory)).toLowerCase();
        if (visited.has(real)) return;
        visited.add(real);
        children = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) { warnings.push(`${directory}: ${error.code === 'ENOENT' ? 'フォルダーがありません' : '読み取れません'}`); return; }
      for (const child of children) {
        if (child.isSymbolicLink()) continue;
        const file = path.join(directory, child.name);
        if (/\.vst3$/i.test(child.name) && (child.isFile() || child.isDirectory())) {
          const real = await fs.realpath(file).catch(() => null);
          if (!real) continue;
          const id = createHash('sha256').update(real.toLowerCase()).digest('hex');
          entries.set(id, { id, name: child.name.replace(/\.vst3$/i, ''), path: file, format: 'VST3' });
        } else if (child.isDirectory()) await walk(file);
        else if (child.isFile() && /\.dll$/i.test(child.name)) dllCount++;
      }
    };
    for (const root of this.roots) await walk(root);
    this.entries = entries;
    this.cached = { plugins: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)), roots: this.roots, warnings, dllCount };
    return this.cached;
  }
  resolve(id) {
    const entry = this.entries.get(id);
    if (!entry) throw Error('一覧を再スキャンしてプラグインを選択してください');
    return entry.path;
  }
}
module.exports = { PluginCatalog, ROOTS };
