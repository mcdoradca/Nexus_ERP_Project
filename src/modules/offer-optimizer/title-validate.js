const BANNED = [
  'okazja', 'promocja', 'hit', 'nowość', 'tanio', 'najtaniej', 'super', 'mega',
  'wyprzedaż', 'ostatnie sztuki', 'polecam', 'gratis', 'bestseller', 'rewelacja', 'wysyłka 24h'
];

function validateAllegroTitle(title, { brand } = {}) {
  const issues = [];
  const len = [...title].length;
  const words = title.trim().split(/\s+/);

  if (len > 75) issues.push({ code: 'TOO_LONG', len });
  if (len < 12) issues.push({ code: 'TOO_SHORT', len });
  if (len < 55) issues.push({ code: 'SUBOPTIMAL_LENGTH', len, hint: 'celuj w 60-74' });
  if (words.length < 3) issues.push({ code: 'TOO_FEW_WORDS', count: words.length });

  const lower = title.toLowerCase();
  BANNED.filter(w => lower.includes(w)).forEach(w => issues.push({ code: 'BANNED_WORD', word: w }));

  if (/[!@#$%^&*(){}<>|~`"'♥★☆€]/.test(title)) issues.push({ code: 'SPECIAL_CHARS' });

  const caps = words.filter(w => w.length > 3 && w === w.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(w));
  if (caps.length > 1) issues.push({ code: 'CAPS_ABUSE', words: caps });

  // powtórzenia po rdzeniu (prymitywny stemming PL — wystarczy do wykrycia odmian)
  const stems = words.map(w => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5))
                     .filter(s => s.length >= 4);
  const dup = stems.filter((s, i) => stems.indexOf(s) !== i);
  if (dup.length) issues.push({ code: 'KEYWORD_REPEAT', stems: [...new Set(dup)] });

  const numeric = title.match(/\d+([.,]\d+)?\s*(l|ml|w|kw|cm|mm|"|cali|gb|tb|kg|g|mah|szt)\b/gi) ?? [];
  if (numeric.length > 2) issues.push({ code: 'TOO_MANY_PARAMS', found: numeric });

  if (/\b\d{6,}\b/.test(title)) issues.push({ code: 'POSSIBLE_SKU' });
  if (/(https?:\/\/|www\.|@\w+\.)/i.test(title)) issues.push({ code: 'CONTACT_OR_LINK' });
  if (/\b(faktura|vat|odbiór osobisty|kurier)\b/i.test(title)) issues.push({ code: 'LOGISTICS_INFO' });

  return { valid: issues.length === 0, length: len, issues };
}

module.exports = {
  validateAllegroTitle
};
