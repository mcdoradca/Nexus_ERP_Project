import React, { useState, useMemo } from 'react';
import { PackageCheck, PackageX, Boxes, Clock, Search, ExternalLink } from 'lucide-react';
import { fmtPln, fmtInt, fmtNum, ROLE_META } from './formatters';
import MetricTooltip from './MetricTooltip';
import SortableTh from './SortableTh';
import { METRIC_TOOLTIPS } from './metricTooltips';
import { useSortableData } from './useSortableData';

const ROP_ACCESSORS = {
    name: (s) => s.name || s.sku || '',
    roleAbc: (s) => `${s.role || 'SOLO'} ${s.abcXyz || 'CZ'}`,
    currentStock: (s) => s.currentStock,
    sellableStock: (s) => s.sellableStock,
    openPoQty: (s) => Number(s.openPoQty || 0),
    dailyVelocityWhenActive: (s) => Number(s.dailyVelocityWhenActive || 0),
    daysOfInventory: (s) => s.daysOfInventory,
    recommendedRop: (s) => Number(s.recommendedRop || 0),
    recommendedOrderQty: (s) => Number(s.recommendedOrderQty || 0),
    purchaseBudgetPln: (s) => s.purchaseBudgetPln,
    stockoutDays: (s) => Number(s.stockoutDays || 0),
    totalLostGmvPln: (s) => Number(s.totalLostGmvPln || 0),
    defaultPriority: (s) => (s.isCurrentlyUnavailable ? 1e12 : 0) + (s.recommendedOrderQty > 0 ? 1e9 : 0) + Number(s.totalLostGmvPln || 0)
};

const DEAD_STOCK_ACCESSORS = {
    name: (d) => d.name || d.sku || '',
    currentStock: (d) => Number(d.currentStock || 0),
    daysSinceLastSale: (d) => Number(d.daysSinceLastSale || 0),
    daysOfInventory: (d) => d.daysOfInventory,
    frozenCapitalPln: (d) => d.frozenCapitalPln,
    recommendedAction: (d) => d.recommendedAction || ''
};

