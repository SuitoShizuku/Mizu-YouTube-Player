const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function check(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) check(file); else if (/\.(?:c?js)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' }); } }
check('src'); check('tests'); console.log('JavaScript syntax checks passed.');
