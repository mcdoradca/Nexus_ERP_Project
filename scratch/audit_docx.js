const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function auditDocx(docxPath) {
  console.log(`\n======================================================`);
  console.log(`AUDYT DOCX DLA: ${path.basename(docxPath)}`);
  console.log(`======================================================`);
  
  const zip = new AdmZip(docxPath);
  const xml = zip.readAsText('word/document.xml');
  
  // Wyciągamy czysty tekst z paragrafów
  const text = xml
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');

  // Wyszukiwanie podejrzanych obcojęzycznych fraz (EN / IT)
  const forbiddenPhrases = [
    /\bIn case of skin contact\b/i,
    /\bIn case of eyes contact\b/i,
    /\bIn case of Ingestion\b/i,
    /\bIn case of Inhalation\b/i,
    /\bSuitable extinguishing media\b/i,
    /\bExtinguishing media which must not\b/i,
    /\bFor non emergency personnel\b/i,
    /\bFor emergency responders\b/i,
    /\bEnvironmental precautions\b/i,
    /\bMethods and material for containment\b/i,
    /\bPrecautions for safe handling\b/i,
    /\bConditions for safe storage\b/i,
    /\bIncompatible materials\b/i,
    /\bSpecific end use\b/i,
    /\bInformation not relevant\b/i,
    /\bNot applicable\b/i,
    /\bNo data available\b/i,
    /\bDoes not meet the criteria for classification\b/i,
    /\bEffects on consumers\b/i,
    /\bEffects on workers\b/i,
    /\bNormal value in fresh water\b/i,
    /\bNormal value in marine water\b/i,
    /\bSuarez Company\b/i,
    /\bRevision nr\.\b/i,
    /\bReplaced revision\b/i,
    /\bPrinted on\b/i,
    /\bContatto con la pelle\b/i,
    /\bContatto con gli occhi\b/i,
    /\bPer chi non interviene\b/i,
    /\bMezzi di estinzione\b/i,
    /\bManipolazione sicura\b/i,
    /\bOral:\s*\d+/i,
    /\bInhalation:\s*\d+/i,
    /\bDermal:\s*\d+/i,
    /\bRat\b/i,
    /\bRabbit\b/i,
    /\bMouse\b/i
  ];

  let violations = [];
  forbiddenPhrases.forEach(regex => {
    const match = text.match(regex);
    if (match) {
      violations.push(`Znaleziono obcojęzyczną frazę: "${match[0]}"`);
    }
  });

  // Dodatkowe rygorystyczne frazy
  const extraPhrases = [
    /\bColore\b/i,
    /\bOdore\b/i,
    /\bAspetto\b/i,
    /\bPunto di\b/i,
    /\binfiammabilit[aà]\b/i,
    /\bebollizione\b/i,
    /\bNon applicabile\b/i,
    /\bBoiling point\b/i,
    /\bFlash point\b/i,
    /\bRelative density\b/i,
    /\bKinematic viscosity\b/i,
    /\bLower explosion limit\b/i,
    /\bUpper explosion limit\b/i,
    /\bTemperature\s*:\s*\d+/i
  ];
  extraPhrases.forEach(regex => {
    const match = text.match(regex);
    if (match) {
      violations.push(`Znaleziono obcojęzyczną frazę (Sekcja 9/Inne): "${match[0]}"`);
    }
  });

  if (violations.length === 0) {
    console.log(`[WYNIK AUDYTU] 0 błędów obcojęzycznych! Dokument w 100% po polsku.`);
  } else {
    console.error(`[WYNIK AUDYTU] ZNALEZIONO BŁĘDY:`);
    violations.forEach(v => console.error(` - ${v}`));
  }

  // Zapiszmy czysty tekst do pliku txt dla wglądu
  const txtOut = docxPath.replace('.docx', '_clean_audit.txt');
  fs.writeFileSync(txtOut, text, 'utf8');
  console.log(`Zapisano zrzut tekstu do: ${txtOut}`);

  return { violations, text };
}

const docx1 = 'Z:/Nexus_ERP_Project/Karta_Charakterystyki_1789388083430.docx';
const docx2 = 'Z:/Nexus_ERP_Project/Karta_Charakterystyki_1789388099066.docx';

auditDocx(docx1);
auditDocx(docx2);

