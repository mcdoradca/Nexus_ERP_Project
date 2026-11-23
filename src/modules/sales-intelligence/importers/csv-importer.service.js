const crypto = require('crypto');
const XLSX = require('xlsx');
const prisma = require('../../../core/prisma');
const {
    round2,
    utcDayMidnight,
    normalizeCurrencyCode,
    resolveFxRate,
    inferMarketplaceFromOrder,
    isShippingLineItem,
    buildPlnReferencePriceMap,
    inferForeignCurrencyFromPlnPrices
} = require('../utils/currency.helpers');

/**
 * Dekoduje bufor pliku z automatyczną obsługą UTF-8 (BOM) oraz polskiego Windows-1250.
 */
function decodeTextSmart(buffer) {
    if (!Buffer.isBuffer(buffer)) return String(buffer || '');
    const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (utf8.includes('\uFFFD')) {
        try {
            const dec = new TextDecoder('windows-1250');
            return dec.decode(buffer).replace(/^\uFEFF/, '');
        } catch (_) {
            return utf8;
        }
    }
    return utf8;
}

function normalizeHeader(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/^\[|\]$/g, '')
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function splitCsvLogicalRows(text) {
    const rows = [];
    let cur = '';
    let inQ = false;
    const clean = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (ch === '"') {
            if (inQ && clean[i + 1] === '"') {
                cur += '""';
                i++;
            } else {
                inQ = !inQ;
                cur += ch;
            }
        } else if ((ch === '\n' || ch === '\r') && !inQ) {
            if (ch === '\r' && clean[i + 1] === '\n') i++;
            if (cur.trim().length > 0) rows.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim().length > 0) rows.push(cur);
    return rows;
}

function splitCsvLine(line, delim = ';') {
    const res = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQ = !inQ;
            }
        } else if (ch === delim && !inQ) {
            res.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    res.push(cur.trim());
    return res.map(c => c.replace(/^["']|["']$/g, '').trim());
}

function detectDelimiter(lines = []) {
    const sample = lines.slice(0, 5).join('\n');
    const semi = (sample.match(/;/g) || []).length;
    const comma = (sample.match(/,/g) || []).length;
    const tab = (sample.match(/\t/g) || []).length;
    if (tab > semi && tab > comma) return '\t';
    if (comma > semi) return ',';
    return ';';
}

function parseLocaleNumber(raw, defaultVal = 0) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : defaultVal;
    const s = String(raw ?? '')
        .replace(/\u00A0/g, '')
        .replace(/\s+/g, '')
        .replace(/(zł|pln|eur|czk|huf|%)/gi, '')
        .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : defaultVal;
}

function parseFlexibleDate(raw, fallbackDate = null) {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        if (raw > 1577836800 && raw < 3000000000) return new Date(raw * 1000);
        if (raw > 1577836800000) return new Date(raw);
        // Excel serial date
        if (raw > 40000 && raw < 60000) {
            return new Date(Math.round((raw - 25569) * 86400 * 1000));
        }
    }
    const clean = String(raw || '').trim().replace(/^["']|["']$/g, '');
    if (!clean) return fallbackDate || new Date();
    if (/^1[6789]\d{8}$/.test(clean)) return new Date(parseInt(clean, 10) * 1000);
    if (/^\d{13}$/.test(clean)) return new Date(parseInt(clean, 10));

    const dmy = clean.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmy) {
        return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 12), +(dmy[5] || 0), +(dmy[6] || 0)));
    }
    const ymd = clean.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (ymd) {
        return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3], +(ymd[4] || 12), +(ymd[5] || 0), +(ymd[6] || 0)));
    }
    const ms = Date.parse(clean.replace(' ', 'T'));
    if (!Number.isNaN(ms) && ms > 1577836800000) return new Date(ms);
    return fallbackDate || new Date();
}

function isDateLikeString(s) {
    const clean = String(s || '').trim().replace(/^["']|["']$/g, '');
    if (!clean) return false;
    if (/^1[6789]\d{8}$/.test(clean)) return true;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(clean)) return true;
    if (/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/.test(clean)) return true;
    return false;
}

function findColumnIdx(normHeaders, aliases = []) {
    for (const a of aliases) {
        const idx = normHeaders.findIndex(h => h === a);
        if (idx !== -1) return idx;
    }
    for (const a of aliases) {
        const idx = normHeaders.findIndex(h => h.includes(a));
        if (idx !== -1) return idx;
    }
    return -1;
}

function spreadsheetToRows(fileName, buffer) {
    const lower = String(fileName || '').toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) return [];
        const sheet = wb.Sheets[firstSheet];
        return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    }
    const text = decodeTextSmart(buffer);
    const logicalRows = splitCsvLogicalRows(text);
    if (logicalRows.length === 0) return [];
    const delim = detectDelimiter(logicalRows);
    return logicalRows.map(r => splitCsvLine(r, delim));
}

function extractPackedItems(rawPoz = '') {
    const out = [];
    const blocks = String(rawPoz || '').split('|').map(s => s.trim()).filter(Boolean);
    for (const b of blocks) {
        const kv = {};
        for (const part of b.split(';')) {
            const eq = part.indexOf('=');
            if (eq > 0) {
                kv[normalizeHeader(part.slice(0, eq))] = part.slice(eq + 1).trim();
            }
        }
        const name = kv.nazwa || kv.nazwa_produktu || kv.name || '';
        const sku = kv.sku || kv.kod_produktu || '';
        const ean = kv.ean || '';
        const pid = kv.id || kv.product_id || '';
        const aid = String(kv.aukcja || kv.id_aukcji || kv.auction_id || '').replace(/[^0-9]/g, '');
        const price = parseLocaleNumber(kv.cena || kv.cena_brutto || kv.price, 0);
        const qty = Math.max(1, Math.round(parseLocaleNumber(kv.ilosc || kv.quantity, 1)));
        if (!name && !sku && !ean && price <= 0) continue;
        if (isShippingLineItem(name, sku, ean)) continue;
        out.push({ sku: sku || ean || name, ean: ean || null, productId: pid || null, auctionId: aid || null, name: name || sku, qty, priceOrig: round2(price) });
    }
    return out;
}

