import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    X, Send, RefreshCw, Loader2, CheckCircle2, AlertTriangle, ShieldAlert,
    Search, Package, Tag, Layers, Image, ShieldCheck
} from 'lucide-react';

const STOCK_UNITS = [
    { value: 'UNIT', label: 'Sztuka (UNIT)' },
    { value: 'SET', label: 'Zestaw (SET)' },
    { value: 'PAIR', label: 'Para (PAIR)' },
    { value: 'OTHER', label: 'Inna (OTHER)' }
];

const EMPTY_SECTIONS = {
    includeTitle: true,
    includeDescription: true,
    includeImages: true,
    includeAttributes: true,
    includePrice: true,
    includeStock: true,
    includeGpsr: true,
    includeDimensions: true,
    includeShipping: true,
    includePostSale: true
};

export const VonHalskyExportModal = ({
    isOpen,
    onClose,
    validationResult,
    isValidating,
    isExporting,
    onRevalidate,
    onConfirmExport,
    token,
    API_URL,
    getSafeImageSrc,
    activeWorkspace = null,
    accounts = []
}) => {
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [mode, setMode] = useState('auto');
    const [offerId, setOfferId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [categorySearch, setCategorySearch] = useState('');
    const [categoryResults, setCategoryResults] = useState([]);
    const [isSearchingCategories, setIsSearchingCategories] = useState(false);

    const [name, setName] = useState('');
    const [brand, setBrand] = useState('');
    const [descriptionFormat, setDescriptionFormat] = useState('html');
    const [priceAmount, setPriceAmount] = useState('');
    const [taxRateInfo, setTaxRateInfo] = useState('23%');
    const [stockQuantity, setStockQuantity] = useState('0');
    const [stockUnit, setStockUnit] = useState('UNIT');
    const [daysToShip, setDaysToShip] = useState('1');
    const [dimension, setDimension] = useState({ width: '', height: '', length: '', weight: '' });
    const [sections, setSections] = useState(EMPTY_SECTIONS);

    const [attributeOverrides, setAttributeOverrides] = useState({});
    const [gpsr, setGpsr] = useState({
        doesNotRequireGpsrInfo: false,
        safetyInformation: '',
        manufacturer: {
            name: '',
            email: '',
            phone: '',
            countryCode: 'PL',
            unstructuredAddress: '',
            responsiblePersonDetails: {
                name: '',
                email: '',
                phone: '',
                countryCode: '',
                unstructuredAddress: ''
            }
        }
    });

    const [previewDirty, setPreviewDirty] = useState(false);
    // Dwukrotne potwierdzenie: 0 = przed 1. kliknięciem, 1 = po 1. kliknięciu (oczekuje na ostateczne 2. potwierdzenie)
    const [confirmStep, setConfirmStep] = useState(0);

    useEffect(() => {
        if (!validationResult) return;
        const p = validationResult.preview || {};
        setSelectedAccountId(validationResult.account?.id || '');
        setMode(validationResult.mode || 'create');
        setOfferId(validationResult.offer?.id || '');
        setCategoryId(p.categoryId || '');
        setName(p.name || '');
        setBrand(p.brand || '');
        setDescriptionFormat(p.descriptionFormat || 'html');
        setPriceAmount(p.priceAmount !== null && p.priceAmount !== undefined ? String(p.priceAmount) : '');
        setTaxRateInfo(p.taxRateInfo || '23%');
        setStockQuantity(p.stockQuantity !== null && p.stockQuantity !== undefined ? String(p.stockQuantity) : '0');
        setStockUnit(p.stockUnit || 'UNIT');
        setDaysToShip(p.daysToShip !== null && p.daysToShip !== undefined ? String(p.daysToShip) : '1');
        setDimension({
            width: p.dimension?.width ? String(p.dimension.width) : '',
            height: p.dimension?.height ? String(p.dimension.height) : '',
            length: p.dimension?.length ? String(p.dimension.length) : '',
            weight: p.dimension?.weight ? String(p.dimension.weight) : ''
        });
        setSections(p.sections ? { ...EMPTY_SECTIONS, ...p.sections } : EMPTY_SECTIONS);

        const attrMap = {};
        (p.attributes || []).forEach(a => {
            if (Array.isArray(a.proposedValues) && a.proposedValues.length > 0) {
                attrMap[a.id] = a.multi ? a.proposedValues : a.proposedValues[0];
            }
        });
        setAttributeOverrides(attrMap);

        const g = p.gpsr || {};
        const gm = g.manufacturer || {};
        const gr = gm.responsiblePersonDetails || {};
        setGpsr({
            doesNotRequireGpsrInfo: Boolean(g.doesNotRequireGpsrInfo),
            safetyInformation: g.safetyInformation || '',
            manufacturer: {
                name: gm.name || '',
                email: gm.email || '',
                phone: gm.phone || '',
                countryCode: gm.countryCode || 'PL',
                unstructuredAddress: gm.unstructuredAddress || '',
                responsiblePersonDetails: {
                    name: gr.name || '',
                    email: gr.email || '',
                    phone: gr.phone || '',
                    countryCode: gr.countryCode || '',
                    unstructuredAddress: gr.unstructuredAddress || ''
                }
            }
        });

        setPreviewDirty(false);
        setConfirmStep(0);
    }, [validationResult]);

    const markDirty = useCallback(() => {
        setPreviewDirty(true);
        setConfirmStep(0);
    }, []);

    const buildCurrentOverrides = useCallback(() => {
        const cleanAttrs = {};
        Object.entries(attributeOverrides || {}).forEach(([k, v]) => {
            if (Array.isArray(v)) {
                const filtered = v.map(x => String(x || '').trim()).filter(Boolean);
                cleanAttrs[k] = filtered;
            } else {
                cleanAttrs[k] = String(v ?? '').trim();
            }
        });

        return {
            name,
            brand,
            categoryId: categoryId.trim(),
            descriptionFormat,
            priceAmount,
            taxRateInfo,
            stockQuantity,
            stockUnit,
            daysToShip,
            dimension: {
                ...(dimension.width !== '' ? { width: dimension.width } : {}),
                ...(dimension.height !== '' ? { height: dimension.height } : {}),
                ...(dimension.length !== '' ? { length: dimension.length } : {}),
                ...(dimension.weight !== '' ? { weight: dimension.weight } : {})
            },
            gpsr,
            attributes: cleanAttrs,
            ...sections
        };
    }, [
        attributeOverrides, name, brand, categoryId, descriptionFormat, priceAmount,
        taxRateInfo, stockQuantity, stockUnit, daysToShip, dimension, gpsr, sections
    ]);

    const handleSearchCategories = async () => {
        if (!token) return;
        setIsSearchingCategories(true);
        try {
            const accQuery = selectedAccountId ? `&accountId=${encodeURIComponent(selectedAccountId)}` : '';
            const res = await axios.get(
                `${API_URL}/api/offer-optimizer/vonhalsky/categories?q=${encodeURIComponent(categorySearch.trim())}&limit=50${accQuery}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setCategoryResults(Array.isArray(res.data?.categories) ? res.data.categories : []);
        } catch (err) {
            alert('Błąd wyszukiwania kategorii Von Halsky: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsSearchingCategories(false);
        }
    };

    const triggerRevalidate = (extra = {}) => {
        setConfirmStep(0);
        const effAccountId = extra.accountId !== undefined ? extra.accountId : selectedAccountId;
        const effMode = extra.mode !== undefined ? extra.mode : mode;
        const effOfferId = extra.offerId !== undefined ? extra.offerId : offerId;
        const baseOverrides = buildCurrentOverrides();
        const mergedOverrides = extra.overrides ? { ...baseOverrides, ...extra.overrides } : baseOverrides;
        onRevalidate({
            accountId: effAccountId,
            mode: effMode,
            offerId: effOfferId,
            categoryId: mergedOverrides.categoryId,
            overrides: mergedOverrides
        });
    };

    if (!isOpen || !validationResult) return null;

    const errors = validationResult.errors || [];
    const warnings = validationResult.warnings || [];
    const preview = validationResult.preview || {};
    const apiConnected = Boolean(validationResult.apiConnected);
    const canProceedStep1 = Boolean(
        apiConnected &&
        validationResult.canExport &&
        validationResult.exportToken &&
        validationResult.hasChanges &&
        errors.length === 0 &&
        !previewDirty &&
        !isValidating &&
        !isExporting
    );

    const envBadgeColor = validationResult.environment === 'stage'
        ? 'bg-amber-100 text-amber-800 border-amber-300'
        : 'bg-emerald-100 text-emerald-800 border-emerald-300';
    const wsName = activeWorkspace?.name || validationResult.workspace?.name || 'Domyślny';
    const wsColor = activeWorkspace?.badgeColor || validationResult.workspace?.badgeColor || '#4f46e5';
    const selectedAccountObj = accounts.find(a => a.id === selectedAccountId);
    const accountLabel = validationResult.account?.label || selectedAccountObj?.label || 'Domyślne konto Von Halsky';

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Nagłówek */}
                <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg bg-yellow-400 text-slate-950 flex items-center justify-center font-black text-sm shadow">
                            VH
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-black uppercase tracking-widest">
                                    Pre-flight: InPost Von Halsky API (v1.7.12)
                                </h3>
                                <span
                                    className="px-2 py-0.5 text-[10px] font-black uppercase rounded border text-white flex items-center gap-1.5"
                                    style={{ backgroundColor: `${wsColor}cc`, borderColor: wsColor }}
                                >
                                    <span className="w-2 h-2 rounded-full bg-white" />
                                    {wsName} → {accountLabel}
                                </span>
                                <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded border ${envBadgeColor}`}>
                                    {validationResult.environment === 'stage' ? 'STAGE' : 'PRODUCTION'}
                                </span>
                                <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded ${apiConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                    {apiConnected ? 'API POŁĄCZONE' : 'TRYB OFFLINE (BRAK KLUCZY)'}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {validationResult.httpMethod} {validationResult.mode === 'update' ? `Aktualizacja oferty (${validationResult.offer?.id})` : 'Nowa oferta'}
                                {validationResult.organizationId ? ` • Org: ${validationResult.organizationId}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Treść główna */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
                    {/* Pasek konta docelowego i klienta */}
                    <div
                        className="p-3.5 rounded-lg border-2 flex flex-wrap items-center justify-between gap-3 bg-white"
                        style={{ borderColor: wsColor }}
                    >
                        <div className="flex items-center gap-2 text-xs font-black text-slate-900">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: wsColor }} />
                            <span>KLIENT: <span className="uppercase">{wsName}</span> → KONTO VON HALSKY: <span className="uppercase text-amber-700">{accountLabel}</span></span>
                        </div>
                        {accounts.length > 0 && (
                            <select
                                value={selectedAccountId}
                                onChange={e => {
                                    const nextId = e.target.value;
                                    setSelectedAccountId(nextId);
                                    triggerRevalidate({ accountId: nextId });
                                }}
                                disabled={isValidating || isExporting}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold outline-none focus:border-amber-500"
                            >
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.label} ({String(acc.environment || 'production').toUpperCase()}){acc.isDefault ? ' [Dom.]' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Błędy blokujące */}
                    {errors.length > 0 && (
                        <div className="p-4 bg-rose-50 border border-rose-300 rounded-lg space-y-1.5">
                            <div className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center">
                                <ShieldAlert className="w-4 h-4 mr-2 shrink-0" />
                                Błędy blokujące eksport ({errors.length})
                            </div>
                            <ul className="list-disc list-inside text-xs text-rose-700 font-semibold space-y-1">
                                {errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Ostrzeżenia */}
                    {warnings.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                            <div className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center">
                                <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
                                Ostrzeżenia walidacji ({warnings.length})
                            </div>
                            <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5">
                                {warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Tryb operacji i oferta docelowa */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <Package className="w-4 h-4 mr-2 text-yellow-600" />
                                Tryb eksportu i powiązana oferta
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('create');
                                        setOfferId('');
                                        triggerRevalidate({ mode: 'create', offerId: '' });
                                    }}
                                    className={`px-3 py-1.5 rounded text-[10px] font-black uppercase border ${mode === 'create' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                >
                                    Nowa oferta (POST)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('update');
                                        markDirty();
                                    }}
                                    className={`px-3 py-1.5 rounded text-[10px] font-black uppercase border ${mode === 'update' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                >
                                    Aktualizacja (PATCH)
                                </button>
                            </div>
                        </div>

                        {mode === 'update' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                        Von Halsky Offer ID (UUID)
                                    </label>
                                    <input
                                        type="text"
                                        value={offerId}
                                        onChange={e => { setOfferId(e.target.value); markDirty(); }}
                                        placeholder="np. 4dc669aa-6de6-46ab-8d72-c3fe2a0f0710"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                        Zakres aktualizacji PATCH (merge-patch+json)
                                    </label>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {[
                                            ['includeTitle', 'Tytuł'],
                                            ['includeDescription', 'Opis'],
                                            ['includeImages', 'Zdjęcia'],
                                            ['includeAttributes', 'Atrybuty'],
                                            ['includePrice', 'Cena'],
                                            ['includeStock', 'Stan'],
                                            ['includeGpsr', 'GPSR'],
                                            ['includeDimensions', 'Wymiary'],
                                            ['includeShipping', 'Wysyłka']
                                        ].map(([k, lbl]) => (
                                            <label key={k} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(sections[k])}
                                                    onChange={e => {
                                                        setSections(prev => ({ ...prev, [k]: e.target.checked }));
                                                        markDirty();
                                                    }}
                                                />
                                                {lbl}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {Array.isArray(validationResult.matchedOffers) && validationResult.matchedOffers.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                                <div className="text-[10px] font-black uppercase text-slate-500 mb-1.5">
                                    Wykryte istniejące oferty w organizacji ({validationResult.matchedOffers.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {validationResult.matchedOffers.map(mo => (
                                        <button
                                            key={mo.id}
                                            type="button"
                                            onClick={() => {
                                                setMode('update');
                                                setOfferId(mo.id);
                                                triggerRevalidate({ mode: 'update', offerId: mo.id });
                                            }}
                                            className={`px-2.5 py-1.5 rounded text-left border text-[11px] transition-colors ${offerId === mo.id ? 'bg-indigo-50 border-indigo-400 text-indigo-900' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'}`}
                                        >
                                            <span className="font-black">{mo.status}</span> • {mo.name?.slice(0, 45)} <span className="font-mono text-[10px] text-slate-500">({mo.matchReason})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Kategoria Von Halsky + podpowiedzi hints */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <Layers className="w-4 h-4 mr-2 text-indigo-600" />
                                Kategoria Von Halsky (UUID liścia)
                            </div>
                            {preview.categoryName && (
                                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded">
                                    {preview.categoryName} {preview.categoryRequiresGpsr ? '• GPSR wymagane' : '• GPSR niewymagane'}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                    Category ID (UUID)
                                </label>
                                <input
                                    type="text"
                                    value={categoryId}
                                    onChange={e => { setCategoryId(e.target.value); markDirty(); }}
                                    placeholder="Wklej UUID kategorii lub wyszukaj obok..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                    Wyszukaj kategorię liść z API InPost
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={categorySearch}
                                        onChange={e => setCategorySearch(e.target.value)}
                                        placeholder="np. Mydła, Chemia, Kosmetyki..."
                                        disabled={!apiConnected}
                                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs disabled:opacity-50"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSearchCategories}
                                        disabled={!apiConnected || isSearchingCategories}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-black uppercase flex items-center disabled:opacity-50"
                                    >
                                        {isSearchingCategories ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                                        Szukaj
                                    </button>
                                </div>
                            </div>
                        </div>

                        {Array.isArray(validationResult.hints) && validationResult.hints.length > 0 && (
                            <div className="space-y-1">
                                <div className="text-[10px] font-black uppercase text-emerald-700">
                                    Podpowiedzi katalogu InPost (offers/hint):
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {validationResult.hints.map((h, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            disabled={!h.categoryId}
                                            onClick={() => {
                                                if (!h.categoryId) return;
                                                setCategoryId(h.categoryId);
                                                triggerRevalidate({ overrides: { categoryId: h.categoryId } });
                                            }}
                                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-[11px] text-emerald-900 font-semibold"
                                        >
                                            {h.brand ? `${h.brand} — ` : ''}{h.name?.slice(0, 50)} (kat: {h.categoryId?.slice(0, 8)}...)
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {categoryResults.length > 0 && (
                            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 bg-slate-50">
                                {categoryResults.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => {
                                            setCategoryId(cat.id);
                                            setCategoryResults([]);
                                            triggerRevalidate({ overrides: { categoryId: cat.id } });
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center justify-between text-xs"
                                    >
                                        <span className="font-semibold text-slate-800">{cat.path}</span>
                                        <span className="font-mono text-[10px] text-slate-500 ml-2 shrink-0">{cat.id.slice(0, 8)}...</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Dane podstawowe, cena, stan, wymiary */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                            <Tag className="w-4 h-4 mr-2 text-emerald-600" />
                            Tytuł, Cena, Stan, Wysyłka i Wymiary (mm / g)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-8">
                                <label className="text-[10px] font-black uppercase text-slate-500 flex justify-between mb-1">
                                    <span>Nazwa produktu (product.name)</span>
                                    <span className={name.length > 150 ? 'text-rose-600' : 'text-slate-400'}>{name.length}/150</span>
                                </label>
                                <input
                                    type="text"
                                    maxLength={150}
                                    value={name}
                                    onChange={e => { setName(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-bold"
                                />
                            </div>
                            <div className="md:col-span-4">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Marka (product.brand)</label>
                                <input
                                    type="text"
                                    maxLength={100}
                                    value={brand}
                                    onChange={e => { setBrand(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-bold"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Cena brutto (PLN)</label>
                                <input
                                    type="text"
                                    value={priceAmount}
                                    onChange={e => { setPriceAmount(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Stawka VAT</label>
                                <input
                                    type="text"
                                    value={taxRateInfo}
                                    onChange={e => { setTaxRateInfo(e.target.value); markDirty(); }}
                                    placeholder="23%"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Stan magazynowy</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="999999"
                                    value={stockQuantity}
                                    onChange={e => { setStockQuantity(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Jednostka stanu</label>
                                <select
                                    value={stockUnit}
                                    onChange={e => { setStockUnit(e.target.value); markDirty(); }}
                                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-bold"
                                >
                                    {STOCK_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Dni do wysyłki</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="60"
                                    value={daysToShip}
                                    onChange={e => { setDaysToShip(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Format opisu</label>
                                <select
                                    value={descriptionFormat}
                                    onChange={e => { setDescriptionFormat(e.target.value); markDirty(); }}
                                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded text-xs font-bold"
                                >
                                    <option value="html">Bezpieczny HTML</option>
                                    <option value="plain">Czysty tekst</option>
                                </select>
                            </div>

                            <div className="md:col-span-3">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Szerokość (mm)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={dimension.width}
                                    onChange={e => { setDimension(prev => ({ ...prev, width: e.target.value })); markDirty(); }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Wysokość (mm)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={dimension.height}
                                    onChange={e => { setDimension(prev => ({ ...prev, height: e.target.value })); markDirty(); }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Długość (mm)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={dimension.length}
                                    onChange={e => { setDimension(prev => ({ ...prev, length: e.target.value })); markDirty(); }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Waga z opak. (g)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000000"
                                    value={dimension.weight}
                                    onChange={e => { setDimension(prev => ({ ...prev, weight: e.target.value })); markDirty(); }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Atrybuty kategorii Von Halsky */}
                    {Array.isArray(preview.attributes) && preview.attributes.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    Atrybuty kategorii ({preview.requiredAttributesFilled || 0}/{preview.requiredAttributesTotal || 0} wymaganych)
                                </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded">
                                {preview.attributes.map(attr => {
                                    const currentVal = attributeOverrides[attr.id];
                                    const strVal = Array.isArray(currentVal) ? currentVal.join(', ') : (currentVal || '');
                                    return (
                                        <div key={attr.id} className="p-2.5 grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white hover:bg-slate-50">
                                            <div className="md:col-span-5">
                                                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                                    <span>{attr.name}</span>
                                                    {attr.required && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-rose-100 text-rose-700 rounded">Wymagany</span>
                                                    )}
                                                    <span className="text-[9px] font-mono text-slate-400">{attr.type}</span>
                                                    {attr.unit?.symbol && (
                                                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">[{attr.unit.symbol}]</span>
                                                    )}
                                                </div>
                                                {attr.warning && (
                                                    <div className="text-[10px] text-amber-700 font-semibold mt-0.5">{attr.warning}</div>
                                                )}
                                            </div>
                                            <div className="md:col-span-5">
                                                {attr.type === 'DICTIONARY' && !attr.multi && attr.options?.length > 0 ? (
                                                    <select
                                                        value={strVal}
                                                        onChange={e => {
                                                            setAttributeOverrides(prev => ({ ...prev, [attr.id]: e.target.value }));
                                                            markDirty();
                                                        }}
                                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold"
                                                    >
                                                        <option value="">-- wybierz z listy --</option>
                                                        {attr.options.map(opt => (
                                                            <option key={opt.id || opt.value} value={opt.value}>{opt.value}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={strVal}
                                                        onChange={e => {
                                                            setAttributeOverrides(prev => ({ ...prev, [attr.id]: e.target.value }));
                                                            markDirty();
                                                        }}
                                                        placeholder={attr.type === 'DICTIONARY' ? 'Wartości ze słownika oddzielone przecinkiem' : (attr.unit?.symbol ? `Wartość (${attr.unit.symbol})` : 'Wartość atrybutu...')}
                                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                                    />
                                                )}
                                            </div>
                                            <div className="md:col-span-2 text-right">
                                                <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                                                    attr.status === 'OK'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : (attr.required ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500')
                                                }`}>
                                                    {attr.status}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* GPSR */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <ShieldCheck className="w-4 h-4 mr-2 text-emerald-600" />
                                Zgodność GPSR (Producent, Osoba Odpowiedzialna UE, Ostrzeżenia)
                            </div>
                            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(gpsr.doesNotRequireGpsrInfo)}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, doesNotRequireGpsrInfo: e.target.checked }));
                                        markDirty();
                                    }}
                                />
                                Kategoria / produkt nie wymaga GPSR (`doesNotRequireGpsrInfo`)
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-4">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nazwa producenta *</label>
                                <input
                                    type="text"
                                    value={gpsr.manufacturer.name}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, manufacturer: { ...prev.manufacturer, name: e.target.value } }));
                                        markDirty();
                                    }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                            </div>
                            <div className="md:col-span-4">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">E-mail producenta * (wymagany w OpenAPI)</label>
                                <input
                                    type="email"
                                    value={gpsr.manufacturer.email}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, manufacturer: { ...prev.manufacturer, email: e.target.value } }));
                                        markDirty();
                                    }}
                                    placeholder="np. gpsr@producent.eu"
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Telefon (+48...)</label>
                                <input
                                    type="text"
                                    value={gpsr.manufacturer.phone}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, manufacturer: { ...prev.manufacturer, phone: e.target.value } }));
                                        markDirty();
                                    }}
                                    placeholder="+48123456789"
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Kraj (ISO-2)</label>
                                <input
                                    type="text"
                                    maxLength={2}
                                    value={gpsr.manufacturer.countryCode}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, manufacturer: { ...prev.manufacturer, countryCode: e.target.value.toUpperCase() } }));
                                        markDirty();
                                    }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono uppercase"
                                />
                            </div>
                            <div className="md:col-span-12">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                    Adres pocztowy producenta (`unstructuredAddress`, max 300 zn.)
                                </label>
                                <input
                                    type="text"
                                    maxLength={300}
                                    value={gpsr.manufacturer.unstructuredAddress}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, manufacturer: { ...prev.manufacturer, unstructuredAddress: e.target.value } }));
                                        markDirty();
                                    }}
                                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                            </div>
                            <div className="md:col-span-12">
                                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                    Ostrzeżenia i informacje o bezpieczeństwie (`gpsr.safetyInformation`)
                                </label>
                                <textarea
                                    rows={3}
                                    value={gpsr.safetyInformation}
                                    onChange={e => {
                                        setGpsr(prev => ({ ...prev, safetyInformation: e.target.value }));
                                        markDirty();
                                    }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                            </div>
                        </div>

                        <details className="pt-1">
                            <summary className="text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                                Osoba / Podmiot Odpowiedzialny w UE (`responsiblePersonDetails` — opcjonalne)
                            </summary>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 mt-2">
                                <input
                                    type="text"
                                    placeholder="Nazwa podmiotu odpowiedzialnego UE"
                                    value={gpsr.manufacturer.responsiblePersonDetails.name}
                                    onChange={e => {
                                        setGpsr(prev => ({
                                            ...prev,
                                            manufacturer: {
                                                ...prev.manufacturer,
                                                responsiblePersonDetails: { ...prev.manufacturer.responsiblePersonDetails, name: e.target.value }
                                            }
                                        }));
                                        markDirty();
                                    }}
                                    className="md:col-span-4 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                                <input
                                    type="email"
                                    placeholder="E-mail podmiotu UE"
                                    value={gpsr.manufacturer.responsiblePersonDetails.email}
                                    onChange={e => {
                                        setGpsr(prev => ({
                                            ...prev,
                                            manufacturer: {
                                                ...prev.manufacturer,
                                                responsiblePersonDetails: { ...prev.manufacturer.responsiblePersonDetails, email: e.target.value }
                                            }
                                        }));
                                        markDirty();
                                    }}
                                    className="md:col-span-4 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                                <input
                                    type="text"
                                    placeholder="Adres UE (max 300 zn.)"
                                    maxLength={300}
                                    value={gpsr.manufacturer.responsiblePersonDetails.unstructuredAddress}
                                    onChange={e => {
                                        setGpsr(prev => ({
                                            ...prev,
                                            manufacturer: {
                                                ...prev.manufacturer,
                                                responsiblePersonDetails: { ...prev.manufacturer.responsiblePersonDetails, unstructuredAddress: e.target.value }
                                            }
                                        }));
                                        markDirty();
                                    }}
                                    className="md:col-span-4 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs"
                                />
                            </div>
                        </details>
                    </div>

                    {/* Zdjęcia */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <Image className="w-4 h-4 mr-2 text-indigo-600" />
                                Zdjęcia oferty ({(preview.images || []).length}/20 — HTTPS: {preview.httpsImagesCount || 0}, Binarny upload: {preview.binaryAttachmentsCount || 0})
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                            {(preview.images || []).map(img => (
                                <div key={`${img.priority}-${img.fileName}`} className="border border-slate-200 rounded p-2 bg-slate-50 flex flex-col items-center">
                                    <div className="w-full aspect-square bg-white border border-slate-100 rounded overflow-hidden flex items-center justify-center mb-1.5">
                                        <img
                                            src={getSafeImageSrc ? getSafeImageSrc(img.source) : img.source}
                                            alt={img.fileName}
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    </div>
                                    <div className="text-[9px] font-black uppercase text-slate-700">#{img.priority}</div>
                                    <span className={`mt-0.5 px-1.5 py-0.5 text-[8px] font-black uppercase rounded ${img.transport === 'HTTPS_URL' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {img.transport === 'HTTPS_URL' ? 'HTTPS URL' : 'UPLOAD /attachments'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Podgląd opisu i JSON */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                        <details>
                            <summary className="text-xs font-black text-slate-700 uppercase tracking-wider cursor-pointer">
                                Podgląd opisu ({preview.descriptionLength || 0} zn., tryb: {preview.descriptionFormat || 'html'}, sekcji: {preview.descriptionSectionsCount || 0})
                            </summary>
                            {preview.descriptionFormat === 'html' ? (
                                <div
                                    className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-xs prose prose-sm max-w-none max-h-60 overflow-y-auto"
                                    dangerouslySetInnerHTML={{ __html: preview.description || '' }}
                                />
                            ) : (
                                <pre className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-xs whitespace-pre-wrap max-h-60 overflow-y-auto font-sans">
                                    {preview.description || ''}
                                </pre>
                            )}
                        </details>
                        <details>
                            <summary className="text-xs font-black text-slate-500 uppercase tracking-wider cursor-pointer">
                                Podgląd techniczny ładunku JSON ({validationResult.httpMethod} • {validationResult.contentType})
                            </summary>
                            <pre className="mt-2 p-3 bg-slate-950 text-emerald-300 rounded text-[11px] overflow-x-auto max-h-64">
                                {JSON.stringify(validationResult.payloadPreview || {}, null, 2)}
                            </pre>
                        </details>
                    </div>
                </div>

                {/* Panel 2. kroku dwukrotnego potwierdzenia */}
                {confirmStep === 1 && canProceedStep1 && (
                    <div className="px-6 py-4 bg-amber-50 border-t-2 border-amber-400 flex flex-wrap items-center justify-between gap-4 shrink-0">
                        <div className="space-y-1 max-w-2xl">
                            <div
                                className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-black uppercase tracking-wider text-white shadow-sm"
                                style={{ backgroundColor: wsColor }}
                            >
                                KLIENT: {wsName} → KONTO: {accountLabel}
                            </div>
                            <div className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center">
                                <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />
                                Drugie (ostateczne) potwierdzenie wysyłki do InPost Von Halsky (Krok 2/2)
                            </div>
                            <p className="text-xs text-amber-800 font-semibold">
                                Operacja: <strong>{validationResult.httpMethod}</strong> ({validationResult.mode === 'update' ? `aktualizacja oferty ${validationResult.offer?.id}` : 'utworzenie nowej oferty'}) na środowisku <strong>{String(validationResult.environment || 'production').toUpperCase()}</strong> • Cena: <strong>{preview.priceAmount} {preview.currency}</strong> (VAT {preview.taxRateInfo}) • Stan: <strong>{preview.stockQuantity} {preview.stockUnit}</strong> • Zdjęcia: <strong>{(preview.images || []).length}</strong>.
                            </p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                type="button"
                                onClick={() => setConfirmStep(0)}
                                disabled={isExporting}
                                className="px-4 py-2 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-md font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                            >
                                Wróć
                            </button>
                            <button
                                type="button"
                                onClick={() => onConfirmExport({
                                    accountId: selectedAccountId || validationResult.account?.id || '',
                                    mode: validationResult.mode,
                                    offerId: validationResult.offer?.id || '',
                                    categoryId: preview.categoryId || categoryId.trim(),
                                    overrides: buildCurrentOverrides(),
                                    exportToken: validationResult.exportToken,
                                    confirmedTwice: true
                                })}
                                disabled={isExporting}
                                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-black text-xs uppercase tracking-widest flex items-center shadow-lg disabled:opacity-50"
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                Tak, potwierdzam po raz drugi — Wyślij do Von Halsky
                            </button>
                        </div>
                    </div>
                )}

                {/* Stopka główna */}
                <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div className="text-xs text-slate-500 font-semibold">
                        {previewDirty
                            ? 'Zmieniono parametry w modalu — przelicz Pre-flight przed potwierdzeniem wysyłki.'
                            : 'Wysyłka do API InPost Von Halsky wymaga dwukrotnego potwierdzenia operatora.'}
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isExporting}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                            Zamknij
                        </button>
                        <button
                            type="button"
                            onClick={() => triggerRevalidate()}
                            disabled={isValidating || isExporting}
                            className={`px-4 py-2 rounded-md font-black text-xs uppercase tracking-widest flex items-center shadow-sm disabled:opacity-50 ${
                                previewDirty ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                            }`}
                        >
                            {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Przelicz Pre-flight
                        </button>
                        {confirmStep === 0 && (
                            <button
                                type="button"
                                onClick={() => setConfirmStep(1)}
                                disabled={!canProceedStep1}
                                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 rounded-md font-black text-xs uppercase tracking-widest flex items-center shadow-md disabled:opacity-40"
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Potwierdź dane (Krok 1/2)
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VonHalskyExportModal;
