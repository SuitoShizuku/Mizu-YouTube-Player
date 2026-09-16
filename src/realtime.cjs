// Audio leaves Chromium through renderer IPC rather than its audible output.
// Keep the producer scheduled even when Chromium considers the muted page idle.
function configureRealtime(app) {
  for (const flag of ['disable-background-timer-throttling', 'disable-renderer-backgrounding', 'disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(flag);
  if (process.platform === 'win32') {
    const disabled = new Set(app.commandLine.getSwitchValue('disable-features').split(',').filter(Boolean));
    disabled.add('CalculateNativeWinOcclusion');
    app.commandLine.appendSwitch('disable-features', [...disabled].join(','));
  }
}
module.exports = { configureRealtime };