/**
 * Automatycznie wykrywa format wgrywanego pliku (JSON / Base.com / Allegro Ads / Allegro Analytics / Von Halsky).
 */
function detectImportFormat(fileName, buffer, rows = []) {
    const lower = String(fileName || '').toLowerCase();
    if (lower.endsWith('.json')) return 'LEGACY_JSON_CACHE';

    if (buffer && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        const headText = decodeTextSmart(buffer.subarray(0, 512)).trim();
        if (headText.startsWith('{') || headText.startsWith('[')) {
            return 'LEGACY_JSON_CACHE';
        }
    }

    if (!rows || rows.length === 0) return 'UNKNOWN';
    const firstNorm = rows[0].map(normalizeHeader);
    const joined = firstNorm.join(' ');

    if (firstNorm[0] === 'typ_wiersza' || (firstNorm.includes('pole_1') && firstNorm.includes('pole_2'))) {
        return 'BASELINKER_ARCHIVE_CSV';
    }
    if ((joined.includes('wyswietlenia') || joined.includes('impressions')) && (joined.includes('klikniecia') || joined.includes('clicks')) && (joined.includes('kampania') || joined.includes('campaign') || joined.includes('roas') || joined.includes('cpc'))) {
        return 'ALLEGRO_ADS_CSV';
    }
    if (joined.includes('von_halsky') || joined.includes('inpsa') || joined.includes('inpost_buy') || (joined.includes('organization_id') && joined.includes('order_id'))) {
        return 'VONHALSKY_CSV';
    }
    if ((joined.includes('prowizja') || joined.includes('typ_operacji') || joined.includes('billing') || joined.includes('top_oferta') || joined.includes('odwiedziny') || joined.includes('gwarancja_najnizszej')) && !joined.includes('typ_wiersza')) {
        return 'ALLEGRO_ANALYTICS_CSV';
    }
    if (joined.includes('numer_zamowienia') || joined.includes('order_id') || joined.includes('id_zamowienia') || joined.includes('sku') || joined.includes('nazwa_produktu')) {
        return 'BASELINKER_ARCHIVE_CSV';
    }
    return 'BASELINKER_ARCHIVE_CSV';
}

