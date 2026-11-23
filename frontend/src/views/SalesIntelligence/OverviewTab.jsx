import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, Cell, ComposedChart, Line, Legend
} from 'recharts';
import {
    TrendingUp, AlertTriangle, DollarSign, ShoppingBag, PackageX,
    Sparkles, ArrowUpRight, ArrowDownRight, ExternalLink, Search, ArrowUp, ArrowDown
} from 'lucide-react';
import { fmtPln, fmtInt, fmtNum, fmtPct, SEVERITY_META } from './formatters';
import MetricTooltip from './MetricTooltip';
import { METRIC_TOOLTIPS } from './metricTooltips';
import { useSortableData } from './useSortableData';

const SEVERITY_RANK = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };

const QUEUE_ACCESSORS = {
    priorityImpact: (item) => (SEVERITY_RANK[item.severity] || 0) * 1e9 + Number(item.impactPln || 0),
    impactPln: (item) => Number(item.impactPln || 0),
    severity: (item) => SEVERITY_RANK[item.severity] || 0,
    sku: (item) => item.sku || '',
    category: (item) => item.category || ''
};

const SPIKE_ACCESSORS = {
    absChange: (ev) => Math.abs(Number(ev.changePct || 0)),
    changePct: (ev) => Number(ev.changePct || 0),
    week: (ev) => ev.week || '',
    weekUnits: (ev) => Number(ev.weekUnits || 0),
    sku: (ev) => ev.sku || ''
};

