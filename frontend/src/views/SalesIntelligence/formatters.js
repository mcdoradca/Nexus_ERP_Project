export const PLATFORM_TABS = [
    { id: 'ALL', label: 'Omnichannel (Razem)', desc: 'Zdeduplikowany widok łączny ze wszystkich źródeł' },
    { id: 'BASELINKER', label: 'Base.com / BaseLinker', desc: 'Zamówienia, stany ERP, PO, zwroty i logi' },
    { id: 'ALLEGRO', label: 'Allegro PRO', desc: 'Odwiedziny, bilingi opłat, Ads CSV, Smart! i Jakość' },
    { id: 'VONHALSKY', label: 'InPost Von Halsky', desc: 'Statusy ofert, odrzucenia, Program Cenowy, SLA i Posprzedaż' }
];

export const MARKET_OPTIONS = [
    { id: 'ALL', label: 'Wszystkie rynki i waluty' },
    { id: 'ONLY_PLN', label: 'Tylko Polska (PLN)' },
    { id: 'ONLY_FOREIGN', label: 'Zagranica łącznie (CZK, EUR, HUF)' },
    { id: 'ONLY_CZK', label: 'Czechy (CZK)' },
    { id: 'ONLY_EUR', label: 'Słowacja / EU (EUR)' },
    { id: 'ONLY_HUF', label: 'Węgry (HUF)' }
];

export const ROLE_META = {
    ANCHOR: { label: 'Kotwica (Magnes)', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    FILLER: { label: 'Dopełniacz koszyka', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    SOLO: { label: 'Solista', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export const SEVERITY_META = {
    CRITICAL: { label: 'KRYTYCZNY', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
    HIGH: { label: 'WYSOKI', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
    MEDIUM: { label: 'ŚREDNI', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' }
};

export function fmtPln(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return 'Brak danych';
    }
    return `${Number(value).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

export function fmtInt(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return '—';
    }
    return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

export function fmtNum(value, decimals = 1) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return '—';
    }
    return Number(value).toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return '—';
    }
    return `${Number(value).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

export function fmtShortDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('pl-PL');
}

export function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

export function downloadBlobFile(data, filename, mimeType) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const BASELINKER_CSV_COLUMNS_GUIDE =
    'order_id;external_order_id;order_source;date_add;currency;delivery_country_code;delivery_method;delivery_price;product_sku;product_ean;product_name;auction_id;product_quantity;product_price_brutto';
