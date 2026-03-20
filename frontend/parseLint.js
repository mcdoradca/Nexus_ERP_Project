const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lint.json'));
let out = '';
data.filter(d => d.errorCount > 0).forEach(d => {
  out += '\n--- ' + d.filePath + ' ---\n';
  d.messages.forEach(m => {
    out += 'Line ' + m.line + ': [' + m.ruleId + '] ' + m.message + '\n';
  });
});
fs.writeFileSync('lint_readable.txt', out);