function parseBaseLinkerRowsToOrders(rows, fileName, { strictAllegroOnly = false, catalogLookup = {} } = {}) {
    if (!rows || rows.length < 2) return [];
    const hdrNorm = rows[0].map(normalizeHeader);
    const isTypWiersza = hdrNorm[0] === 'typ_wiersza' || hdrNorm.includes('pole_1');

    const ordersMap = new Map();

    if (isTypWiersza) {
        const subHeaders = {};
        const dataByType = {};

        for (let i = 1; i < rows.length; i++) {
            const c = rows[i];
            if (!c || c.length < 2) continue;
            const rt = normalizeHeader(c[0]);
            const joined = c.slice(1).map(normalizeHeader).join(' ');
            if (rt.startsWith('naglowek') || rt.startsWith('header') || rt === 'legenda' || (joined.includes('numer_zamowienia') && joined.includes('data')) || (joined.includes('nazwa') && joined.includes('cena'))) {
                const fullNorm = c.map(normalizeHeader);
                subHeaders[rt] = fullNorm;
                if (rt.includes('zam') || joined.includes('data')) subHeaders.__order = fullNorm;
                if (rt.includes('poz') || rt.includes('prod') || joined.includes('cena')) subHeaders.__prod = fullNorm;
                continue;
            }
            if (!dataByType[rt]) dataByType[rt] = [];
            dataByType[rt].push(c);
        }

        const orderTypes = new Set();
        const productTypes = new Set();
        for (const rt of Object.keys(dataByType)) {
            if (/^(produkt|produkty|prod|pozycja|pozycje|poz|towar|item|items|product|p|2)$/.test(rt)) productTypes.add(rt);
            else if (/^(zamowienie|zamowienia|zam|naglowek|order|orders|header|z|h|1)$/.test(rt)) orderTypes.add(rt);
        }

        if (orderTypes.size === 0 || productTypes.size === 0) {
            for (const rt of Object.keys(dataByType)) {
                if (orderTypes.has(rt) || productTypes.has(rt)) continue;
                const sample = dataByType[rt].slice(0, 30);
                const dateHits = sample.filter(r => r.slice(1).some(cell => isDateLikeString(cell))).length;
                if (dateHits >= sample.length * 0.3) orderTypes.add(rt);
                else productTypes.add(rt);
            }
        }

        const isMultiRow = orderTypes.size > 0 && productTypes.size > 0;
        let currentOrder = null;

        for (let i = 1; i < rows.length; i++) {
            const c = rows[i];
            if (!c || c.length < 2) continue;
            const rt = normalizeHeader(c[0]);
            if (rt.startsWith('naglowek') || rt.startsWith('header') || rt === 'legenda') continue;

            if (isMultiRow && orderTypes.has(rt)) {
                const oHdr = subHeaders[rt] || subHeaders.__order;
                let oid = '';
                let ordDate = null;
                let origin = '';
                let cur = '';
                let country = '';
                let isSmart = false;

                if (oHdr) {
                    const iId = findColumnIdx(oHdr, ['numer_zamowienia', 'id_zamowienia', 'order_id', 'nr_zamowienia']);
                    const iDate = findColumnIdx(oHdr, ['data_potwierdzenia', 'data_zamowienia', 'data_zlozenia', 'data', 'date_confirmed', 'date_add']);
                    const iOrig = findColumnIdx(oHdr, ['pochodzenie', 'zrodlo', 'order_source', 'platforma']);
                    const iCur = findColumnIdx(oHdr, ['waluta', 'currency']);
                    const iCtry = findColumnIdx(oHdr, ['kraj', 'kraj_dostawy', 'delivery_country_code']);
                    const iSmart = findColumnIdx(oHdr, ['allegro_smart', 'smart']);
                    if (iId !== -1) oid = String(c[iId] || '').trim();
                    if (iDate !== -1) ordDate = parseFlexibleDate(c[iDate]);
                    if (iOrig !== -1) origin = String(c[iOrig] || '').trim();
                    if (iCur !== -1) cur = String(c[iCur] || '').trim();
                    if (iCtry !== -1) country = String(c[iCtry] || '').trim();
                    if (iSmart !== -1) isSmart = /^(tak|yes|1|true|smart)$/i.test(String(c[iSmart] || '').trim());
                } else {
                    for (let j = 1; j < c.length; j++) {
                        const val = String(c[j] || '').trim();
                        if (!val) continue;
                        if (!ordDate && isDateLikeString(val)) ordDate = parseFlexibleDate(val);
                        else if (!cur && /^(PLN|CZK|HUF|EUR)$/i.test(val)) cur = val.toUpperCase();
                        else if (!country && /^(PL|CZ|HU|SK|DE)$/i.test(val)) country = val.toUpperCase();
                        else if (!origin && /allegro|sklep|shop|inpost|vonhalsky/i.test(val)) origin = val;
                        else if (!oid && /^[a-zA-Z0-9\-_]{5,40}$/.test(val)) oid = val;
                    }
                }

                if (!oid) oid = `CSV_${fileName}_${i}`;
                if (!ordersMap.has(oid)) {
                    ordersMap.set(oid, {
                        externalOrderId: oid,
                        orderDate: ordDate || new Date(),
                        originRaw: origin,
                        currency: normalizeCurrencyCode(cur, country),
                        country: country || 'PL',
                        isSmart,
                        items: []
                    });
                }
                currentOrder = ordersMap.get(oid);
            } else if (isMultiRow && productTypes.has(rt) && currentOrder) {
                const packed = c.slice(1).filter(col => /(?:nazwa|id|cena|aukcja)=/i.test(String(col || '')));
                if (packed.length > 0) {
                    currentOrder.items.push(...extractPackedItems(packed.join(';')));
                } else {
                    const pHdr = subHeaders[rt] || subHeaders.__prod;
                    let name = '', sku = '', ean = '', pid = '', aid = '', price = 0, qty = 1;
                    if (pHdr) {
                        const iName = findColumnIdx(pHdr, ['nazwa_produktu', 'nazwa_towaru', 'nazwa_pozycji', 'nazwa', 'name']);
                        const iSku = findColumnIdx(pHdr, ['sku', 'kod_produktu', 'symbol']);
                        const iEan = findColumnIdx(pHdr, ['ean']);
                        const iPid = findColumnIdx(pHdr, ['id_produktu', 'product_id']);
                        const iAuc = findColumnIdx(pHdr, ['id_aukcji', 'numer_aukcji', 'auction_id', 'aukcja']);
                        const iPrice = findColumnIdx(pHdr, ['cena_brutto', 'cena_jednostkowa', 'cena', 'price_brutto']);
                        const iQty = findColumnIdx(pHdr, ['ilosc', 'liczba_sztuk', 'sztuk', 'quantity']);
                        if (iName !== -1) name = String(c[iName] || '').trim();
                        if (iSku !== -1) sku = String(c[iSku] || '').trim();
                        if (iEan !== -1) ean = String(c[iEan] || '').trim();
                        if (iPid !== -1) pid = String(c[iPid] || '').trim();
                        if (iAuc !== -1) aid = String(c[iAuc] || '').replace(/[^0-9]/g, '');
                        if (iPrice !== -1) price = parseLocaleNumber(c[iPrice], 0);
                        if (iQty !== -1) qty = Math.max(1, Math.round(parseLocaleNumber(c[iQty], 1)));
                    } else {
                        const used = new Set([0]);
                        for (let j = 1; j < c.length; j++) {
                            const val = String(c[j] || '').trim();
                            if (!val) { used.add(j); continue; }
                            if (val === currentOrder.externalOrderId || isDateLikeString(val)) { used.add(j); continue; }
                            if (!aid && /^1[3-9]\d{8,9}$/.test(val.replace(/[^0-9]/g, ''))) { aid = val.replace(/[^0-9]/g, ''); used.add(j); }
                            else if (!ean && /^\d{13}$/.test(val)) { ean = val; used.add(j); }
                            else if (!sku && (catalogLookup[val] || /^[A-Za-z0-9][A-Za-z0-9\-_]{3,28}$/.test(val) && !/^\d+[.,]\d+$/.test(val))) {
                                if (catalogLookup[val] || /\d/.test(val)) { sku = val; used.add(j); }
                            }
                        }
                        const nums = [];
                        for (let j = 1; j < c.length; j++) {
                            if (used.has(j)) continue;
                            const val = String(c[j] || '').trim();
                            if (/^\d+(?:[.,]\d{1,4})?$/.test(val)) {
                                nums.push({ j, val, num: parseLocaleNumber(val, 0), hasDec: /[.,]/.test(val) });
                            } else if (!name && val.length >= 4 && /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]{3,}/.test(val)) {
                                name = val;
                            }
                        }
                        const decPrice = nums.find(n => n.hasDec && n.num > 0);
                        if (decPrice) {
                            price = decPrice.num;
                            const intQty = nums.find(n => !n.hasDec && n.j !== decPrice.j && n.num >= 1 && n.num <= 500);
                            if (intQty) qty = Math.round(intQty.num);
                        } else if (nums.length > 0) {
                            price = nums[0].num;
                            if (nums.length > 1 && nums[1].num >= 1 && nums[1].num <= 100) qty = Math.round(nums[1].num);
                        }
                    }

                    if (!isShippingLineItem(name, sku, ean) && (name || sku || ean || price > 0)) {
                        const matched = catalogLookup[sku] || catalogLookup[ean] || {};
                        currentOrder.items.push({
                            sku: sku || matched.sku || ean || name,
                            ean: ean || matched.ean || null,
                            productId: pid || null,
                            auctionId: aid || null,
                            name: name || matched.name || sku || 'Produkt',
                            qty,
                            priceOrig: round2(price)
                        });
                    }
                }
            }
        }
    } else {
        // Płaski format CSV Base.com
        const iId = findColumnIdx(hdrNorm, ['numer_zamowienia', 'id_zamowienia', 'order_id', 'nr_zamowienia']);
        const iDate = findColumnIdx(hdrNorm, ['data_potwierdzenia', 'data_zamowienia', 'data_zlozenia', 'date_confirmed', 'date_add', 'data']);
        const iOrig = findColumnIdx(hdrNorm, ['pochodzenie', 'zrodlo', 'order_source', 'platforma']);
        const iCur = findColumnIdx(hdrNorm, ['waluta', 'currency']);
        const iCtry = findColumnIdx(hdrNorm, ['kraj_dostawy', 'kraj', 'delivery_country_code']);
        const iSmart = findColumnIdx(hdrNorm, ['allegro_smart', 'smart']);
        const iPoz = findColumnIdx(hdrNorm, ['pozycje_zamowienia', 'pozycje']);
        const iName = findColumnIdx(hdrNorm, ['nazwa_produktu', 'nazwa_towaru', 'nazwa_pozycji', 'nazwa', 'name']);
        const iSku = findColumnIdx(hdrNorm, ['sku', 'kod_produktu', 'symbol']);
        const iEan = findColumnIdx(hdrNorm, ['ean']);
        const iAuc = findColumnIdx(hdrNorm, ['id_aukcji', 'numer_aukcji', 'auction_id', 'aukcja']);
        const iPrice = findColumnIdx(hdrNorm, ['cena_brutto', 'cena_jednostkowa', 'cena', 'price_brutto']);
        const iQty = findColumnIdx(hdrNorm, ['ilosc', 'liczba_sztuk', 'sztuk', 'quantity']);

        for (let i = 1; i < rows.length; i++) {
            const c = rows[i];
            if (!c || c.length < 2) continue;
            const oid = iId !== -1 ? String(c[iId] || '').trim() : `CSV_${fileName}_${i}`;
            if (!oid) continue;
            const origin = iOrig !== -1 ? String(c[iOrig] || '').trim() : '';
            const cur = iCur !== -1 ? String(c[iCur] || '').trim() : '';
            const ctry = iCtry !== -1 ? String(c[iCtry] || '').trim() : 'PL';
            const ordDate = iDate !== -1 ? parseFlexibleDate(c[iDate]) : new Date();
            const isSmart = iSmart !== -1 ? /^(tak|yes|1|true|smart)$/i.test(String(c[iSmart] || '').trim()) : false;

            if (!ordersMap.has(oid)) {
                ordersMap.set(oid, {
                    externalOrderId: oid,
                    orderDate: ordDate,
                    originRaw: origin,
                    currency: normalizeCurrencyCode(cur, ctry),
                    country: ctry || 'PL',
                    isSmart,
                    items: []
                });
            }
            const ord = ordersMap.get(oid);

            if (iPoz !== -1 && c[iPoz]) {
                ord.items.push(...extractPackedItems(c[iPoz]));
            } else {
                const name = iName !== -1 ? String(c[iName] || '').trim() : '';
                const sku = iSku !== -1 ? String(c[iSku] || '').trim() : '';
                const ean = iEan !== -1 ? String(c[iEan] || '').trim() : '';
                const aid = iAuc !== -1 ? String(c[iAuc] || '').replace(/[^0-9]/g, '') : '';
                const price = iPrice !== -1 ? parseLocaleNumber(c[iPrice], 0) : 0;
                const qty = iQty !== -1 ? Math.max(1, Math.round(parseLocaleNumber(c[iQty], 1))) : 1;
                if (!isShippingLineItem(name, sku, ean) && (name || sku || ean || price > 0)) {
                    const matched = catalogLookup[sku] || catalogLookup[ean] || {};
                    ord.items.push({
                        sku: sku || matched.sku || ean || name,
                        ean: ean || matched.ean || null,
                        productId: null,
                        auctionId: aid || null,
                        name: name || matched.name || sku || 'Produkt',
                        qty,
                        priceOrig: round2(price)
                    });
                }
            }
        }
    }

    const result = [];
    for (const o of ordersMap.values()) {
        if (o.items.length === 0) continue;
        if (strictAllegroOnly) {
            const hasAuc = o.items.some(it => it.auctionId && it.auctionId.length >= 8);
            const isAllegroSrc = /allegro/i.test(o.originRaw || '');
            if (!hasAuc && !isAllegroSrc) continue;
        }
        result.push(o);
    }
    return result;
}