export default function InventoryProcurementTab({ analysis, onSelectSku, onOpenProduct }) {
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [abcFilter, setAbcFilter] = useState('ALL');

    const meta = analysis?.meta || {};
    const kpis = analysis?.kpis || {};
    const threshold = meta.stockoutThreshold ?? 2;

    const filteredProcurementSkus = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        return (analysis?.skus || []).filter(s => {
            if (statusFilter === 'UNAVAILABLE' && !s.isCurrentlyUnavailable) return false;
            if (statusFilter === 'NEED_ORDER' && !(s.recommendedOrderQty > 0)) return false;
            if (statusFilter === 'WITH_OUTAGES' && !(s.stockoutDays > 0)) return false;
            if (abcFilter !== 'ALL' && s.abcClass !== abcFilter) return false;
            if (q) {
                const hay = `${s.sku || ''} ${s.ean || ''} ${s.name || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [analysis, searchText, statusFilter, abcFilter]);

    const { sortedItems: procurementSkus, sortConfig: ropSort, requestSort: requestRopSort } = useSortableData(
        filteredProcurementSkus,
        { key: 'defaultPriority', direction: 'desc' },
        ROP_ACCESSORS
    );

    const { sortedItems: sortedDeadStock, sortConfig: deadSort, requestSort: requestDeadSort } = useSortableData(
        analysis?.deadStockItems || [],
        { key: 'frozenCapitalPln', direction: 'desc' },
        DEAD_STOCK_ACCESSORS
    );

    const abcSummary = useMemo(() => {
        const map = { AX: 0, AY: 0, AZ: 0, BX: 0, BY: 0, BZ: 0, CX: 0, CY: 0, CZ: 0 };
        for (const s of (analysis?.skus || [])) {
            if (map[s.abcXyz] !== undefined) map[s.abcXyz]++;
        }
        return map;
    }, [analysis]);

    return (
        <div className="space-y-6">
            {/* Jednolity Próg Wyłączenia & Podsumowanie ROP */}
            <div className="bg-slate-900 text-white rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">
                        Jednolita Reguła Wyłączania Ofert (stan ≤ {threshold} szt. = BRAK W OFERCIE)
                    </div>
                    <h3 className="text-lg font-bold mt-1">
                        Zapas poniżej lub równy {threshold} szt. wyłącza aukcje i jest liczony jako 0 szt. sprzedażowych
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                        Zapas sprzedażowy (DOI) i punkt domówienia ROP odejmują próg bezpieczeństwa ({threshold} szt.) oraz uwzględniają otwarte dostawy PO w drodze.
                    </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                    <div className="bg-white/10 rounded-lg px-3 py-2">
                        <div className="text-[11px] text-slate-300"><MetricTooltip text={METRIC_TOOLTIPS.filterStockoutThreshold}><span>Zablokowane teraz</span></MetricTooltip></div>
                        <div className="text-lg font-bold text-rose-300">{fmtInt(kpis.unavailableNowCount)} SKU</div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-3 py-2">
                        <div className="text-[11px] text-slate-300"><MetricTooltip text={METRIC_TOOLTIPS.colStockoutDays}><span>Łączne dni braku</span></MetricTooltip></div>
                        <div className="text-lg font-bold">{fmtInt(kpis.totalStockoutDays)} d</div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-3 py-2">
                        <div className="text-[11px] text-slate-300"><MetricTooltip text={METRIC_TOOLTIPS.kpiLostByStockout}><span>Strata 3-częściowa</span></MetricTooltip></div>
                        <div className="text-lg font-bold text-amber-300">{fmtPln(kpis.totalLostGmvPln)}</div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-3 py-2">
                        <div className="text-[11px] text-slate-300"><MetricTooltip text={METRIC_TOOLTIPS.kpiRopBudget}><span>Budżet zakupu ROP</span></MetricTooltip></div>
                        <div className="text-lg font-bold text-emerald-300">{fmtPln(kpis.recommendedPurchaseBudgetPln)}</div>
                    </div>
                </div>
            </div>

            {/* Planer Zatowarowania Min-Max ROP */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-indigo-600" />
                            Planer Zatowarowania ROP &amp; Analiza Przerw w Dostępności
                        </h3>
                        <p className="text-xs text-slate-500">
                            Lead Time: {meta.leadTimeDays || 14} dni • Bufor bezpieczeństwa: {Math.round((meta.safetyBufferPct || 0.25) * 100)}% (+10 pp dla Kotwic) • Kliknij dowolny nagłówek kolumny, aby posortować
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Szukaj SKU / EAN / nazwy..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="text-xs border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 w-56"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                        >
                            <option value="ALL">Wszystkie ({(analysis?.skus || []).length})</option>
                            <option value="UNAVAILABLE">Tylko BRAK W OFERCIE (≤ {threshold} szt.)</option>
                            <option value="NEED_ORDER">Wymaga domówienia ROP</option>
                            <option value="WITH_OUTAGES">Miało braki w historii</option>
                        </select>
                        <select
                            value={abcFilter}
                            onChange={e => setAbcFilter(e.target.value)}
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                        >
                            <option value="ALL">ABC: Wszystkie</option>
                            <option value="A">Klasa A (80% obrotu)</option>
                            <option value="B">Klasa B (15% obrotu)</option>
                            <option value="C">Klasa C (5% obrotu)</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-slate-100 rounded-lg">
                    <table className="min-w-full text-xs divide-y divide-slate-200">
                        <thead className="bg-slate-50 sticky top-0 z-10 text-slate-600 font-semibold">
                            <tr>
                                <SortableTh label="Produkt / SKU" sortKey="name" defaultDirection="asc" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colProductSku} className="px-3 py-2" />
                                <SortableTh label="Rola / ABC" sortKey="roleAbc" defaultDirection="asc" align="center" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colRoleAbc} className="px-2 py-2" />
                                <SortableTh label="Stan fiz." sortKey="currentStock" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colPhysicalStock} className="px-2 py-2" />
                                <SortableTh label="Zapas sprzed." sortKey="sellableStock" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colSellableStock} className="px-2 py-2" />
                                <SortableTh label="PO w drodze" sortKey="openPoQty" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colOpenPo} className="px-2 py-2" />
                                <SortableTh label="Tempo/d" sortKey="dailyVelocityWhenActive" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colDailyVelocity} className="px-2 py-2" />
                                <SortableTh label="DOI (dni)" sortKey="daysOfInventory" defaultDirection="asc" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colDoi} className="px-2 py-2" />
                                <SortableTh label="ROP" sortKey="recommendedRop" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colRop} className="px-2 py-2" />
                                <SortableTh label="Domów (szt.)" sortKey="recommendedOrderQty" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colSuggestedOrder} className="px-2 py-2" />
                                <SortableTh label="Budżet PLN" sortKey="purchaseBudgetPln" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colPurchaseBudget} className="px-2 py-2" />
                                <SortableTh label="Dni braku" sortKey="stockoutDays" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colStockoutDays} className="px-2 py-2" />
                                <SortableTh label="Utracony GMV" sortKey="totalLostGmvPln" align="right" sortConfig={ropSort} onSort={requestRopSort} tooltip={METRIC_TOOLTIPS.colLostTotalGmv} className="px-2 py-2" />
                                <th className="px-2 py-2 text-center">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {procurementSkus.slice(0, 250).map(s => {
                                const roleInfo = ROLE_META[s.role] || ROLE_META.SOLO;
                                return (
                                    <tr key={s.skuKey} className={s.isCurrentlyUnavailable ? 'bg-rose-50/40' : 'hover:bg-slate-50'}>
                                        <td className="px-3 py-2 max-w-[260px]">
                                            <div className="flex items-center gap-1.5">
                                                {s.isCurrentlyUnavailable && (
                                                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold shrink-0">
                                                        BRAK ≤{threshold}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectSku(s.sku)}
                                                    className="font-semibold text-slate-900 hover:text-indigo-600 truncate text-left"
                                                    title={s.name}
                                                >
                                                    {s.name}
                                                </button>
                                            </div>
                                            <div className="text-[11px] font-mono text-slate-500">
                                                {s.sku}{s.ean ? ` • ${s.ean}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${roleInfo.badgeClass}`}>
                                                {s.role}
                                            </span>
                                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">{s.abcXyz}</div>
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono font-semibold">{s.currentStock ?? '—'}</td>
                                        <td className="px-2 py-2 text-right font-mono">
                                            <span className={s.isCurrentlyUnavailable ? 'text-rose-700 font-bold' : 'text-slate-700'}>
                                                {s.sellableStock ?? '—'}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono text-sky-700">{s.openPoQty > 0 ? `+${s.openPoQty}` : '0'}</td>
                                        <td className="px-2 py-2 text-right font-mono">{fmtNum(s.dailyVelocityWhenActive, 2)}</td>
                                        <td className="px-2 py-2 text-right font-mono">{s.daysOfInventory !== null ? fmtNum(s.daysOfInventory, 1) : '—'}</td>
                                        <td className="px-2 py-2 text-right font-mono">{s.recommendedRop}</td>
                                        <td className="px-2 py-2 text-right font-mono">
                                            {s.recommendedOrderQty > 0 ? (
                                                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">{s.recommendedOrderQty}</span>
                                            ) : '0'}
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono">{s.purchaseBudgetPln ? fmtPln(s.purchaseBudgetPln) : 'Brak COGS'}</td>
                                        <td className="px-2 py-2 text-right font-mono text-rose-700">{s.stockoutDays}</td>
                                        <td className="px-2 py-2 text-right font-semibold text-rose-700">{fmtPln(s.totalLostGmvPln)}</td>
                                        <td className="px-2 py-2 text-center">
                                            {s.pimProductId && onOpenProduct && (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenProduct(s.pimProductId)}
                                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                                    title="Otwórz w Offer Optimizer"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {procurementSkus.length > 250 && (
                    <div className="mt-2 text-[11px] text-slate-500">
                        Widok roboczy wyświetla pierwsze 250 pozycji z {procurementSkus.length}. Pełne 100% pozycji znajduje się w eksporcie .XLSX / .CSV oraz Raporcie Zarządu.
                    </div>
                )}
            </div>

            {/* Macierz ABC-XYZ & Leżaki Magazynowe */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                        <Boxes className="w-4 h-4 text-indigo-600" />
                        <MetricTooltip text={METRIC_TOOLTIPS.colRoleAbc}><span>Macierz Portfela ABC-XYZ</span></MetricTooltip>
                    </h3>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'].map(cell => (
                            <div key={cell} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                                <div className="font-bold text-slate-800">{cell}</div>
                                <div className="text-lg font-bold text-indigo-700 mt-1">{abcSummary[cell]}</div>
                                <div className="text-[10px] text-slate-500">SKU</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3">
                        A/B/C = udział w przychodzie (80/15/5%). X/Y/Z = stabilność popytu tydzień do tygodnia (CV).
                    </p>
                </div>

                <div className="lg:col-span-2 bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-600" />
                                <MetricTooltip text={METRIC_TOOLTIPS.colFrozenCapital}>
                                    <span>Leżaki Magazynowe (Zamrożony Kapitał: {fmtPln(kpis.deadStockFrozenPln)})</span>
                                </MetricTooltip>
                            </h3>
                            <p className="text-xs text-slate-500">Produkty o zerowej lub minimalnej rotacji (&ge; 60 dni bez sprzedaży lub DOI &gt; 150 dni)</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
                            {fmtInt(sortedDeadStock.length)} pozycji
                        </span>
                    </div>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="min-w-full text-xs divide-y divide-slate-200">
                            <thead className="bg-amber-50/70 text-slate-700 font-semibold sticky top-0">
                                <tr>
                                    <SortableTh label="SKU / Nazwa" sortKey="name" defaultDirection="asc" sortConfig={deadSort} onSort={requestDeadSort} tooltip={METRIC_TOOLTIPS.colProductSku} className="px-3 py-2" />
                                    <SortableTh label="Stan" sortKey="currentStock" align="right" sortConfig={deadSort} onSort={requestDeadSort} tooltip={METRIC_TOOLTIPS.colPhysicalStock} className="px-2 py-2" />
                                    <SortableTh label="Dni bez sprz." sortKey="daysSinceLastSale" align="right" sortConfig={deadSort} onSort={requestDeadSort} tooltip={METRIC_TOOLTIPS.colDaysSinceLastSale} className="px-2 py-2" />
                                    <SortableTh label="DOI" sortKey="daysOfInventory" align="right" sortConfig={deadSort} onSort={requestDeadSort} tooltip={METRIC_TOOLTIPS.colDoi} className="px-2 py-2" />
                                    <SortableTh label="Zamrożone COGS" sortKey="frozenCapitalPln" align="right" sortConfig={deadSort} onSort={requestDeadSort} tooltip={METRIC_TOOLTIPS.colFrozenCapital} className="px-2 py-2" />
                                    <SortableTh label="Rekomendacja" sortKey="recommendedAction" defaultDirection="asc" sortConfig={deadSort} onSort={requestDeadSort} tooltip={METRIC_TOOLTIPS.colDeadStockAction} className="px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedDeadStock.slice(0, 120).map(d => (
                                    <tr key={d.sku} className="hover:bg-amber-50/30">
                                        <td className="px-3 py-2">
                                            <button type="button" onClick={() => onSelectSku(d.sku)} className="font-semibold text-slate-900 hover:text-indigo-600 text-left">
                                                {d.name}
                                            </button>
                                            <div className="text-[11px] font-mono text-slate-500">{d.sku}</div>
                                        </td>
                                        <td className="px-2 py-2 text-right font-mono">{d.currentStock}</td>
                                        <td className="px-2 py-2 text-right font-mono text-amber-800">{d.daysSinceLastSale} d</td>
                                        <td className="px-2 py-2 text-right font-mono">{d.daysOfInventory !== null ? `${fmtNum(d.daysOfInventory, 0)} d` : '∞'}</td>
                                        <td className="px-2 py-2 text-right font-semibold">{d.frozenCapitalPln !== null ? fmtPln(d.frozenCapitalPln) : 'Brak COGS'}</td>
                                        <td className="px-2 py-2">
                                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">{d.recommendedAction}</span>
                                        </td>
                                    </tr>
                                ))}
                                {sortedDeadStock.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-6 text-center text-slate-500">
                                            <PackageX className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                                            Brak leżaków magazynowych spełniających kryterium.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
