const fs = require('node:fs');
const path = require('node:path');
const { validateSettings } = require('./core.cjs');
const defaults = () => ({ outputDevice: '', apiKey: '', forwarding: false, normalizationOff: false, rules: [] });
class SettingsStore {
  constructor(directory, safeStorage) { this.file = path.join(directory, 'settings.enc'); this.crypto = safeStorage; this.value = defaults(); }
  load() {
    if (fs.existsSync(this.file)) {
      if (!this.crypto.isEncryptionAvailable()) throw Error('Windowsの設定暗号化を利用できません');
      this.value = validateSettings(JSON.parse(this.crypto.decryptString(fs.readFileSync(this.file))));
    }
    return this.value;
  }
  save(input) {
    const value = validateSettings(input);
    if (!this.crypto.isEncryptionAvailable()) throw Error('Windowsの設定暗号化を利用できません');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, this.crypto.encryptString(JSON.stringify(value)));
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.value = value;
    return value;
  }
}
module.exports = { SettingsStore };
