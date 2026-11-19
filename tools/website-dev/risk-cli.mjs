// CLI for CI: node tools/website-dev/risk-cli.mjs <base> <head>
// Prints a Markdown summary; always exits 0 (informational, never a gate).
import {spawnSync} from 'node:child_process';
import {classifyRange} from './risk.mjs';

const [base, head = 'HEAD'] = process.argv.slice(2);
const run = async args => { const r = spawnSync('git', args, {encoding: 'utf8', maxBuffer: 50 * 1024 * 1024}); return {code: r.status, stdout: r.stdout || ''}; };
const result = await classifyRange(run, base, head);
const lines = [`## Risicoklasse: ${result.level === 'laag' ? 'laag' : 'extra aandacht (noem dit in de melding)'}`, '',
  `${result.files} gewijzigd(e) bestand(en) · beleid: docs/GOEDKEURINGSBELEID.md`, ''];
for (const r of result.reasons) lines.push(`- **${r.label}**: ${r.files.slice(0, 15).map(f => '`' + f + '`').join(', ')}${r.files.length > 15 ? ', …' : ''}`);
lines.push('', 'Deze check is informatief en vraagt geen akkoord. De bestaande controles blijven gelden.');
console.log(lines.join('\n'));