export default function OverviewTab({ analysis, onSelectSku, onOpenProduct }) {
    const [queueFilter, setQueueFilter] = useState('ALL');
    const [spikeFilter, setSpikeFilter] = useState('ALL');

    const kpis = analysis?.kpis || {};
    const meta = analysis?.meta || {};
    const threshold = meta.stockoutThreshold ?? 2;

    const filteredQueue = useMemo(() => {
        const list = analysis?.actionQueue || [];
        if (queueFilter === 'ALL') return list;
        return list.filter(item => item.category === queueFilter || item.platform === queueFilter);
    }, [analysis, queueFilter]);

    const { sortedItems: sortedQueue, sortConfig: queueSort, requestSort: requestQueueSort } = useSortableData(
        filteredQueue,
        { key: 'priorityImpact', direction: 'desc' },
        QUEUE_ACCESSORS
    );

    const filteredSpikes = useMemo(() => {
        const list = analysis?.spikesAndDrops || [];
        if (spikeFilter === 'ALL') return list;
        return list.filter(item => item.type === spikeFilter);
    }, [analysis, spikeFilter]);

    const { sortedItems: sortedSpikes, sortConfig: spikeSort, requestSort: requestSpikeSort } = useSortableData(
        filteredSpikes,
        { key: 'absChange', direction: 'desc' },
        SPIKE_ACCESSORS
    );

    const pnlChartData = useMemo(() => {
        return (analysis?.pnlWaterfall || []).map(item => ({
            name: item.name,
            value: Number(item.value || 0),
            absValue: Math.abs(Number(item.value || 0))
        }));
    }, [analysis]);

    const trendData = useMemo(() => {
        return (analysis?.monthlyTrend || []).map(m => ({
            month: m.month,
            gmvPln: Number(m.gmvPln || 0),
            orders: Number(m.orders || 0),
            multiOrders: Number(m.multiOrders || 0),
            stockoutStarts: Number(m.stockoutStarts || 0)
        }));
    }, [analysis]);

    return (
        <div className="space-y-6">
            {/* KPI Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiGmv}><span>Obrót Brutto (GMV)</span></MetricTooltip>
                        <TrendingUp className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{fmtPln(kpis.totalGmvPln)}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiFullPotential}>
                            <span>Pełny potencjał: <strong>{fmtPln(kpis.fullPotentialGmvPln)}</strong></span>
                        </MetricTooltip>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                            Realizacja: {fmtPct(kpis.potentialRealizedPct)}
                        </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                        {fmtInt(kpis.totalOrders)} zamówień • {fmtInt(kpis.totalUnits)} szt. • Okres: {meta.spanDays || 0} dni
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-rose-700 uppercase tracking-wide">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiLostByStockout}>
                            <span>Straty przez Braki (stan ≤ {threshold} szt.)</span>
                        </MetricTooltip>
                        <PackageX className="w-4 h-4 text-rose-600" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-rose-700">{fmtPln(kpis.totalLostGmvPln)}</div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-600">
                        <div className="bg-rose-50/60 px-1.5 py-1 rounded">
                            <div className="text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.kpiLostDirect}><span>Bezp.</span></MetricTooltip></div>
                            <div className="font-semibold text-slate-800">{fmtPln(kpis.totalLostDirectPln)}</div>
                        </div>
                        <div className="bg-rose-50/60 px-1.5 py-1 rounded">
                            <div className="text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.kpiLostCrossSell}><span>Cross-Sell</span></MetricTooltip></div>
                            <div className="font-semibold text-slate-800">{fmtPln(kpis.totalLostCrossSellPln)}</div>
                        </div>
                        <div className="bg-rose-50/60 px-1.5 py-1 rounded">
                            <div className="text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.kpiLostRelevance}><span>Trafność</span></MetricTooltip></div>
                            <div className="font-semibold text-slate-800">{fmtPln(kpis.totalLostRelevancePln)}</div>
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-rose-700 font-medium">
                        {fmtInt(kpis.unavailableNowCount)} SKU zablokowanych teraz (≤ {threshold} szt.) • {fmtInt(kpis.totalStockoutDays)} dni przerw
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiNetProfit}><span>Zweryfikowany Zysk Netto (PIM COGS)</span></MetricTooltip>
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-emerald-700">{fmtPln(kpis.verifiedNetProfitPln)}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>Marża netto: <strong>{fmtPct(kpis.verifiedNetMarginPct)}</strong></span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${(meta.cogsCoveragePct || 0) >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            <MetricTooltip text={METRIC_TOOLTIPS.kpiCogsCoverage}><span>COGS w PIM: {fmtPct(meta.cogsCoveragePct)}</span></MetricTooltip>
                        </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                        Utracony zysk przez braki: <strong>{fmtPln(kpis.totalLostNetProfitPln)}</strong>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <span>Reklamy, ROAS, POAS &amp; GMROI</span>
                        <Sparkles className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiRoas}>
                            <span className="text-2xl font-bold text-slate-900">ROAS {kpis.roas !== null ? `${fmtNum(kpis.roas, 2)}x` : '—'}</span>
                        </MetricTooltip>
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiPoas}>
                            <span className="text-sm font-semibold text-violet-700">POAS {kpis.poas !== null ? `${fmtNum(kpis.poas, 2)}x` : '—'}</span>
                        </MetricTooltip>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>Koszt Ads: <strong>{fmtPln(kpis.effectiveAdsSpendPln)}</strong></span>
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiTacos}>
                            <span>TACOS: <strong>{fmtPct(kpis.tacosPct)}</strong></span>
                        </MetricTooltip>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiGmroi}>
                            <span>GMROI kapitału magazynowego: <strong>{kpis.gmroi !== null ? `${fmtNum(kpis.gmroi, 2)}x` : '—'}</strong></span>
                        </MetricTooltip>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiMultiShare}><span>Koszyki Wieloprzedmiotowe (2+)</span></MetricTooltip>
                        <ShoppingBag className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{fmtPct(kpis.multiOrdersSharePct)}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>Śr. koszyk 2+: <strong>{fmtPln(kpis.avgBasketMultiPln)}</strong></span>
                        <span>Solo: <strong>{fmtPln(kpis.avgBasketSoloPln)}</strong></span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiCrossSell}>
                            <span>Wygenerowany Cross-Sell: <strong>{fmtPln(kpis.crossSellTotalPln)}</strong> ({fmtInt(kpis.anchorsCount)} Kotwic)</span>
                        </MetricTooltip>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-amber-800 uppercase tracking-wide">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiRopBudget}><span>Budżet ROP &amp; Krytyczne Alerty</span></MetricTooltip>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{fmtPln(kpis.recommendedPurchaseBudgetPln)}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">Krwawiące: {fmtInt(kpis.bleedingOffersCount)}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Leżaki: {fmtInt(kpis.deadStockCount)}</span>
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">Luki InPost: {fmtInt(kpis.crossChannelGapsCount)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                        <MetricTooltip text={METRIC_TOOLTIPS.kpiActionAlerts}>
                            <span>Smart! martwa strefa: <strong>{fmtInt(kpis.deadZoneSmartCount)}</strong> • Błędy ID: <strong>{fmtInt(kpis.brokenIdSkusCount)}</strong></span>
                        </MetricTooltip>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-w-0">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">
                                <MetricTooltip text={METRIC_TOOLTIPS.chartPnlWaterfall}><span>Rachunek P&amp;L Waterfall (Zweryfikowane COGS)</span></MetricTooltip>
                            </h3>
                            <p className="text-xs text-slate-500">Rozbicie od obrotu brutto do zysku netto po VAT, zakupie, logistyce, prowizjach i Ads</p>
                        </div>
                    </div>
                    <div className="w-full min-w-0" style={{ height: 256 }}>
                        {pnlChartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400">
                                Brak danych kosztowych lub zamówień do wykreślenia rachunku P&amp;L.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={256} minWidth={0} initialDimension={{ width: 520, height: 256 }}>
                                <BarChart data={pnlChartData} margin={{ top: 10, right: 16, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <RechartsTooltip formatter={(v) => fmtPln(v)} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {pnlChartData.map((entry, idx) => {
                                            const isPositive = entry.value >= 0;
                                            const color = idx === pnlChartData.length - 1
                                                ? (isPositive ? '#059669' : '#e11d48')
                                                : (isPositive ? '#4f46e5' : '#f43f5e');
                                            return <Cell key={entry.name} fill={color} />;
                                        })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-w-0">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">
                                <MetricTooltip text={METRIC_TOOLTIPS.chartMonthlyTrend}><span>Trend Miesięczny: Obrót GMV vs Zamówienia i Starty Braków</span></MetricTooltip>
                            </h3>
                            <p className="text-xs text-slate-500">Korelacja dynamiki sprzedaży z momentami wejścia produktów w próg wyłączenia (≤ {threshold} szt.)</p>
                        </div>
                    </div>
                    <div className="w-full min-w-0" style={{ height: 256 }}>
                        {trendData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400">
                                Brak danych trendu miesięcznego w wybranym okresie.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={256} minWidth={0} initialDimension={{ width: 520, height: 256 }}>
                                <ComposedChart data={trendData} margin={{ top: 10, right: 16, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                                    <RechartsTooltip />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar yAxisId="left" dataKey="gmvPln" name="Obrót GMV (PLN)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="orders" name="Zamówienia" stroke="#059669" strokeWidth={2} dot={false} />
                                    <Line yAxisId="right" type="monotone" dataKey="stockoutStarts" name="Starty braków" stroke="#e11d48" strokeWidth={2} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Markets & Channels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">
                        <MetricTooltip text={METRIC_TOOLTIPS.sectionMarkets}><span>Rynki i Waluty (Przeliczenie PLN)</span></MetricTooltip>
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {(analysis?.marketBreakdown || []).map(m => (
                            <div key={m.code} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                <div className="text-xs font-semibold text-slate-700">{m.label}</div>
                                <div className="mt-1 text-base font-bold text-slate-900">{fmtPln(m.plnSum)}</div>
                                <div className="text-[11px] text-slate-500">
                                    {fmtInt(m.orders)} zam. • Oryg.: {fmtNum(m.rawSum, 2)} {m.code}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">
                        <MetricTooltip text={METRIC_TOOLTIPS.sectionChannels}><span>Kanały Sprzedaży (Zdeduplikowane Omnichannel)</span></MetricTooltip>
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {(analysis?.channelBreakdown || []).map(c => (
                            <div key={c.channel} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                <div className="text-xs font-semibold text-slate-700">{c.channel}</div>
                                <div className="mt-1 text-base font-bold text-slate-900">{fmtPln(c.gmvPln)}</div>
                                <div className="text-[11px] text-slate-500">
                                    {fmtInt(c.orders)} zamówień • {fmtInt(c.units)} szt.
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Prioritized Action Queue & Spikes/Drops */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">
                                <MetricTooltip text={METRIC_TOOLTIPS.sectionActionQueue}><span>Priorytetowa Kolejka Decyzyjna</span></MetricTooltip>
                            </h3>
                            <p className="text-xs text-slate-500">Konkretne decyzje z sortowaniem po priorytecie, wpływie PLN lub SKU</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                                {[
                                    { k: 'priorityImpact', l: 'Priorytet' },
                                    { k: 'impactPln', l: 'Wpływ PLN' },
                                    { k: 'sku', l: 'SKU', dir: 'asc' },
                                    { k: 'category', l: 'Kategoria', dir: 'asc' }
                                ].map(opt => {
                                    const active = queueSort.key === opt.k;
                                    return (
                                        <button
                                            key={opt.k}
                                            type="button"
                                            onClick={() => requestQueueSort(opt.k, opt.dir || 'desc')}
                                            className={`px-2 py-1 rounded-md inline-flex items-center gap-1 font-medium transition-colors ${active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            {opt.l}
                                            {active && (queueSort.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                                        </button>
                                    );
                                })}
                            </div>
                            <select
                                value={queueFilter}
                                onChange={e => setQueueFilter(e.target.value)}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                            >
                                <option value="ALL">Wszystkie kategorie ({(analysis?.actionQueue || []).length})</option>
                                <option value="PROCUREMENT">Pilne domówienia Kotwic</option>
                                <option value="BLEEDING_PROMO">Krwawiące promowania / Ads</option>
                                <option value="SMART_BUNDLE">Martwa strefa Smart!</option>
                                <option value="EXPANSION">Luki InPost Von Halsky</option>
                                <option value="DEAD_STOCK">Leżaki magazynowe</option>
                            </select>
                        </div>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                        {sortedQueue.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-500">Brak pilnych alertów w wybranej kategorii.</div>
                        ) : (
                            sortedQueue.map((item, idx) => {
                                const sev = SEVERITY_META[item.severity] || SEVERITY_META.MEDIUM;
                                return (
                                    <div key={`${item.sku || 'item'}-${idx}`} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${sev.badgeClass}`}>{sev.label}</span>
                                                <span className="text-[11px] font-mono text-slate-500">{item.sku}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{item.platform}</span>
                                            </div>
                                            <div className="text-xs font-semibold text-slate-900 mt-1 truncate">{item.title}</div>
                                            <div className="text-[11px] text-slate-600 mt-0.5">{item.detail}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="text-right mr-2">
                                                <div className="text-[10px] text-slate-400">Wpływ</div>
                                                <div className="text-xs font-bold text-slate-900">{fmtPln(item.impactPln)}</div>
                                            </div>
                                            {item.sku && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectSku(item.sku)}
                                                    className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg inline-flex items-center gap-1"
                                                >
                                                    <Search className="w-3 h-3" /> SKU
                                                </button>
                                            )}
                                            {item.pimProductId && onOpenProduct && (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenProduct(item.pimProductId)}
                                                    className="px-2.5 py-1.5 text-[11px] font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg inline-flex items-center gap-1"
                                                    title="Otwórz w Offer Optimizer"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> Edytuj
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">
                                <MetricTooltip text={METRIC_TOOLTIPS.sectionSpikesDrops}><span>Detektor Skoków i Spadków</span></MetricTooltip>
                            </h3>
                            <p className="text-xs text-slate-500">Root-Cause anomalii tygodniowych</p>
                        </div>
                        <select
                            value={spikeFilter}
                            onChange={e => setSpikeFilter(e.target.value)}
                            className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white"
                        >
                            <option value="ALL">Wszystkie</option>
                            <option value="SPIKE">Tylko skoki (+65%)</option>
                            <option value="DROP">Tylko spadki (-45%)</option>
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3 text-[10px]">
                        {[
                            { k: 'absChange', l: 'Siła zmiany' },
                            { k: 'changePct', l: 'Zmiana %' },
                            { k: 'week', l: 'Tydzień' },
                            { k: 'sku', l: 'SKU', dir: 'asc' }
                        ].map(opt => {
                            const active = spikeSort.key === opt.k;
                            return (
                                <button
                                    key={opt.k}
                                    type="button"
                                    onClick={() => requestSpikeSort(opt.k, opt.dir || 'desc')}
                                    className={`px-2 py-0.5 rounded border inline-flex items-center gap-1 ${active ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                                >
                                    {opt.l}
                                    {active && (spikeSort.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
                                </button>
                            );
                        })}
                    </div>
                    <div className="space-y-2.5 max-h-[385px] overflow-y-auto pr-1">
                        {sortedSpikes.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-500">Brak wykrytych anomalii tygodniowych w tym okresie.</div>
                        ) : (
                            sortedSpikes.slice(0, 45).map((ev, i) => {
                                const isSpike = ev.type === 'SPIKE';
                                return (
                                    <div key={`${ev.sku}-${ev.week}-${i}`} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${isSpike ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                {isSpike ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                                {ev.changePct > 0 ? `+${ev.changePct}%` : `${ev.changePct}%`} ({ev.week})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onSelectSku(ev.sku)}
                                                className="text-[11px] font-mono text-indigo-600 hover:underline"
                                            >
                                                {ev.sku}
                                            </button>
                                        </div>
                                        <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">{ev.name}</div>
                                        <div className="text-[11px] text-slate-600 mt-0.5"><strong>Przyczyna:</strong> {ev.cause}</div>
                                        <div className="text-[11px] text-indigo-700 mt-0.5">{ev.action}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