function parseAllegroAdsRows(rows) {
    if (!rows || rows.length < 2) return [];
    const hdr = rows[0].map(normalizeHeader);
    const iCamp = findColumnIdx(hdr, ['kampania', 'nazwa_kampanii', 'campaign', 'campaign_name']);
    const iGroup = findColumnIdx(hdr, ['grupa_reklam', 'ad_group', 'grupa']);
    const iOffer = findColumnIdx(hdr, ['id_oferty', 'numer_oferty', 'offer_id', 'oferta']);
    const iSku = findColumnIdx(hdr, ['sku', 'sygnatura', 'external_id']);
    const iName = findColumnIdx(hdr, ['nazwa_oferty', 'tytul_oferty', 'produkt', 'offer_name']);
    const iImpr = findColumnIdx(hdr, ['wyswietlenia', 'impressions', 'odslony']);
    const iClicks = findColumnIdx(hdr, ['klikniecia', 'clicks']);
    const iCost = findColumnIdx(hdr, ['koszt_netto', 'koszt', 'wydatki', 'cost', 'spend']);
    const iCostGross = findColumnIdx(hdr, ['koszt_brutto', 'cost_gross']);
    const iRev = findColumnIdx(hdr, ['sprzedaz', 'przychod_z_reklam', 'wartosc_sprzedazy', 'ad_sales', 'sales', 'revenue']);
    const iUnits = findColumnIdx(hdr, ['liczba_sprzedanych_sztuk', 'sprzedane_sztuki', 'sztuki', 'units']);
    const iCtr = findColumnIdx(hdr, ['ctr']);
    const iCpc = findColumnIdx(hdr, ['sr_cpc', 'cpc', 'avg_cpc']);
    const iRoas = findColumnIdx(hdr, ['roas', 'zwrot_z_inwestycji']);
    const iStart = findColumnIdx(hdr, ['poczatek_okresu', 'data_od', 'date_from', 'period_start', 'data']);
    const iEnd = findColumnIdx(hdr, ['koniec_okresu', 'data_do', 'date_to', 'period_end']);

    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const c = rows[i];
        if (!c || c.length < 2) continue;
        const camp = iCamp !== -1 ? String(c[iCamp] || '').trim() : 'Kampania Allegro Ads';
        if (!camp || /^(razem|suma|total|podsumowanie)/i.test(camp)) continue;

        const impr = iImpr !== -1 ? Math.max(0, Math.round(parseLocaleNumber(c[iImpr], 0))) : 0;
        const clicks = iClicks !== -1 ? Math.max(0, Math.round(parseLocaleNumber(c[iClicks], 0))) : 0;
        const costNet = iCost !== -1 ? Math.max(0, parseLocaleNumber(c[iCost], 0)) : 0;
        const costGross = iCostGross !== -1 ? Math.max(0, parseLocaleNumber(c[iCostGross], 0)) : round2(costNet * 1.23);
        const adRev = iRev !== -1 ? Math.max(0, parseLocaleNumber(c[iRev], 0)) : 0;
        const units = iUnits !== -1 ? Math.max(0, Math.round(parseLocaleNumber(c[iUnits], 0))) : 0;
        if (impr === 0 && clicks === 0 && costNet === 0 && adRev === 0) continue;

        const pStart = iStart !== -1 ? parseFlexibleDate(c[iStart]) : utcDayMidnight(new Date(Date.now() - 30 * 86400000));
        const pEnd = iEnd !== -1 ? parseFlexibleDate(c[iEnd], pStart) : pStart;
        const ctr = iCtr !== -1 && c[iCtr] !== '' ? parseLocaleNumber(c[iCtr], 0) : (impr > 0 ? round2((clicks / impr) * 100) : 0);
        const cpc = iCpc !== -1 && c[iCpc] !== '' ? parseLocaleNumber(c[iCpc], 0) : (clicks > 0 ? round2(costNet / clicks) : 0);
        const roas = iRoas !== -1 && c[iRoas] !== '' ? parseLocaleNumber(c[iRoas], 0) : (costNet > 0 ? round2(adRev / costNet) : 0);

        const offerId = iOffer !== -1 ? String(c[iOffer] || '').replace(/[^0-9]/g, '') || null : null;
        const sku = iSku !== -1 ? String(c[iSku] || '').trim() || null : null;
        const group = iGroup !== -1 ? String(c[iGroup] || '').trim() || null : null;
        const pName = iName !== -1 ? String(c[iName] || '').trim() || null : null;

        const hashPayload = `${pStart.toISOString().slice(0, 10)}|${pEnd.toISOString().slice(0, 10)}|${camp}|${group || ''}|${offerId || ''}|${sku || ''}|${costNet}|${adRev}|${clicks}`;
        const sourceRowHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

        out.push({
            periodStart: pStart,
            periodEnd: pEnd,
            campaignName: camp.slice(0, 200),
            adGroupName: group ? group.slice(0, 200) : null,
            offerId,
            sku,
            productName: pName ? pName.slice(0, 250) : null,
            impressions: impr,
            clicks,
            costNetPln: round2(costNet),
            costGrossPln: round2(costGross),
            adRevenuePln: round2(adRev),
            unitsSold: units,
            ctr,
            cpcPln: round2(cpc),
            roas,
            sourceRowHash
        });
    }
    return out;
}

