'use strict';

/**
 * Copies send-weekly-summary.js into pipelines/weekly-summary-standalone.yml.
 * Run after changing the script:  node scripts/make-standalone.js
 *
 * A PowerShell task's inline script is passed through an environment variable,
 * which holds at most 32766 characters (the task fails outright from about 64 KB).
 * So the script is written to disk by several steps, each well under that limit.
 */

const fs   = require('fs');
const path = require('path');

const MAX_CHARS = 24000;
const ymlPath   = path.join(__dirname, '..', 'pipelines', 'weekly-summary-standalone.yml');
const jsPath    = path.join(__dirname, 'send-weekly-summary.js');

const yml  = fs.readFileSync(ymlPath, 'utf8');
const eol  = yml.includes('\r\n') ? '\r\n' : '\n';
const js   = fs.readFileSync(jsPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const lines = js.split('\n');
if (lines.some(l => l.startsWith("'@"))) throw new Error("A script line starts with '@, which ends the PowerShell here-string.");

// Split at line ends into parts of at most MAX_CHARS
const parts = [[]];
let size = 0;
for (const line of lines) {
  if (size + line.length + 1 > MAX_CHARS && parts[parts.length - 1].length) { parts.push([]); size = 0; }
  parts[parts.length - 1].push(line);
  size += line.length + 1;
}

const steps = parts.map((part, i) => [
  `      - task: PowerShell@2`,
  `        displayName: Write script to disk (${i + 1}/${parts.length})`,
  `        inputs:`,
  `          pwsh: false`,
  `          targetType: inline`,
  `          script: |`,
  `            $part = @'`,
  ...part.map(l => l ? '            ' + l : ''),
  `            '@`,
  `            $file = Join-Path $PWD 'send-weekly-summary.js'`,
  `            $utf8 = New-Object System.Text.UTF8Encoding $false`,
  `            [System.IO.File]::${i === 0 ? 'WriteAllText' : 'AppendAllText'}($file, $part + "\`n", $utf8)`,
  ``,
].join(eol)).join('');

const start = yml.indexOf(`      - task: PowerShell@2${eol}        displayName: Write script to disk`);
const end   = yml.indexOf(`      - script: node send-weekly-summary.js`);
if (start < 0 || end < start) throw new Error('Could not find the "Write script to disk" steps in the standalone pipeline.');
fs.writeFileSync(ymlPath, yml.slice(0, start) + steps + yml.slice(end), 'utf8');
console.log(`Standalone pipeline updated: script written by ${parts.length} step(s).`);
