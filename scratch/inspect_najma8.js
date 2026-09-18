const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const fs = require('fs');

const zip = new AdmZip('docs/SDS/8051944811087_SDS_NAJMA (8).docx');
const docXml = zip.readAsText('word/document.xml');
const $ = cheerio.load(docXml, { xmlMode: true });

const paragraphs = [];
$('w\\:p').each((i, el) => {
  const t = $(el).find('w\\:t').map((j, tEl) => $(tEl).text()).get().join('');
  if (t) paragraphs.push(t);
});

fs.writeFileSync('scratch/najma8_text.txt', paragraphs.join('\n'));
console.log('Total paragraphs:', paragraphs.length);
console.log('--- START OF DOC (first 40 lines) ---');
console.log(paragraphs.slice(0, 40).join('\n'));

// Sprawdźmy ile tabel
const tables = $('w\\:tbl');
console.log('Total tables:', tables.length);

tables.each((i, tbl) => {
  console.log(`\n=== TABELA ${i + 1} ===`);
  const rows = $(tbl).find('w\\:tr');
  console.log('Wierszy:', rows.length);
  rows.slice(0, 5).each((rIdx, tr) => {
    const cells = $(tr).find('w\\:tc');
    const cellTexts = cells.map((cIdx, tc) => $(tc).find('w\\:t').map((k, t) => $(t).text()).get().join(' ')).get();
    console.log(`Wiersz ${rIdx + 1} (${cells.length} kolumn):`, cellTexts.join(' | '));
  });
});