function parseAllegroAnalyticsOrBillingRows(rows) {
    if (!rows || rows.length < 2) return { entries: [], snapshots: [] };
    const hdr = rows[0].map(normalizeHeader);
    const joined = hdr.join(' ');
    const isFinancial = joined.includes('prowizja') || joined.includes('kwota') || joined.includes('typ_operacji') || joined.includes('amount');

    const entries = [];
    const snapshots = [];

    if (isFinancial) {
        const iId = findColumnIdx(hdr, ['id_operacji', 'id', 'entry_id']);
        const iDate = findColumnIdx(hdr, ['data', 'data_operacji', 'occurred_at', 'date']);
        const iType = findColumnIdx(hdr, ['typ_operacji', 'rodzaj', 'type']);
        const iOffer = findColumnIdx(hdr, ['id_oferty', 'numer_oferty', 'offer_id']);
        const iOrder = findColumnIdx(hdr, ['id_zamowienia', 'order_id', 'numer_zamowienia']);
        const iAmt = findColumnIdx(hdr, ['kwota', 'wartosc', 'prowizja', 'amount']);

        for (let i = 1; i < rows.length; i++) {
            const c = rows[i];
            if (!c || c.length < 2) continue;
            const amt = iAmt !== -1 ? parseLocaleNumber(c[iAmt], NaN) : NaN;
            if (!Number.isFinite(amt)) continue;
            const tName = iType !== -1 ? String(c[iType] || 'Opłata Allegro').trim() : 'Opłata Allegro';
            const dt = iDate !== -1 ? parseFlexibleDate(c[iDate]) : new Date();
            const offerId = iOffer !== -1 ? String(c[iOffer] || '').replace(/[^0-9]/g, '') || null : null;
            const orderId = iOrder !== -1 ? String(c[iOrder] || '').trim() || null : null;
            const extId = iId !== -1 && c[iId] ? String(c[iId]).trim() : crypto.createHash('sha1').update(`CSV_${dt.toISOString()}_${tName}_${offerId || ''}_${orderId || ''}_${amt}_${i}`).digest('hex');

            let cat = 'OTHER';
            const low = tName.toLowerCase();
            if (low.includes('zwrot') && low.includes('prowiz')) cat = 'COMMISSION_REFUND';
            else if (low.includes('prowiz')) cat = 'COMMISSION';
            else if (low.includes('smart')) cat = 'SMART';
            else if (low.includes('wyróżn') || low.includes('wyrozn') || low.includes('promow')) cat = 'PROMO_FEE';
            else if (low.includes('ads') || low.includes('reklam')) cat = 'ADS';

            entries.push({
                externalEntryId: extId,
                entryDate: dt,
                entryTypeCode: 'CSV',
                entryTypeName: tName.slice(0, 200),
                category: cat,
                offerId,
                orderId,
                amountPln: amt > 0 && cat !== 'COMMISSION_REFUND' ? -round2(amt) : round2(amt)
            });
        }
    } else {
        // Eksport ruchu / Allegro Analytics (Top Oferta / Najniższa cena / Odwiedziny)
        const iOffer = findColumnIdx(hdr, ['id_oferty', 'numer_oferty', 'offer_id']);
        const iSku = findColumnIdx(hdr, ['sku', 'sygnatura']);
        const iEan = findColumnIdx(hdr, ['ean']);
        const iName = findColumnIdx(hdr, ['nazwa_oferty', 'nazwa', 'produkt', 'title']);
        const iVisits = findColumnIdx(hdr, ['odwiedziny', 'wyswietlenia', 'visits']);
        const iWatch = findColumnIdx(hdr, ['obserwujacy', 'watchers']);
        const iPrice = findColumnIdx(hdr, ['cena', 'nasza_cena', 'price']);
        const iMinComp = findColumnIdx(hdr, ['najnizsza_cena', 'cena_konkurencji', 'lowest_price']);
        const iTop = findColumnIdx(hdr, ['top_oferta', 'odznaka', 'badge']);

        const today = utcDayMidnight(new Date());
        for (let i = 1; i < rows.length; i++) {
            const c = rows[i];
            if (!c || c.length < 2) continue;
            const offerId = iOffer !== -1 ? String(c[iOffer] || '').replace(/[^0-9]/g, '') : '';
            const sku = iSku !== -1 ? String(c[iSku] || '').trim() : '';
            const ean = iEan !== -1 ? String(c[iEan] || '').trim() : '';
            const extOfferId = offerId || sku || ean;
            if (!extOfferId) continue;
            snapshots.push({
                snapshotDate: today,
                externalOfferId: extOfferId,
                sku: sku || null,
                ean: ean || null,
                name: iName !== -1 ? String(c[iName] || '').slice(0, 250) : null,
                visitsCount: iVisits !== -1 ? Math.max(0, Math.round(parseLocaleNumber(c[iVisits], 0))) : null,
                watchersCount: iWatch !== -1 ? Math.max(0, Math.round(parseLocaleNumber(c[iWatch], 0))) : null,
                pricePln: iPrice !== -1 ? round2(parseLocaleNumber(c[iPrice], 0)) : 0,
                hasBadge: iTop !== -1 ? /^(tak|yes|1|true|top)/i.test(String(c[iTop] || '').trim()) : false,
                meta: {
                    competitorLowestPricePln: iMinComp !== -1 ? round2(parseLocaleNumber(c[iMinComp], 0)) : null,
                    source: 'CSV_ALLEGRO_ANALYTICS'
                }
            });
        }
    }

    return { entries, snapshots };
}

