const fs = require('fs');
const path = require('path');

const servicePath = path.join(__dirname, 'src', 'modules', 'sds', 'sds.service.js');
const enginePath = path.join(__dirname, 'src', 'modules', 'sds', 'engine');
const extractorsPath = path.join(enginePath, 'extractors');
const assemblersPath = path.join(enginePath, 'assemblers');

if (!fs.existsSync(extractorsPath)) fs.mkdirSync(extractorsPath, { recursive: true });
if (!fs.existsSync(assemblersPath)) fs.mkdirSync(assemblersPath, { recursive: true });

let content = fs.readFileSync(servicePath, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}

// Proste wyrażenie do znalezienia definicji klas
const classRegex = /class\s+([A-Za-z0-9_]+)[\s\S]*?(?=\nclass\s|\nmodule\.exports|$)/g;

let match;
const classes = {};

while ((match = classRegex.exec(content)) !== null) {
  const className = match[1];
  classes[className] = match[0];
}

// Zapisywanie klas do plików
const extractors = ['SDSDocumentParser', 'SDSDocxParser', 'SDSRTFParser', 'SDSPDFParser', 'SDSChemicalExtractor'];
const assemblers = ['SDSDocxExporter', 'PurePngEncoder', 'GHSPictogramGenerator', 'ADRPictogramGenerator'];
const core = ['SDSProcessorEngine'];

const writtenFiles = {};

for (const [name, code] of Object.entries(classes)) {
  let targetDir = enginePath;
  if (extractors.includes(name)) targetDir = extractorsPath;
  if (assemblers.includes(name)) targetDir = assemblersPath;

  const fileName = name.replace(/([a-z])([A-Z])/g, '$1.$2').toLowerCase() + '.js';
  const fullPath = path.join(targetDir, fileName);
  
  // Zakładamy, że każda klasa może potrzebować zewnętrznych modułów
  const fileContent = `// Auto-extracted module: ${name}\nconst fs = require('fs');\nconst path = require('path');\n\n${code}\n\nmodule.exports = { ${name} };\n`;
  fs.writeFileSync(fullPath, fileContent, 'utf8');
  writtenFiles[name] = `./engine/${targetDir === extractorsPath ? 'extractors/' : (targetDir === assemblersPath ? 'assemblers/' : '')}${fileName}`;
}

console.log('Wyekstrahowano klasy:', Object.keys(writtenFiles));
