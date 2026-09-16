const fs = require('node:fs');
const path = require('node:path');
class ExtensionFolder {
  constructor(directory, session, bundled, onLoaded) {
    this.directory = directory; this.session = session; this.bundled = bundled; this.onLoaded = onLoaded;
    this.entries = []; this.loaded = new Map(); this.pending = null;
    fs.mkdirSync(directory, { recursive: true });
  }
  scan() {
    if (this.pending) return this.pending;
    this.pending = this.loadAll().finally(() => { this.pending = null; }); return this.pending;
  }
  async loadAll() {
    const folders = [this.bundled];
    for (const entry of fs.readdirSync(this.directory, { withFileTypes: true })) if (entry.isDirectory() && !entry.isSymbolicLink()) folders.push(path.join(this.directory, entry.name));
    const entries = [];
    for (const directory of folders) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
        let extension = this.loaded.get(directory);
        if (!extension) {
          extension = await this.session.extensions.loadExtension(directory, { allowFileAccess: false });
          this.loaded.set(directory, extension); this.onLoaded?.(extension);
        }
        entries.push({ id: extension.id, name: extension.name, version: extension.version, directory, options: manifest.options_ui?.page || manifest.options_page || '', loaded: true });
      } catch (error) { entries.push({ name: path.basename(directory), directory, loaded: false, error: error.message }); }
    }
    for (const [directory, extension] of this.loaded) if (!folders.includes(directory)) { this.session.extensions.removeExtension(extension.id); this.loaded.delete(directory); }
    this.entries = entries;
    return this.info();
  }
  info() { return { directory: this.directory, entries: this.entries }; }
  optionsUrl(id) {
    const entry = this.entries.find(e => e.loaded && e.id === id);
    if (!entry?.options) throw Error('この拡張機能には設定画面がありません');
    const url = new URL(entry.options, `chrome-extension://${id}/`);
    if (url.protocol !== 'chrome-extension:' || url.hostname !== id) throw Error('設定ページのURLが不正です');
    return url.href;
  }
}
module.exports = { ExtensionFolder };
