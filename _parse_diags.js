const fs = require('fs');
const path = 'C:/Users/rafael.damasio/.claude/projects/c--Users-rafael-damasio-StressFlow/f0f672e1-1e57-445a-ab08-7abac74c5436/tool-results/toolu_bdrk_01SvU2Bk6kDRM4Du1F58XEnA.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const diags = JSON.parse(data[0].text);
const byFile = {};
const bySev = {};
const errors = [];
const warnings = [];
const hints = [];
for (const item of diags) {
  const parts = item.filePath.replace(/\\/g, '/').split('/');
  const fp = parts[parts.length - 1];
  for (const d of item.diagnostics) {
    byFile[fp] = (byFile[fp] || 0) + 1;
    bySev[d.severity] = (bySev[d.severity] || 0) + 1;
    const loc = fp + ':' + (d.range.start.line + 1);
    if (d.severity === 'error') errors.push(loc + ' - ' + d.message);
    else if (d.severity === 'warning') warnings.push(loc + ' - ' + d.message);
    else hints.push(loc + ' - [' + (d.code || '') + '] ' + d.message);
  }
}
console.log('=== RESUMO DE DIAGNOSTICOS DO VS CODE ===');
console.log('Total:', Object.values(byFile).reduce((a, b) => a + b, 0), 'diagnosticos em', Object.keys(byFile).length, 'arquivos');
console.log('');
console.log('Por severidade:');
for (const [s, c] of Object.entries(bySev).sort((a, b) => b[1] - a[1])) console.log('  ' + s + ': ' + c);
console.log('');
console.log('Por arquivo:');
for (const [f, c] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('  ' + f + ': ' + c);
console.log('');
if (errors.length) {
  console.log('=== ERROS (' + errors.length + ') ===');
  errors.forEach(e => console.log('  ' + e));
  console.log('');
}
if (warnings.length) {
  console.log('=== WARNINGS (' + warnings.length + ') ===');
  warnings.slice(0, 40).forEach(w => console.log('  ' + w));
  console.log('');
}
if (hints.length) {
  console.log('=== HINTS (' + hints.length + ') ===');
  hints.slice(0, 30).forEach(h => console.log('  ' + h));
}
