const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { SDSProcessorEngine } = require('../src/modules/sds/sds.service');

test('Audyt Compliance: Weryfikacja 4 Krytycznych Zaleceń Inspektora (SANDALO DOCX)', async (t) => {
  const docxPath = path.join(__dirname, '../docs/SDS/8034055535424_SDS_SANDALO org.docx');
  if (!fs.existsSync(docxPath)) {
    t.skip('Brak pliku testowego SANDALO org.docx');
    return;
  }

  const engine = new SDSProcessorEngine();
  const result = await engine.prepareAgentPayload(docxPath, { skipAiAudit: true });

  const det = result.deterministicSections || {};
  const s8 = (det.section_8 && det.section_8.content) || '';
  const s9 = (det.section_9 && det.section_9.content) || '';
  const s12 = (det.section_12 && det.section_12.content) || '';

  await t.test('Wada 1: Sekcja 9.1 - Ochrona wartości ujemnych (-114 °C, -0,35) oraz uzasadnienie lepkości', () => {
    // 1. Temperatura topnienia/krzepnięcia: musi być -114 °C
    assert.match(s9, /Temperatura topnienia\/krzepnięcia:\s*-114\s*°C/i, 'Temperatura topnienia musi wynosić -114 °C (zachowany znak minus)');
    assert.doesNotMatch(s9, /Temperatura topnienia\/krzepnięcia:\s*114\s*°C/i, 'Niedopuszczalna utrata znaku minus przy temperaturze topnienia');

    // 2. log Kow: musi być -0,35
    assert.match(s9, /Współczynnik podziału n-oktanol\/woda[^\n]*:\s*-0,35/i, 'Współczynnik log Kow musi wynosić -0,35 (zachowany znak minus)');
    assert.doesNotMatch(s9, /Współczynnik podziału n-oktanol\/woda[^\n]*:\s*0,35\b/i, 'Niedopuszczalna utrata znaku minus przy log Kow');

    // 3. Lepkość kinematyczna: uzasadnienie źródłowe
    assert.match(s9, /Lepkość kinematyczna:\s*Brak danych\s*\(właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu\)/i, 'Lepkość musi posiadać pełne uzasadnienie prawne');
    assert.notStrictEqual(s9.match(/Lepkość kinematyczna:\s*([^\n]+)/i)?.[1]?.trim(), 'Brak danych', 'Lepkość nie może pozostawać samym gołym zwrotem Brak danych');
  });

  await t.test('Wada 2: Sekcja 8.1 - Rozbicie zlepka pod salicylanem benzylu na odrębne substancje', () => {
    const idxBenzyl = s8.indexOf('Substancja: salicylan benzylu');
    assert.ok(idxBenzyl !== -1, 'Sekcja 8.1 musi zawierać blok salicylanu benzylu');
    
    // Szukamy końca bloku salicylanu benzylu (następnej substancji)
    const nextSubMatch = s8.substring(idxBenzyl + 30).match(/\n\nSubstancja: /);
    const endBenzyl = nextSubMatch ? idxBenzyl + 30 + nextSubMatch.index : s8.length;
    const benzylBlock = s8.substring(idxBenzyl, endBenzyl);

    // Salicylan benzylu nie może zawierać wartości przypisanych Polysantolowi ani Masie poreakcyjnej heksan-3-olu
    assert.ok(!benzylBlock.includes('0,0012 mg/l'), 'Salicylan benzylu nie może zawierać PNEC Polysantolu (0,0012 mg/l)');
    assert.ok(!benzylBlock.includes('0,246 mg/kg'), 'Salicylan benzylu nie może zawierać PNEC Polysantolu (0,246 mg/kg)');
    assert.ok(!benzylBlock.includes('0,5 mg/kg/d'), 'Salicylan benzylu nie może zawierać PNEC Masy poreakcyjnej (0,5 mg/kg/d)');

    // Polysantol musi mieć swój dedykowany blok
    assert.match(s8, /Substancja:\s*\(±\)\s*trans-3,3-dimetylo-5-\(2,2,3-trimetylocyklopent-3-en-1-ylo\)pent-4-en-2-ol/i, 'Polysantol musi posiadać swój własny nagłówek');
    const polyIdx = s8.indexOf('trans-3,3-dimetylo');
    const polyBlock = s8.substring(polyIdx, polyIdx + 800);
    assert.match(polyBlock, /0,0012\s*mg\/l/i, 'Polysantol musi posiadać PNEC woda słodka 0,0012 mg/l');
    assert.match(polyBlock, /0,246\s*mg\/kg/i, 'Polysantol musi posiadać PNEC osady słodkowodne 0,246 mg/kg');

    // Masa poreakcyjna heksan-3-olu musi mieć swój dedykowany blok
    assert.match(s8, /Substancja:\s*Masa poreakcyjna 1-\[\(1R\*,6S\*\)-2,2,6-trimetylocykloheksylo\]heksan-3-olu/i, 'Masa poreakcyjna heksan-3-olu musi posiadać swój własny nagłówek');
  });

  await t.test('Wada 3: Sekcja 8.1 - Przywrócenie pełnego bloku metanolu (DNEL i PNEC)', () => {
    assert.match(s8, /Substancja:\s*metanol\s*\[CAS:\s*67-56-1\]/i, 'Sekcja 8.1 musi bezwzględnie zawierać nagłówek metanolu');
    const metIdx = s8.indexOf('Substancja: metanol');
    assert.ok(metIdx !== -1, 'Musi istnieć blok metanolu');
    const metBlock = s8.substring(metIdx, metIdx + 1200);

    // PNEC dla metanolu
    assert.match(metBlock, /woda słodka:\s*20,8\s*mg\/l/i, 'Metanol musi posiadać PNEC woda słodka: 20,8 mg/l');
    assert.match(metBlock, /osady słodkowodne:\s*77\s*mg\/kg/i, 'Metanol musi posiadać PNEC osady słodkowodne: 77 mg/kg');

    // DNEL dla metanolu
    assert.match(metBlock, /130\s*mg\/m³/i, 'Metanol musi posiadać DNEL pracownicy inhalacja 130 mg/m³');
    assert.match(metBlock, /20\s*mg\/kg/i, 'Metanol musi posiadać DNEL pracownicy skóra 20 mg/kg');
    assert.match(metBlock, /4\s*mg\/kg\s*mc\/dzień/i, 'Metanol musi posiadać DNEL konsumenci doustnie 4 mg/kg mc/dzień');
  });

  await t.test('Wada 4: Sekcja 12.1 - Usunięcie artefaktu BLK0276-2 i pełne dane etanolu', () => {
    // Brak nagłówka BLK0276-2 w sekcji 12.1
    assert.ok(!s12.includes('BLK0276-2 - SWEET HOME - PROFUMATORE AMBIENTE SANDALO:'), 'Nagłówek produktu nie może występować jako organizm w Sekcji 12.1');
    assert.ok(!s12.includes('BLK0276-2'), 'Kod BLK0276-2 nie może występować w Sekcji 12');

    // Weryfikacja badań czystego etanolu
    const ethIdx = s12.indexOf('etanol (CAS: 64-17-5):');
    assert.ok(ethIdx !== -1, 'Sekcja 12.1 musi zawierać wykaz badań etanolu');
    const ethBlock = s12.substring(ethIdx, ethIdx + 800);

    assert.match(ethBlock, /14200\s*mg\/l/i, 'Etanol musi zawierać LC50 ryby 14200 mg/l');
    assert.match(ethBlock, /454\s*mg\/l/i, 'Etanol musi zawierać EC50 skorupiaki 454 mg/l');
    assert.match(ethBlock, /275\s*mg\/l/i, 'Etanol musi zawierać EC50 glony 275 mg/l');
    assert.match(ethBlock, /250\s*mg\/l/i, 'Etanol musi zawierać NOEC ryby 250 mg/l');
    assert.match(ethBlock, /96\s*mg\/l/i, 'Etanol musi zawierać NOEC skorupiaki 96 mg/l');
    assert.match(ethBlock, /11,5\s*mg\/l/i, 'Etanol musi zawierać NOEC glony 11,5 mg/l');
  });
});