/**
 * Importuje wgrane pliki (.csv, .xlsx, .xls, .json) do tabel analitycznych dla wskazanego Workspace.
 */
async function importFilesForWorkspace({
    workspaceId,
    files = [],
    importType = 'AUTO',
    strictAllegroOnly = false,
    fxRates = {},
    injectedPrisma = prisma
} = {}) {
    if (!workspaceId) throw new Error('Wymagany jest workspaceId do importu danych.');
    if (!Array.isArray(files) || files.length === 0) throw new Error('Nie przesłano żadnych plików do importu.');

    const existingProducts = await injectedPrisma.product.findMany({
        where: { workspaceId },
        select: { id: true, sku: true, ean: true, name: true }
    });
    const catalogLookup = {};
    for (const p of existingProducts) {
        if (p.sku) catalogLookup[p.sku] = p;
        if (p.ean) catalogLookup[p.ean] = p;
    }

    const batchResults = [];

    for (const file of files) {
        const fileName = String(file.originalname || file.name || 'import.csv');
        const buf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer || '');

        let rows = [];
        let format = importType && importType !== 'AUTO' ? importType : null;
        if (!format || format !== 'LEGACY_JSON_CACHE') {
            if (!fileName.toLowerCase().endsWith('.json')) {
                rows = spreadsheetToRows(fileName, buf);
            }
        }
        if (!format) {
            format = detectImportFormat(fileName, buf, rows);
        }

        const warnings = [];
        let importedCount = 0;
        let skippedCount = 0;
        let minDate = null;
        let maxDate = null;
        let platform = 'BASELINKER';
        let summary = { format };

        if (format === 'ALLEGRO_ADS_CSV') platform = 'ALLEGRO';
        else if (format === 'ALLEGRO_ANALYTICS_CSV') platform = 'ALLEGRO';
        else if (format === 'VONHALSKY_CSV') platform = 'VONHALSKY';

        const batch = await injectedPrisma.analyticsImportBatch.create({
            data: {
                workspaceId,
                platform,
                sourceType: format,
                fileName: fileName.slice(0, 200),
                status: 'PROCESSING'
            }
        });

        try {
            if (format === 'LEGACY_JSON_CACHE') {
                const jsonTxt = decodeTextSmart(buf);
                const parsed = JSON.parse(jsonTxt);
                const rawOrders = Array.isArray(parsed) ? parsed : (parsed.orders || []);
                const plnRef = buildPlnReferencePriceMap(rawOrders);

                for (const ord of rawOrders) {
                    const oid = String(ord?.order_id || '').trim();
                    if (!oid) { skippedCount++; continue; }
                    const ts = Number(ord.date_confirmed || ord.date_add || 0);
                    const ordDate = ts > 0 ? new Date(ts * 1000) : new Date();
                    const originChannel = /vonhalsky|inpost/i.test(String(ord.order_source || ''))
                        ? 'VONHALSKY'
                        : (/allegro/i.test(String(ord.order_source || '')) || (ord.products || []).some(p => p.auction_id) ? 'ALLEGRO' : 'OTHER');
                    if (strictAllegroOnly && originChannel !== 'ALLEGRO') { skippedCount++; continue; }

                    const rawItems = (ord.products || []).filter(p => !isShippingLineItem(p?.name, p?.sku, p?.ean));
                    if (rawItems.length === 0) { skippedCount++; continue; }

                    let cur = normalizeCurrencyCode(ord.currency, ord.delivery_country_code);
                    if (!cur) cur = inferForeignCurrencyFromPlnPrices(rawItems, plnRef).currency;
                    const fx = resolveFxRate(cur, fxRates);

                    const cleanItems = [];
                    let sumOrig = 0;
                    for (const p of rawItems) {
                        const qty = Math.max(1, parseInt(p.quantity || 1, 10) || 1);
                        const priceOrig = Math.max(0, parseFloat(p.price_brutto || 0) || 0);
                        sumOrig += qty * priceOrig;
                        cleanItems.push({
                            sku: String(p.sku || p.ean || p.name || '').trim(),
                            ean: p.ean ? String(p.ean).trim() : null,
                            productId: p.product_id ? String(p.product_id) : null,
                            auctionId: p.auction_id ? String(p.auction_id).replace(/[^0-9]/g, '') : null,
                            name: String(p.name || 'Produkt'),
                            qty,
                            priceOrig: round2(priceOrig),
                            pricePln: round2(priceOrig * fx)
                        });
                    }

                    if (!minDate || ordDate < minDate) minDate = ordDate;
                    if (!maxDate || ordDate > maxDate) maxDate = ordDate;

                    await injectedPrisma.analyticsOrder.upsert({
                        where: {
                            workspaceId_platform_externalOrderId: {
                                workspaceId,
                                platform: 'BASELINKER',
                                externalOrderId: oid
                            }
                        },
                        update: {
                            originChannel,
                            marketplaceOrderId: ord.external_order_id ? String(ord.external_order_id) : null,
                            sourceMode: 'JSON',
                            importBatchId: batch.id,
                            orderDate: ordDate,
                            marketplace: inferMarketplaceFromOrder({ originChannel, currency: cur, country: ord.delivery_country_code }),
                            currency: cur,
                            fxRateToPln: fx,
                            totalGmvOriginal: round2(sumOrig),
                            totalGmvPln: round2(sumOrig * fx),
                            items: cleanItems
                        },
                        create: {
                            workspaceId,
                            platform: 'BASELINKER',
                            originChannel,
                            externalOrderId: oid,
                            marketplaceOrderId: ord.external_order_id ? String(ord.external_order_id) : null,
                            sourceMode: 'JSON',
                            importBatchId: batch.id,
                            orderDate: ordDate,
                            marketplace: inferMarketplaceFromOrder({ originChannel, currency: cur, country: ord.delivery_country_code }),
                            currency: cur,
                            fxRateToPln: fx,
                            totalGmvOriginal: round2(sumOrig),
                            totalGmvPln: round2(sumOrig * fx),
                            items: cleanItems
                        }
                    });
                    importedCount++;
                }

                // Zapisujemy ewentualne logi produktowe ze starego JSON do podsumowania paczki
                if (parsed?.productLogs && typeof parsed.productLogs === 'object') {
                    summary.productLogsByProductId = parsed.productLogs;
                }
            } else if (format === 'BASELINKER_ARCHIVE_CSV' || format === 'VONHALSKY_CSV') {
                const parsedOrders = parseBaseLinkerRowsToOrders(rows, fileName, { strictAllegroOnly, catalogLookup });
                const plnRef = buildPlnReferencePriceMap(parsedOrders);
                const targetPlatform = format === 'VONHALSKY_CSV' ? 'VONHALSKY' : 'BASELINKER';

                for (const o of parsedOrders) {
                    let cur = o.currency;
                    if (!cur) cur = inferForeignCurrencyFromPlnPrices(o.items, plnRef).currency;
                    const fx = resolveFxRate(cur, fxRates);
                    const originChannel = format === 'VONHALSKY_CSV'
                        ? 'VONHALSKY'
                        : (/allegro/i.test(o.originRaw || '') || o.items.some(it => it.auctionId) ? 'ALLEGRO' : 'SHOP');

                    let sumOrig = 0;
                    const cleanItems = o.items.map(it => {
                        sumOrig += it.qty * it.priceOrig;
                        return { ...it, pricePln: round2(it.priceOrig * fx) };
                    });

                    if (!minDate || o.orderDate < minDate) minDate = o.orderDate;
                    if (!maxDate || o.orderDate > maxDate) maxDate = o.orderDate;

                    await injectedPrisma.analyticsOrder.upsert({
                        where: {
                            workspaceId_platform_externalOrderId: {
                                workspaceId,
                                platform: targetPlatform,
                                externalOrderId: o.externalOrderId
                            }
                        },
                        update: {
                            originChannel,
                            sourceMode: 'CSV',
                            importBatchId: batch.id,
                            orderDate: o.orderDate,
                            deliveryCountry: o.country,
                            marketplace: inferMarketplaceFromOrder({ originChannel, currency: cur, country: o.country }),
                            currency: cur,
                            fxRateToPln: fx,
                            isSmart: o.isSmart,
                            totalGmvOriginal: round2(sumOrig),
                            totalGmvPln: round2(sumOrig * fx),
                            items: cleanItems
                        },
                        create: {
                            workspaceId,
                            platform: targetPlatform,
                            originChannel,
                            externalOrderId: o.externalOrderId,
                            sourceMode: 'CSV',
                            importBatchId: batch.id,
                            orderDate: o.orderDate,
                            deliveryCountry: o.country,
                            marketplace: inferMarketplaceFromOrder({ originChannel, currency: cur, country: o.country }),
                            currency: cur,
                            fxRateToPln: fx,
                            isSmart: o.isSmart,
                            totalGmvOriginal: round2(sumOrig),
                            totalGmvPln: round2(sumOrig * fx),
                            items: cleanItems
                        }
                    });
                    importedCount++;
                }
            } else if (format === 'ALLEGRO_ADS_CSV') {
                const metrics = parseAllegroAdsRows(rows);
                for (const m of metrics) {
                    if (!minDate || m.periodStart < minDate) minDate = m.periodStart;
                    if (!maxDate || m.periodEnd > maxDate) maxDate = m.periodEnd;

                    await injectedPrisma.analyticsAdsMetric.upsert({
                        where: {
                            workspaceId_platform_sourceRowHash: {
                                workspaceId,
                                platform: 'ALLEGRO',
                                sourceRowHash: m.sourceRowHash
                            }
                        },
                        update: {
                            ...m,
                            importBatchId: batch.id
                        },
                        create: {
                            workspaceId,
                            platform: 'ALLEGRO',
                            ...m,
                            importBatchId: batch.id
                        }
                    });
                    importedCount++;
                }
            } else if (format === 'ALLEGRO_ANALYTICS_CSV') {
                const { entries, snapshots } = parseAllegroAnalyticsOrBillingRows(rows);
                for (const en of entries) {
                    if (!minDate || en.entryDate < minDate) minDate = en.entryDate;
                    if (!maxDate || en.entryDate > maxDate) maxDate = en.entryDate;

                    await injectedPrisma.analyticsFinancialEntry.upsert({
                        where: {
                            workspaceId_platform_externalEntryId: {
                                workspaceId,
                                platform: 'ALLEGRO',
                                externalEntryId: en.externalEntryId
                            }
                        },
                        update: {
                            ...en,
                            importBatchId: batch.id
                        },
                        create: {
                            workspaceId,
                            platform: 'ALLEGRO',
                            ...en,
                            importBatchId: batch.id
                        }
                    });
                    importedCount++;
                }
                for (const snap of snapshots) {
                    await injectedPrisma.analyticsDailyOfferSnapshot.upsert({
                        where: {
                            workspaceId_platform_snapshotDate_externalOfferId: {
                                workspaceId,
                                platform: 'ALLEGRO',
                                snapshotDate: snap.snapshotDate,
                                externalOfferId: snap.externalOfferId
                            }
                        },
                        update: {
                            sku: snap.sku,
                            ean: snap.ean,
                            name: snap.name,
                            visitsCount: snap.visitsCount,
                            watchersCount: snap.watchersCount,
                            pricePln: snap.pricePln,
                            hasBadge: snap.hasBadge,
                            meta: snap.meta
                        },
                        create: {
                            workspaceId,
                            platform: 'ALLEGRO',
                            ...snap
                        }
                    });
                    importedCount++;
                }
            } else {
                warnings.push(`Nierozpoznany format pliku ${fileName}.`);
            }

            if (importedCount === 0 && warnings.length === 0) {
                warnings.push(`Plik ${fileName} nie zawierał poprawnych wierszy do zaimportowania.`);
            }

            await injectedPrisma.analyticsImportBatch.update({
                where: { id: batch.id },
                data: {
                    status: 'COMPLETED',
                    recordsImported: importedCount,
                    recordsSkipped: skippedCount,
                    dateRangeStart: minDate,
                    dateRangeEnd: maxDate,
                    warnings,
                    summary
                }
            });

            batchResults.push({
                batchId: batch.id,
                fileName,
                format,
                platform,
                recordsImported: importedCount,
                recordsSkipped: skippedCount,
                warnings
            });
        } catch (err) {
            await injectedPrisma.analyticsImportBatch.update({
                where: { id: batch.id },
                data: {
                    status: 'FAILED',
                    warnings: [err.message]
                }
            });
            batchResults.push({
                batchId: batch.id,
                fileName,
                format,
                platform,
                recordsImported: 0,
                recordsSkipped: 0,
                warnings: [err.message]
            });
        }
    }

    return batchResults;
}

