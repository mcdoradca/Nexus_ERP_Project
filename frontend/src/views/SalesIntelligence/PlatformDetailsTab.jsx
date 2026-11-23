import React, { useMemo } from 'react';
import { Flame, ShieldAlert, Truck, CreditCard, Megaphone, Award, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { fmtPln, fmtInt, fmtNum, fmtPct, fmtShortDate } from './formatters';
import MetricTooltip from './MetricTooltip';
import SortableTh from './SortableTh';
import { METRIC_TOOLTIPS } from './metricTooltips';
import { useSortableData } from './useSortableData';

const BLEEDING_ACCESSORS = {
    promoAndAdsCostPln: (b) => Number(b.promoAndAdsCostPln || 0),
    currentStock: (b) => b.currentStock,
    verifiedNetProfitPln: (b) => b.verifiedNetProfitPln,
    sku: (b) => b.sku || ''
};

const TECH_ACCESSORS = {
    soloUnderSmartCount: (s) => Number(s.soloUnderSmartCount || 0),
    sku: (s) => s.sku || '',
    name: (s) => s.name || ''
};

const FUNNEL_ACCESSORS = {
    sku: (s) => s.sku || '',
    deltaVisits: (s) => Number(s.deltaVisits || 0),
    deltaWatchers: (s) => Number(s.deltaWatchers || 0),
    ordersCount: (s) => Number(s.ordersCount || 0),
    conversionRatePct: (s) => s.conversionRatePct
};

const ADS_ACCESSORS = {
    campaignName: (c) => c.campaignName || '',
    clicks: (c) => Number(c.clicks || 0),
    costNetPln: (c) => Number(c.costNetPln || 0),
    adRevenuePln: (c) => Number(c.adRevenuePln || 0),
    roas: (c) => Number(c.roas || 0)
};

export default function PlatformDetailsTab({ analysis, onSelectSku }) {
    const platform = analysis?.meta?.platform || 'ALL';
    const fees = analysis?.feeTotals || {};
    const vh = analysis?.vonHalskyDiagnostics || {};
    const smartThreshold = Number(analysis?.meta?.smartThresholdPln || 49.90);
    const deadZoneMin = Number(analysis?.meta?.smartDeadZoneMin || 34.00);
    const threshold = analysis?.meta?.stockoutThreshold ?? 2;

    const showAllegro = platform === 'ALL' || platform === 'ALLEGRO';
    const showVonHalsky = platform === 'ALL' || platform === 'VONHALSKY';
    const showBase = platform === 'ALL' || platform === 'BASELINKER';

    const technicalIssuesRaw = useMemo(() => {
        return (analysis?.skus || []).filter(
            s => s.brokenAuctionContinuity || s.parallelAuctionsDetected || s.soloUnderSmartCount >= 3
        );
    }, [analysis]);

    const allegroFunnelRaw = useMemo(() => {
        return (analysis?.skus || []).filter(s => s.deltaVisits > 0 || s.allegroOfferIds?.length > 0);
    }, [analysis]);

    const { sortedItems: sortedBleeding, sortConfig: bleedSort, requestSort: requestBleedSort } = useSortableData(
        analysis?.bleedingOffers || [],
        { key: 'promoAndAdsCostPln', direction: 'desc' },
        BLEEDING_ACCESSORS
    );

    const { sortedItems: sortedTechIssues, sortConfig: techSort, requestSort: requestTechSort } = useSortableData(
        technicalIssuesRaw,
        { key: 'soloUnderSmartCount', direction: 'desc' },
        TECH_ACCESSORS
    );

    const { sortedItems: sortedFunnel, sortConfig: funnelSort, requestSort: requestFunnelSort } = useSortableData(
        allegroFunnelRaw,
        { key: 'deltaVisits', direction: 'desc' },
        FUNNEL_ACCESSORS
    );

    const { sortedItems: sortedAds, sortConfig: adsSort, requestSort: requestAdsSort } = useSortableData(
        analysis?.adsCampaigns || [],
        { key: 'costNetPln', direction: 'desc' },
        ADS_ACCESSORS
    );

    return (
        <div className="space-y-6">
            {/* SEKCJA ALLEGRO */}
            {showAllegro && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Award className="w-5 h-5 text-orange-600" />
                        Diagnostyka Allegro (Bilingi, Krwawienie, Lejek Odwiedzin, Ads &amp; Jakość 30d)
                    </div>

                    {/* Bilingi opłat */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.feeCommission}><span>Prowizje (brutto)</span></MetricTooltip></div>
                            <div className="text-sm font-bold text-slate-900 mt-1">{fmtPln(fees.commissionPln)}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.feeRefunds}><span>Zwroty prowizji</span></MetricTooltip></div>
                            <div className="text-sm font-bold text-emerald-700 mt-1">+{fmtPln(fees.commissionRefundPln)}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.feeSmart}><span>Allegro Smart!</span></MetricTooltip></div>
                            <div className="text-sm font-bold text-slate-900 mt-1">{fmtPln(fees.smartFeePln)}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.feePromo}><span>Wyróżnienia &amp; Promo</span></MetricTooltip></div>
                            <div className="text-sm font-bold text-rose-700 mt-1">{fmtPln(fees.promoFeePln)}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.feeAdsBilling}><span>Ads (Biling)</span></MetricTooltip></div>
                            <div className="text-sm font-bold text-violet-700 mt-1">{fmtPln(fees.adsBillingPln)}</div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.feeSubOther}><span>Abonament / Inne</span></MetricTooltip></div>
                            <div className="text-sm font-bold text-slate-900 mt-1">{fmtPln((fees.subscriptionPln || 0) + (fees.otherPln || 0))}</div>
                        </div>
                    </div>

                    {/* Krwawiące oferty + Techniczne błędy aukcji */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <h4 className="text-xs font-bold text-rose-800 uppercase flex items-center gap-1.5">
                                    <Flame className="w-4 h-4 text-rose-600" />
                                    <MetricTooltip text={METRIC_TOOLTIPS.kpiActionAlerts}><span>Krwawiące Oferty ({sortedBleeding.length})</span></MetricTooltip>
                                </h4>
                                <div className="flex gap-1 text-[10px]">
                                    {[
                                        { k: 'promoAndAdsCostPln', l: 'Koszt' },
                                        { k: 'currentStock', l: 'Stan', dir: 'asc' },
                                        { k: 'sku', l: 'SKU', dir: 'asc' }
                                    ].map(opt => {
                                        const active = bleedSort.key === opt.k;
                                        return (
                                            <button
                                                key={opt.k}
                                                type="button"
                                                onClick={() => requestBleedSort(opt.k, opt.dir || 'desc')}
                                                className={`px-2 py-0.5 rounded border inline-flex items-center gap-1 ${active ? 'bg-rose-50 border-rose-300 text-rose-800 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                                            >
                                                {opt.l}
                                                {active && (bleedSort.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                                {sortedBleeding.length === 0 ? (
                                    <div className="py-6 text-center text-slate-500">Brak ofert przepalających wyróżnienia / Ads.</div>
                                ) : (
                                    sortedBleeding.map((b, i) => (
                                        <div key={`${b.sku}-${i}`} className="py-2 flex justify-between items-start gap-2">
                                            <div>
                                                <button type="button" onClick={() => onSelectSku(b.sku)} className="font-semibold text-slate-900 hover:text-indigo-600 text-left">
                                                    {b.name}
                                                </button>
                                                <div className="text-[11px] text-rose-700">{b.reason}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="font-bold text-rose-700">{fmtPln(b.promoAndAdsCostPln)}</div>
                                                <div className="text-[10px] text-slate-500">Stan: {b.currentStock ?? '?'} szt.</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <h4 className="text-xs font-bold text-amber-900 uppercase flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4 text-amber-600" />
                                    <MetricTooltip text={METRIC_TOOLTIPS.colSoloUnderSmart}>
                                        <span>Audyt ID Aukcji &amp; Martwa Strefa Smart! ({fmtNum(deadZoneMin, 0)}–{fmtNum(smartThreshold - 0.01, 2)} zł)</span>
                                    </MetricTooltip>
                                </h4>
                                <div className="flex gap-1 text-[10px]">
                                    {[
                                        { k: 'soloUnderSmartCount', l: 'Zam. < Smart!' },
                                        { k: 'sku', l: 'SKU', dir: 'asc' },
                                        { k: 'name', l: 'Nazwa', dir: 'asc' }
                                    ].map(opt => {
                                        const active = techSort.key === opt.k;
                                        return (
                                            <button
                                                key={opt.k}
                                                type="button"
                                                onClick={() => requestTechSort(opt.k, opt.dir || 'desc')}
                                                className={`px-2 py-0.5 rounded border inline-flex items-center gap-1 ${active ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                                            >
                                                {opt.l}
                                                {active && (techSort.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                                {sortedTechIssues.length === 0 ? (
                                    <div className="py-6 text-center text-slate-500">Brak wykrytych problemów ciągłości ID lub martwej strefy Smart!.</div>
                                ) : (
                                    sortedTechIssues.slice(0, 80).map(s => (
                                        <div key={s.skuKey} className="py-2 flex justify-between items-start gap-2">
                                            <div>
                                                <button type="button" onClick={() => onSelectSku(s.sku)} className="font-semibold text-slate-900 hover:text-indigo-600 text-left">
                                                    {s.name}
                                                </button>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {s.brokenAuctionContinuity && <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-semibold">Zerwane ID aukcji</span>}
                                                    {s.parallelAuctionsDetected && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">Równoległe duplikaty</span>}
                                                    {s.soloUnderSmartCount >= 3 && <span className="px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded text-[10px] font-semibold">{s.soloUnderSmartCount}x solo &lt; Smart!</span>}
                                                </div>
                                            </div>
                                            <div className="text-[11px] font-mono text-slate-500 shrink-0">{s.sku}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Lejek konwersji & Kampanie Allegro Ads */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-800 uppercase mb-2">
                                <MetricTooltip text={METRIC_TOOLTIPS.colConversionRate}>
                                    <span>Lejek Ruchu Allegro (&Delta; Odwiedziny &rarr; Obserwujący &rarr; CR%)</span>
                                </MetricTooltip>
                            </h4>
                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                <table className="min-w-full text-xs divide-y divide-slate-200">
                                    <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold">
                                        <tr>
                                            <SortableTh label="SKU" sortKey="sku" defaultDirection="asc" sortConfig={funnelSort} onSort={requestFunnelSort} tooltip={METRIC_TOOLTIPS.colProductSku} className="px-2 py-1.5" />
                                            <SortableTh label="Odwiedziny" sortKey="deltaVisits" align="right" sortConfig={funnelSort} onSort={requestFunnelSort} tooltip={METRIC_TOOLTIPS.colVisitsDelta} className="px-2 py-1.5" />
                                            <SortableTh label="Δ Obserw." sortKey="deltaWatchers" align="right" sortConfig={funnelSort} onSort={requestFunnelSort} tooltip={METRIC_TOOLTIPS.colWatchersDelta} className="px-2 py-1.5" />
                                            <SortableTh label="Zam." sortKey="ordersCount" align="right" sortConfig={funnelSort} onSort={requestFunnelSort} tooltip={METRIC_TOOLTIPS.colOrdersMulti} className="px-2 py-1.5" />
                                            <SortableTh label="CR %" sortKey="conversionRatePct" align="right" sortConfig={funnelSort} onSort={requestFunnelSort} tooltip={METRIC_TOOLTIPS.colConversionRate} className="px-2 py-1.5" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedFunnel.slice(0, 120).map(s => (
                                            <tr key={s.skuKey}>
                                                <td className="px-2 py-1.5">
                                                    <button type="button" onClick={() => onSelectSku(s.sku)} className="font-mono text-indigo-700 hover:underline">{s.sku}</button>
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-mono">{fmtInt(s.deltaVisits)}</td>
                                                <td className="px-2 py-1.5 text-right font-mono">{s.deltaWatchers >= 0 ? `+${s.deltaWatchers}` : s.deltaWatchers}</td>
                                                <td className="px-2 py-1.5 text-right font-mono">{s.ordersCount}</td>
                                                <td className="px-2 py-1.5 text-right font-semibold">{s.conversionRatePct !== null ? fmtPct(s.conversionRatePct) : '—'}</td>
                                            </tr>
                                        ))}
                                        {sortedFunnel.length === 0 && (
                                            <tr><td colSpan={5} className="py-6 text-center text-slate-500">Zsynchronizuj API Allegro lub wgraj CSV Allegro Analytics, aby zobaczyć ruch.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5 mb-2">
                                <Megaphone className="w-4 h-4 text-violet-600" />
                                <MetricTooltip text={METRIC_TOOLTIPS.kpiRoas}><span>Kampanie Allegro Ads (z importów CSV / XLSX)</span></MetricTooltip>
                            </h4>
                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                <table className="min-w-full text-xs divide-y divide-slate-200">
                                    <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold">
                                        <tr>
                                            <SortableTh label="Kampania" sortKey="campaignName" defaultDirection="asc" sortConfig={adsSort} onSort={requestAdsSort} className="px-2 py-1.5" />
                                            <SortableTh label="Kliknięcia" sortKey="clicks" align="right" sortConfig={adsSort} onSort={requestAdsSort} tooltip={METRIC_TOOLTIPS.colAdsClicks} className="px-2 py-1.5" />
                                            <SortableTh label="Koszt netto" sortKey="costNetPln" align="right" sortConfig={adsSort} onSort={requestAdsSort} className="px-2 py-1.5" />
                                            <SortableTh label="Przychód" sortKey="adRevenuePln" align="right" sortConfig={adsSort} onSort={requestAdsSort} className="px-2 py-1.5" />
                                            <SortableTh label="ROAS" sortKey="roas" align="right" sortConfig={adsSort} onSort={requestAdsSort} tooltip={METRIC_TOOLTIPS.colAdsRoas} className="px-2 py-1.5" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedAds.map(c => (
                                            <tr key={c.campaignName}>
                                                <td className="px-2 py-1.5 font-medium text-slate-800 truncate max-w-[180px]">{c.campaignName}</td>
                                                <td className="px-2 py-1.5 text-right font-mono">{fmtInt(c.clicks)} ({fmtPct(c.ctrPct)})</td>
                                                <td className="px-2 py-1.5 text-right font-mono">{fmtPln(c.costNetPln)}</td>
                                                <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">{fmtPln(c.adRevenuePln)}</td>
                                                <td className="px-2 py-1.5 text-right font-bold">{fmtNum(c.roas, 2)}x</td>
                                            </tr>
                                        ))}
                                        {sortedAds.length === 0 && (
                                            <tr><td colSpan={5} className="py-6 text-center text-slate-500">Wgraj raport CSV/XLSX z panelu Allegro Ads w zakładce Źródła API i CSV.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SEKCJA INPOST VON HALSKY */}
            {showVonHalsky && (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <Truck className="w-5 h-5 text-amber-500" />
                        Diagnostyka InPost Von Halsky (OpenAPI v1.7.12: Oferty, Program Cenowy, SLA &amp; Posprzedaż v2)
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="text-xs font-bold text-slate-700 uppercase">Statusy Ofert na Marketplace</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                {['PUBLISHED', 'REJECTED', 'SOLDOUT', 'PENDING', 'CLOSED'].map(st => (
                                    <div key={st} className="flex justify-between bg-slate-50 px-2.5 py-1.5 rounded">
                                        <span className="font-mono text-slate-600">{st}</span>
                                        <span className="font-bold text-slate-900">{fmtInt(vh.offerStatusCounts?.[st] || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                <CreditCard className="w-4 h-4 text-emerald-600" />
                                <MetricTooltip text={METRIC_TOOLTIPS.vhPriceProgram}><span>Program Cenowy InPost (Discount Split)</span></MetricTooltip>
                            </div>
                            <div className="mt-3 space-y-2 text-xs">
                                <div className="flex justify-between"><span>Zamówienia w programie:</span><strong>{fmtInt(vh.programOrdersCount)}</strong></div>
                                <div className="flex justify-between"><span>Dopłata InPost (inpostShare):</span><strong className="text-emerald-700">{fmtPln(vh.programDiscountPlatformPln)}</strong></div>
                                <div className="flex justify-between"><span>Wkład Sprzedawcy (merchantShare):</span><strong className="text-rose-700">{fmtPln(vh.programDiscountMerchantPln)}</strong></div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="text-xs font-bold text-slate-700 uppercase">
                                <MetricTooltip text={METRIC_TOOLTIPS.vhSlaTimes}><span>Logistyka APM / Kurier &amp; Czasy SLA</span></MetricTooltip>
                            </div>
                            <div className="mt-3 space-y-2 text-xs">
                                <div className="flex justify-between"><span>Paczkomat (APM) vs Kurier:</span><strong>{fmtInt(vh.deliveryMix?.APM || 0)} / {fmtInt(vh.deliveryMix?.COURIER || 0)}</strong></div>
                                <div className="flex justify-between"><span>Śr. czas akceptacji zamówienia:</span><strong>{vh.avgAcceptHours !== null && vh.avgAcceptHours !== undefined ? `${fmtNum(vh.avgAcceptHours, 1)} h` : '—'}</strong></div>
                                <div className="flex justify-between"><span>Śr. czas nadania paczki:</span><strong>{vh.avgShipHours !== null && vh.avgShipHours !== undefined ? `${fmtNum(vh.avgShipHours, 1)} h` : '—'}</strong></div>
                            </div>
                        </div>
                    </div>

                    {(vh.rejectionGroups || []).length > 0 && (
                        <div className="bg-white rounded-xl border border-rose-200 p-4">
                            <h4 className="text-xs font-bold text-rose-800 uppercase mb-2">Najczęstsze powody odrzuceń ofert Von Halsky</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                {vh.rejectionGroups.map((g, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-rose-50/50 px-3 py-2 rounded">
                                        <span className="text-slate-800">{g.reason}</span>
                                        <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold ml-2 shrink-0">{g.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* JAKOŚĆ SPRZEDAŻY & POSPRZEDAŻ (WSZYSTKIE PLATFORMY) */}
            {(showAllegro || showVonHalsky || showBase) && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5 mb-3">
                        <ShieldAlert className="w-4 h-4 text-indigo-600" /> Migawki Jakości, Zwrotów, Sporów (/sale/issues) &amp; Alerty Posprzedażowe
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                        {(analysis?.qualitySnapshots || []).map(q => (
                            <div key={`${q.platform}-${q.accountId}`} className="rounded-lg border border-slate-200 p-3 bg-slate-50/70">
                                <div className="flex items-center justify-between font-bold text-slate-900">
                                    <span>{q.platform} ({q.accountId})</span>
                                    <span className="text-[11px] font-normal text-slate-500">{fmtShortDate(q.snapshotDate)}</span>
                                </div>
                                <div className="mt-2 space-y-1 text-slate-700">
                                    {q.qualityScore !== null && q.qualityScore !== undefined && (
                                        <div>Jakość sprzedaży: <strong>{q.qualityScore} / {q.maxQualityScore || 500}</strong> ({q.qualityGrade || '—'})</div>
                                    )}
                                    <div>Zwroty: <strong>{fmtInt(q.returnsCount)}</strong> • Spory/Alerty: <strong className={q.openIssuesCount > 0 ? 'text-rose-700' : ''}>{fmtInt(q.openIssuesCount)}</strong></div>
                                    {q.claimsCount > 0 && <div>Reklamacje Von Halsky: <strong>{fmtInt(q.claimsCount)}</strong></div>}
                                    {q.metricsJson?.courierSla?.avgDispatchHours !== undefined && q.metricsJson?.courierSla?.avgDispatchHours !== null && (
                                        <div>SLA nadania z Base.com: <strong>{fmtNum(q.metricsJson.courierSla.avgDispatchHours, 1)} h</strong></div>
                                    )}
                                </div>
                                {Array.isArray(q.issuesSample) && q.issuesSample.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-rose-700">
                                        Aktywne zgłoszenia wymagające reakcji: {q.issuesSample.length}
                                    </div>
                                )}
                            </div>
                        ))}
                        {(analysis?.qualitySnapshots || []).length === 0 && (
                            <div className="col-span-full py-4 text-center text-slate-500">
                                Brak migawek jakości i zwrotów. Uruchom synchronizację API (stan progu ≤ {threshold} szt.).
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
