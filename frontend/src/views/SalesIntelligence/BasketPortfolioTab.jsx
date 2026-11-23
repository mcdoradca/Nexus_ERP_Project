import React, { useState, useMemo } from 'react';
import { Layers, Link2, ArrowLeftRight, Search, ExternalLink } from 'lucide-react';
import { fmtPln, fmtInt, fmtNum, fmtPct, ROLE_META } from './formatters';

export default function BasketPortfolioTab({ analysis, onSelectSku, onOpenProduct }) {
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [skuSearch, setSkuSearch] = useState('');

    const kpis = analysis?.kpis || {};
    const smartThreshold = metaOrDefault(analysis?.meta?.smartThresholdPln, 49.90);

    const filteredSkus = useMemo(() => {
        const q = skuSearch.trim().toLowerCase();
        return (analysis?.skus || []).filter(s => {
            if (roleFilter !== 'ALL' && s.role !== roleFilter) return false;
            if (q) {
                const hay = `${s.sku || ''} ${s.ean || ''} ${s.name || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [analysis, roleFilter, skuSearch]);

    return (
        <div className="space-y-6">
            {/* Statystyki koszykowe */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Kotwice vs Dopełniacze</div>
                    <div className="mt-2 text-2xl font-bold text-indigo-700">{fmtInt(kpis.anchorsCount)} / {fmtInt(kpis.fillersCount)}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Produkty otwierające koszyki 2+ vs doczepiane</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Udział Koszyków 2+</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{fmtPct(kpis.multiOrdersSharePct)}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{fmtInt(kpis.multiOrdersCount)} zamówień wielopozycyjnych</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Śr. Koszyk 2+ vs Solo</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-700">{fmtPln(kpis.avgBasketMultiPln)}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Koszyk 1-sztukowy: {fmtPln(kpis.avgBasketSoloPln)}</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Cross-Sell Wygenerowany</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{fmtPln(kpis.crossSellTotalPln)}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Obrót sąsiednich produktów przy Kotwicach</div>
                </div>
            </div>

            {/* Pary Koszykowe (Market Basket Analysis + Smart! 49,90 zł) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-indigo-600" />
                        Pary Koszykowe & Zestawy pod Próg Smart! ({fmtNum(smartThreshold, 2)} zł)
                    </h3>
                    <p className="text-xs text-slate-500">
                        Współczynnik Lift &ge; 1.5 oznacza silną synergię zakupową — idealny kandydat na Zestaw Kup Razem lub pakiet pod darmową dostawę Smart!
                    </p>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
                    <table className="min-w-full text-xs divide-y divide-slate-200">
                        <thead className="bg-slate-50 sticky top-0 text-slate-700 font-semibold">
                            <tr>
                                <th className="px-3 py-2 text-left">Produkt A (Główny)</th>
                                <th className="px-3 py-2 text-left">Produkt B (Współkupowany)</th>
                                <th className="px-2 py-2 text-right">Wspólne zam.</th>
                                <th className="px-2 py-2 text-right">Confidence</th>
                                <th className="px-2 py-2 text-right">Lift</th>
                                <th className="px-2 py-2 text-right">Śr. koszyk</th>
                                <th className="px-3 py-2 text-left">Rekomendacja</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(analysis?.pairs || []).map((p, idx) => (
                                <tr key={`${p.skuKeyA}-${p.skuKeyB}-${idx}`} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 max-w-[220px]">
                                        <button type="button" onClick={() => onSelectSku(p.skuKeyA)} className="font-semibold text-slate-900 hover:text-indigo-600 truncate block text-left">
                                            {p.nameA}
                                        </button>
                                        <div className="text-[11px] font-mono text-slate-500">{p.skuKeyA}</div>
                                    </td>
                                    <td className="px-3 py-2 max-w-[220px]">
                                        <button type="button" onClick={() => onSelectSku(p.skuKeyB)} className="font-semibold text-slate-900 hover:text-indigo-600 truncate block text-left">
                                            {p.nameB}
                                        </button>
                                        <div className="text-[11px] font-mono text-slate-500">{p.skuKeyB}</div>
                                    </td>
                                    <td className="px-2 py-2 text-right font-bold">{fmtInt(p.coCount)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPct(p.confidencePct)}</td>
                                    <td className="px-2 py-2 text-right font-mono">
                                        <span className={`px-1.5 py-0.5 rounded font-bold ${p.lift >= 1.5 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>
                                            {fmtNum(p.lift, 2)}x
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 text-right font-semibold">{fmtPln(p.avgBasketPln)}</td>
                                    <td className="px-3 py-2 text-[11px] text-slate-700">{p.recommendation}</td>
                                </tr>
                            ))}
                            {(analysis?.pairs || []).length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-6 text-center text-slate-500">
                                        Za mało wielopozycyjnych zamówień do wyznaczenia istotnych par koszykowych.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Luki Cross-Channel Allegro <-> InPost Von Halsky */}
            <div className="bg-white rounded-xl border border-sky-200 p-4 shadow-sm">
                <div className="mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4 text-sky-600" />
                        Luki Ekspansji Cross-Channel (Allegro &rarr; InPost Von Halsky)
                    </h3>
                    <p className="text-xs text-slate-500">
                        Bestsellery generujące obrót na Allegro (&ge; 300 PLN), których brakuje lub które są odrzucone na InPost Von Halsky.
                    </p>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 rounded-lg">
                    <table className="min-w-full text-xs divide-y divide-slate-200">
                        <thead className="bg-sky-50/60 sticky top-0 text-slate-700 font-semibold">
                            <tr>
                                <th className="px-3 py-2 text-left">SKU / Produkt</th>
                                <th className="px-2 py-2 text-right">Obrót Allegro</th>
                                <th className="px-2 py-2 text-right">Stan</th>
                                <th className="px-2 py-2 text-center">Status Von Halsky</th>
                                <th className="px-3 py-2 text-left">Diagnoza luki</th>
                                <th className="px-2 py-2 text-right">Szac. potencjał/mc</th>
                                <th className="px-2 py-2 text-center">Akcja</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(analysis?.crossChannelGaps || []).map(g => (
                                <tr key={g.sku} className="hover:bg-sky-50/30">
                                    <td className="px-3 py-2">
                                        <button type="button" onClick={() => onSelectSku(g.sku)} className="font-semibold text-slate-900 hover:text-indigo-600 text-left">
                                            {g.name}
                                        </button>
                                        <div className="text-[11px] font-mono text-slate-500">{g.sku}</div>
                                    </td>
                                    <td className="px-2 py-2 text-right font-semibold">{fmtPln(g.allegroRevenuePln)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{g.currentStock ?? '—'}</td>
                                    <td className="px-2 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${g.vonHalskyStatus === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                                            {g.vonHalskyStatus}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-700">{g.gapReason}</td>
                                    <td className="px-2 py-2 text-right font-bold text-emerald-700">{fmtPln(g.estimatedMonthlyOpportunityPln)}</td>
                                    <td className="px-2 py-2 text-center">
                                        {g.pimProductId && onOpenProduct && (
                                            <button
                                                type="button"
                                                onClick={() => onOpenProduct(g.pimProductId)}
                                                className="px-2 py-1 text-[11px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded inline-flex items-center gap-1"
                                            >
                                                <ExternalLink className="w-3 h-3" /> Wystaw / Napraw
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(analysis?.crossChannelGaps || []).length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-6 text-center text-slate-500">
                                        Brak wykrytych luk między Allegro a InPost Von Halsky.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Rola każdego SKU w portfelu */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        Klasyfikacja Portfela SKU (Kotwice / Dopełniacze / Soliści)
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Filtruj SKU / nazwę..."
                                value={skuSearch}
                                onChange={e => setSkuSearch(e.target.value)}
                                className="text-xs border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 w-48"
                            />
                        </div>
                        <select
                            value={roleFilter}
                            onChange={e => setRoleFilter(e.target.value)}
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                        >
                            <option value="ALL">Wszystkie role</option>
                            <option value="ANCHOR">Tylko Kotwice</option>
                            <option value="FILLER">Tylko Dopełniacze</option>
                            <option value="SOLO">Tylko Soliści</option>
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-100 rounded-lg">
                    <table className="min-w-full text-xs divide-y divide-slate-200">
                        <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold">
                            <tr>
                                <th className="px-3 py-2 text-left">SKU / Nazwa</th>
                                <th className="px-2 py-2 text-center">Rola</th>
                                <th className="px-2 py-2 text-right">Zamówienia (2+)</th>
                                <th className="px-2 py-2 text-right">Udział 2+</th>
                                <th className="px-2 py-2 text-right">Śr. cena</th>
                                <th className="px-2 py-2 text-right">Obrót własny</th>
                                <th className="px-2 py-2 text-right">Wygenerowany Cross-Sell</th>
                                <th className="px-2 py-2 text-right">Solo &lt; Smart!</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredSkus.slice(0, 200).map(s => {
                                const rm = ROLE_META[s.role] || ROLE_META.SOLO;
                                return (
                                    <tr key={s.skuKey} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 max-w-[260px]">
                                            <button type="button" onClick={() => onSelectSku(s.sku)} className="font-semibold text-slate-900 hover:text-indigo-600 truncate block text-left">
                                                {s.name}
                                            </button>
                                            <div className="text-[11px] font-mono text-slate-500">{s.sku}</div>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${rm.badgeClass}`}>{rm.label}</span>
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono">{s.ordersCount} ({s.multiOrdersCount})</td>
                                        <td className="px-2 py-2 text-right font-mono">{fmtPct((s.avgMultiShare || 0) * 100)}</td>
                                        <td className="px-2 py-2 text-right font-mono">{fmtPln(s.avgPricePln)}</td>
                                        <td className="px-2 py-2 text-right font-semibold">{fmtPln(s.totalRevenuePln)}</td>
                                        <td className="px-2 py-2 text-right font-semibold text-indigo-700">{fmtPln(s.crossSellGeneratedPln)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-amber-700">{s.soloUnderSmartCount}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function metaOrDefault(val, def) {
    return Number.isFinite(Number(val)) && Number(val) > 0 ? Number(val) : def;
}