/**
 * Usuwa/cofa paczkę importu CSV/JSON oraz powiązane rekordy w ścisłej izolacji po `workspaceId`.
 */
async function deleteImportBatch(workspaceId, batchId, injectedPrisma = prisma) {
    if (!workspaceId || !batchId) {
        const err = new Error('Wymagane są workspaceId oraz batchId.');
        err.statusCode = 400;
        throw err;
    }

    const batch = await injectedPrisma.analyticsImportBatch.findFirst({
        where: { id: batchId, workspaceId }
    });
    if (!batch) {
        const err = new Error('Nie znaleziono wskazanej paczki importu dla tego klienta.');
        err.statusCode = 404;
        throw err;
    }

    const [delOrders, delFinancial, delAds] = await injectedPrisma.$transaction([
        injectedPrisma.analyticsOrder.deleteMany({ where: { workspaceId, importBatchId: batchId } }),
        injectedPrisma.analyticsFinancialEntry.deleteMany({ where: { workspaceId, importBatchId: batchId } }),
        injectedPrisma.analyticsAdsMetric.deleteMany({ where: { workspaceId, importBatchId: batchId } }),
        injectedPrisma.analyticsImportBatch.delete({ where: { id: batchId } })
    ]);

    return {
        deletedBatchId: batchId,
        deletedOrders: delOrders.count,
        deletedFinancialEntries: delFinancial.count,
        deletedAdsMetrics: delAds.count
    };
}

module.exports = {
    decodeTextSmart,
    detectImportFormat,
    parseBaseLinkerRowsToOrders,
    parseAllegroAdsRows,
    parseAllegroAnalyticsOrBillingRows,
    importFilesForWorkspace,
    deleteImportBatch
};
