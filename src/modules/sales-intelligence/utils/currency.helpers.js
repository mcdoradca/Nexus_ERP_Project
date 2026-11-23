/**
 * Wspólne narzędzia walutowe, datowe i detekcji pozycji logistycznych dla Sales Intelligence.
 */

const DEFAULT_FX_RATES = {
    PLN: 1.0,
    CZK: 0.171,
    EUR: 4.32,
    HUF: 0.0108,
    USD: 4.05,
    GBP: 5.15
};

function round2(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function utcDayMidnight(input = new Date()) {
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function toDayKey(input) {
    return utcDayMidnight(input).toISOString().slice(0, 10);
}

function normalizeCurrencyCode(rawCurrency, rawCountry = '') {
    const cur = String(rawCurrency || '').trim().toUpperCase();
    if (cur && DEFAULT_FX_RATES[cur]) return cur;
    if (/^[A-Z]{3}$/.test(cur)) return cur;

    const ctry = String(rawCountry || '').trim().toUpperCase();
    if (ctry === 'CZ') return 'CZK';
    if (ctry === 'HU') return 'HUF';
    if (ctry === 'SK' || ctry === 'DE' || ctry === 'AT' || ctry === 'IT' || ctry === 'FR' || ctry === 'NL') return 'EUR';
    if (ctry === 'PL') return 'PLN';
    return '';
}

function resolveFxRate(currency, fxOverrides = {}) {
    const cur = String(currency || 'PLN').trim().toUpperCase();
    if (cur === 'PLN') return 1.0;
    const custom = Number(fxOverrides?.[cur]);
    if (Number.isFinite(custom) && custom > 0) return custom;
    if (cur === 'HUF' && Number(fxOverrides?.HUF100) > 0) {
        return Number(fxOverrides.HUF100) / 100.0;
    }
    return DEFAULT_FX_RATES[cur] || 1.0;
}

function inferMarketplaceFromOrder({ marketplace = '', originChannel = '', currency = 'PLN', country = 'PL' } = {}) {
    const mk = String(marketplace || '').trim().toLowerCase();
    if (mk) return mk;
    const ch = String(originChannel || '').trim().toUpperCase();
    const cur = String(currency || 'PLN').trim().toUpperCase();
    const ctry = String(country || 'PL').trim().toUpperCase();
    if (ch === 'VONHALSKY') return 'inpost-vonhalsky';
    if (ch === 'ALLEGRO') {
        if (cur === 'CZK' || ctry === 'CZ') return 'allegro-cz';
        if (cur === 'EUR' || ctry === 'SK') return 'allegro-sk';
        if (cur === 'HUF' || ctry === 'HU') return 'allegro-hu';
        return 'allegro-pl';
    }
    return ch ? ch.toLowerCase() : 'other';
}

const SHIPPING_LINE_RX = /^(?:koszt(?:y)?\s+(?:wysy[łl]ki|dostawy|przesy[łl]ki|transportu)|dostawa\b|wysy[łl]ka\b|przesy[łl]ka\b|op[łl]ata\s+za\s+dostaw|paczkomat\b|kurier\b|allegro\s+(?:smart|delivery|paczkomat|kurier|one)|dpd\b|dhl\b|inpost\b|poczta\s+polska|orlen\s+paczka|shipping\b|delivery\b)/i;

function isShippingLineItem(name = '', sku = '', ean = '') {
    const cleanSku = String(sku || '').trim();
    const cleanEan = String(ean || '').trim();
    if (/^\d{8,14}$/.test(cleanEan)) return false;
    const cleanName = String(name || '').trim();
    if (!cleanName) return false;
    if (SHIPPING_LINE_RX.test(cleanName)) return true;
    if (!cleanSku && /(?:koszt\s+wysy[łl]ki|op[łl]ata\s+za\s+przesy[łl]k|delivery\s+fee|shipping\s+cost)/i.test(cleanName)) {
        return true;
    }
    return false;
}

function buildPlnReferencePriceMap(orders = []) {
    const buckets = {};
    for (const ord of orders) {
        const cur = String(ord?.currency || '').trim().toUpperCase();
        if (cur && cur !== 'PLN') continue;
        const country = String(ord?.deliveryCountry || ord?.delivery_country_code || '').trim().toUpperCase();
        if (country && country !== 'PL') continue;
        const items = Array.isArray(ord?.items) ? ord.items : (Array.isArray(ord?.products) ? ord.products : []);
        for (const p of items) {
            if (isShippingLineItem(p?.name, p?.sku, p?.ean)) continue;
            const price = Number(p?.pricePln ?? p?.priceOrig ?? p?.price_brutto ?? 0);
            if (!Number.isFinite(price) || price <= 0 || price > 500) continue;
            const keys = [
                String(p?.productId || p?.product_id || '').trim(),
                String(p?.sku || '').trim(),
                String(p?.ean || '').trim()
            ].filter(k => k && k !== '0');
            for (const k of keys) {
                if (!buckets[k]) buckets[k] = [];
                buckets[k].push(price);
            }
        }
    }
    const medianMap = {};
    for (const [k, arr] of Object.entries(buckets)) {
        arr.sort((a, b) => a - b);
        medianMap[k] = arr[Math.floor(arr.length / 2)];
    }
    return medianMap;
}

function inferForeignCurrencyFromPlnPrices(items = [], plnRefMap = {}) {
    if (!Array.isArray(items) || items.length === 0) return { currency: 'PLN', inferred: false };
    const ratios = [];
    let rawSum = 0;
    let validCnt = 0;

    for (const p of items) {
        const rawP = Number(p?.priceOrig ?? p?.price_brutto ?? p?.pricePln ?? 0);
        if (!Number.isFinite(rawP) || rawP <= 0) continue;
        rawSum += rawP;
        validCnt++;

        const refP = plnRefMap[String(p?.productId || p?.product_id || '').trim()]
            || plnRefMap[String(p?.sku || '').trim()]
            || plnRefMap[String(p?.ean || '').trim()];

        if (refP > 0) {
            ratios.push(rawP / refP);
        }
    }

    if (ratios.length > 0) {
        ratios.sort((a, b) => a - b);
        const medRatio = ratios[Math.floor(ratios.length / 2)];
        if (medRatio >= 35) return { currency: 'HUF', inferred: true };
        if (medRatio >= 3.1 && medRatio < 35) return { currency: 'CZK', inferred: true };
        if (medRatio > 0 && medRatio <= 0.38) return { currency: 'EUR', inferred: true };
        return { currency: 'PLN', inferred: false };
    }

    if (validCnt > 0) {
        const avgRaw = rawSum / validCnt;
        if (avgRaw >= 350) return { currency: 'HUF', inferred: true };
        if (avgRaw >= 65 && items.every(p => Number(p?.priceOrig ?? p?.price_brutto ?? 0) >= 35)) {
            return { currency: 'CZK', inferred: true };
        }
        if (avgRaw > 0 && avgRaw <= 4.5) return { currency: 'EUR', inferred: true };
    }

    return { currency: 'PLN', inferred: false };
}

module.exports = {
    DEFAULT_FX_RATES,
    round2,
    round4,
    utcDayMidnight,
    toDayKey,
    normalizeCurrencyCode,
    resolveFxRate,
    inferMarketplaceFromOrder,
    isShippingLineItem,
    buildPlnReferencePriceMap,
    inferForeignCurrencyFromPlnPrices
};
