const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
class AudioHost extends EventEmitter {
  constructor(executable) { super(); this.executable = executable; this.ready = false; this.plugins = []; this.blocked = false; this.commands = []; }
  start() {
    if (this.process && this.process.exitCode === null && !this.process.killed) return;
    if (!fs.existsSync(this.executable)) { this.emit('status', 'VSTホスト未ビルド · 音声出力は停止中'); return; }
    this.blocked = false;
    const child = this.process = spawn(this.executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', () => { if (this.process === child) this.fail('VSTホストを起動できませんでした'); });
    child.on('exit', () => { if (this.process === child) this.fail('VSTホストが停止しました。プラグインの追加時に再起動します'); });
    child.stdin.on('error', () => { if (this.process === child) this.fail('VSTホストとの接続が切れました'); });
    child.stdin.on('drain', () => { if (this.process === child) { this.blocked = false; this.flushCommands(); } });
    let pending = '';
    this.process.stdout.on('data', chunk => {
      if (this.process !== child) return;
      pending += chunk.toString();
      if (pending.length > 1000000) { this.stop(); return; }
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'ready') this.ready = true;
          if (event.type === 'plugins') this.plugins = event.plugins;
          this.emit('event', event);
        } catch { /* JUCE may emit a diagnostic line. */ }
      }
    });
    this.process.stderr.on('data', () => {});
  }
  async ensureReady() {
    if (this.ready) return;
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(Error('VSTホストの起動がタイムアウトしました')), 15000);
      const event = value => { if (value.type === 'ready') finish(); };
      const failed = message => finish(Error(message));
      const finish = error => { clearTimeout(timer); this.off('event', event); this.off('status', failed); error ? reject(error) : resolve(); };
      this.on('event', event); this.on('status', failed); this.start();
    });
    try { await this.starting; } finally { this.starting = null; }
  }
  fail(message) { this.ready = false; this.plugins = []; this.commands = []; this.emit('status', message); }
  packet(type, payload) {
    if (!this.process?.stdin.writable || this.process.stdin.destroyed || this.blocked) return false;
    const header = Buffer.alloc(8); header.writeUInt32LE(type, 0); header.writeUInt32LE(payload.length, 4);
    this.blocked = !this.process.stdin.write(Buffer.concat([header, payload]));
    return true;
  }
  audio(buffer) {
    if (!this.ready || this.commands.length || !(buffer instanceof ArrayBuffer) || buffer.byteLength !== 8192) return;
    this.packet(1, Buffer.from(buffer));
  }
  command(type, value = '') {
    if (!this.ready) throw Error('VSTホストが準備できていません');
    if (this.commands.length >= 64) throw Error('プラグイン操作の完了を待ってから再操作してください');
    this.commands.push({ type, payload: Buffer.from(value) });
    this.flushCommands();
  }
  flushCommands() {
    while (this.commands.length && !this.blocked) {
      const command = this.commands[0];
      if (!this.packet(command.type, command.payload)) return;
      this.commands.shift();
    }
  }
  stop() { this.ready = false; this.commands = []; this.process?.kill(); }
}
module.exports = { AudioHost };
