import React from 'react';
import { Printer, FileSpreadsheet, FileText } from 'lucide-react';
import { fmtPln, fmtInt, fmtNum, fmtPct, fmtDateTime } from './formatters';
import MetricTooltip from './MetricTooltip';
import SortableTh from './SortableTh';
import { METRIC_TOOLTIPS } from './metricTooltips';
import { useSortableData } from './useSortableData';

const REPORT_ACCESSORS = {
    name: (s) => s.name || s.sku || '',
    roleAbc: (s) => `${s.role || 'SOLO'} ${s.abcXyz || 'CZ'}`,
    currentStock: (s) => s.currentStock,
    totalUnits: (s) => Number(s.totalUnits || 0),
    totalRevenuePln: (s) => Number(s.totalRevenuePln || 0),
    verifiedNetProfitPln: (s) => s.verifiedNetProfitPln,
    stockoutDays: (s) => Number(s.stockoutDays || 0),
    lostDirectPln: (s) => Number(s.lostDirectPln || 0),
    lostCrossSellPln: (s) => Number(s.lostCrossSellPln || 0),
    lostRelevancePln: (s) => Number(s.lostRelevancePln || 0),
    totalLostGmvPln: (s) => Number(s.totalLostGmvPln || 0),
    recommendedOrderQty: (s) => Number(s.recommendedOrderQty || 0)
};

export default function BoardReportTab({ analysis, workspaceName, onExportXlsx, onExportCsv }) {
    const meta = analysis?.meta || {};
    const kpis = analysis?.kpis || {};
    const threshold = meta.stockoutThreshold ?? 2;
    const allSkus = analysis?.skus || [];

    const { sortedItems: sortedSkus, sortConfig: reportSort, requestSort: requestReportSort } = useSortableData(
        allSkus,
        { key: 'totalRevenuePln', direction: 'desc' },
        REPORT_ACCESSORS
    );

    const topCompare = [...allSkus]
        .sort((a, b) => (b.totalRevenuePln + b.totalLostGmvPln) - (a.totalRevenuePln + a.totalLostGmvPln))
        .slice(0, 25);

    const maxBarVal = Math.max(1, ...topCompare.map(s => (s.totalRevenuePln || 0) + (s.totalLostGmvPln || 0)));

    // Suma kontrolna 100% wszystkich SKU
    const controlTotals = allSkus.reduce(
        (acc, s) => {
            acc.units += Number(s.totalUnits || 0);
            acc.revenue += Number(s.totalRevenuePln || 0);
            acc.netProfit += Number(s.verifiedNetProfitPln || 0);
            acc.lostDirect += Number(s.lostDirectPln || 0);
            acc.lostCross += Number(s.lostCrossSellPln || 0);
            acc.lostRelevance += Number(s.lostRelevancePln || 0);
            acc.lostTotal += Number(s.totalLostGmvPln || 0);
            acc.stockoutDays += Number(s.stockoutDays || 0);
            acc.orderQty += Number(s.recommendedOrderQty || 0);
            return acc;
        },
        { units: 0, revenue: 0, netProfit: 0, lostDirect: 0, lostCross: 0, lostRelevance: 0, lostTotal: 0, stockoutDays: 0, orderQty: 0 }
    );

    const handlePrintPdf = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* Pasek akcji (ukrywany podczas wydruku PDF) */}
            <div className="print:hidden bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div>
                    <h3 className="text-sm font-bold text-slate-900">Generator Raportu Zarządczego (PDF A4 / Excel XLSX / CSV)</h3>
                    <p className="text-xs text-slate-500">
                        Zawiera pełny wykaz 100% SKU ({fmtInt(allSkus.length)} pozycji) z sumą kontrolną bez żadnego dzielenia stanów 0 vs 1–{threshold}. Kliknij nagłówek kolumny, aby posortować przed wydrukiem.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handlePrintPdf}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                    >
                        <Printer className="w-3.5 h-3.5" /> Drukuj / Zapisz PDF (A4)
                    </button>
                    <button
                        type="button"
                        onClick={onExportXlsx}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Eksportuj 8-zakładkowy .XLSX
                    </button>
                    <button
                        type="button"
                        onClick={onExportCsv}
                        className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                    >
                        <FileText className="w-3.5 h-3.5" /> Eksportuj .CSV (100% SKU)
                    </button>
                </div>
            </div>

            {/* Właściwy arkusz raportu A4 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 print:border-0 print:shadow-none print:p-0">
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Nexus ERP • Raport Zarządczy E-Commerce</div>
                        <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                            Audyt Sprzedaży, Koszyków, Ekonomii Netto i Braków Ofert ({workspaceName || 'Klient'})
                        </h2>
                        <div className="text-xs text-slate-600 mt-1">
                            Platforma: <strong>{meta.platform}</strong> • Rynek: <strong>{meta.marketFilter}</strong> • Jednolity próg wyłączenia ofert: <strong>stan &le; {threshold} szt. (BRAK W OFERCIE)</strong> • Próg Smart!: <strong>{fmtNum(meta.smartThresholdPln || 49.90, 2)} zł</strong>
                        </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                        <div>Wygenerowano: {fmtDateTime(analysis?.generatedAt)}</div>
                        <div>
                            <MetricTooltip text={METRIC_TOOLTIPS.kpiCogsCoverage}>
                                <span>Pokrycie COGS w PIM: <strong>{fmtPct(meta.cogsCoveragePct)}</strong></span>
                            </MetricTooltip>
                        </div>
                    </div>
                </div>

                {/* Podsumowanie Zarządcze KPI */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] text-slate-500"><MetricTooltip text={METRIC_TOOLTIPS.kpiGmv}><span>Obrót Zrealizowany (GMV)</span></MetricTooltip></div>
                        <div className="text-base font-bold text-slate-900">{fmtPln(kpis.totalGmvPln)}</div>
                        <div className="text-[10px] text-slate-500">Potencjał: {fmtPln(kpis.fullPotentialGmvPln)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                        <div className="text-[11px] text-rose-700"><MetricTooltip text={METRIC_TOOLTIPS.kpiLostByStockout}><span>Utracony GMV (stan &le; {threshold} szt.)</span></MetricTooltip></div>
                        <div className="text-base font-bold text-rose-800">{fmtPln(kpis.totalLostGmvPln)}</div>
                        <div className="text-[10px] text-rose-700">{fmtInt(kpis.totalStockoutDays)} dni przerw</div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                        <div className="text-[11px] text-emerald-700"><MetricTooltip text={METRIC_TOOLTIPS.kpiNetProfit}><span>Zweryfikowany Zysk Netto</span></MetricTooltip></div>
                        <div className="text-base font-bold text-emerald-800">{fmtPln(kpis.verifiedNetProfitPln)}</div>
                        <div className="text-[10px] text-emerald-700">Marża: {fmtPct(kpis.verifiedNetMarginPct)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                        <div className="text-[11px] text-indigo-700"><MetricTooltip text={METRIC_TOOLTIPS.kpiRopBudget}><span>Budżet Zatowarowania ROP</span></MetricTooltip></div>
                        <div className="text-base font-bold text-indigo-900">{fmtPln(kpis.recommendedPurchaseBudgetPln)}</div>
                        <div className="text-[10px] text-indigo-700">ROAS: {kpis.roas !== null ? `${fmtNum(kpis.roas, 2)}x` : '—'} | POAS: {kpis.poas !== null ? `${fmtNum(kpis.poas, 2)}x` : '—'}</div>
                    </div>
                </div>

                {/* Porównanie Zrealizowanego vs Utraconego GMV dla Top 25 */}
                <div>
                    <h4 className="text-xs font-bold uppercase text-slate-800 mb-2">Top 25 Produktów: Obrót Zrealizowany vs Straty przez Braki (stan &le; {threshold} szt.)</h4>
                    <div className="space-y-1.5">
                        {topCompare.map(s => {
                            const revW = Math.round(((s.totalRevenuePln || 0) / maxBarVal) * 100);
                            const lostW = Math.round(((s.totalLostGmvPln || 0) / maxBarVal) * 100);
                            return (
                                <div key={s.skuKey} className="grid grid-cols-12 items-center gap-2 text-[11px]">
                                    <div className="col-span-4 truncate font-medium text-slate-800" title={s.name}>
                                        <span className="font-mono text-slate-500 mr-1">{s.sku}</span> {s.name}
                                    </div>
                                    <div className="col-span-6 flex h-3.5 bg-slate-100 rounded overflow-hidden">
                                        <div style={{ width: `${revW}%` }} className="bg-indigo-600 h-full" title={`Obrót: ${fmtPln(s.totalRevenuePln)}`} />
                                        <div style={{ width: `${lostW}%` }} className="bg-rose-500 h-full" title={`Strata: ${fmtPln(s.totalLostGmvPln)}`} />
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-slate-700">
                                        {fmtPln(s.totalRevenuePln)} / <span className="text-rose-700">{fmtPln(s.totalLostGmvPln)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Pełny Wykaz 100% SKU z Sumą Kontrolną */}
                <div className="print:break-before-page">
                    <h4 className="text-xs font-bold uppercase text-slate-800 mb-2">
                        Pełny Wykaz Analityczny 100% SKU ({fmtInt(allSkus.length)} pozycji) z Wierszem Sumy Kontrolnej
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="min-w-full text-[11px] divide-y divide-slate-200">
                            <thead className="bg-slate-100 text-slate-700 font-semibold">
                                <tr>
                                    <SortableTh label="SKU / Nazwa" sortKey="name" defaultDirection="asc" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colProductSku} className="px-2 py-1.5" />
                                    <SortableTh label="Rola / ABC" sortKey="roleAbc" defaultDirection="asc" align="center" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colRoleAbc} className="px-2 py-1.5" />
                                    <SortableTh label="Stan (szt.)" sortKey="currentStock" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colPhysicalStock} className="px-2 py-1.5" />
                                    <SortableTh label="Szt. sprz." sortKey="totalUnits" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colUnitsSold} className="px-2 py-1.5" />
                                    <SortableTh label="GMV [PLN]" sortKey="totalRevenuePln" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colGmvPln} className="px-2 py-1.5" />
                                    <SortableTh label="Zysk Netto" sortKey="verifiedNetProfitPln" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colNetProfitSku} className="px-2 py-1.5" />
                                    <SortableTh label={`Dni braku (≤${threshold})`} sortKey="stockoutDays" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colStockoutDays} className="px-2 py-1.5" />
                                    <SortableTh label="Strata Bezp." sortKey="lostDirectPln" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colLostDirectCol} className="px-2 py-1.5" />
                                    <SortableTh label="Utr. Cross-Sell" sortKey="lostCrossSellPln" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colLostCrossCol} className="px-2 py-1.5" />
                                    <SortableTh label="Kara Trafn." sortKey="lostRelevancePln" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colLostRelevanceCol} className="px-2 py-1.5" />
                                    <SortableTh label="Strata Razem" sortKey="totalLostGmvPln" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colLostTotalGmv} className="px-2 py-1.5" />
                                    <SortableTh label="Domów ROP" sortKey="recommendedOrderQty" align="right" sortConfig={reportSort} onSort={requestReportSort} tooltip={METRIC_TOOLTIPS.colSuggestedOrder} className="px-2 py-1.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedSkus.map(s => (
                                    <tr key={s.skuKey}>
                                        <td className="px-2 py-1 max-w-[210px] truncate">
                                            <span className="font-mono text-slate-500 mr-1">{s.sku}</span>
                                            <span className="text-slate-900">{s.name}</span>
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono">{s.role} / {s.abcXyz}</td>
                                        <td className={`px-2 py-1 text-right font-mono ${s.isCurrentlyUnavailable ? 'text-rose-700 font-bold' : ''}`}>
                                            {s.currentStock ?? '—'}
                                        </td>
                                        <td className="px-2 py-1 text-right font-mono">{fmtInt(s.totalUnits)}</td>
                                        <td className="px-2 py-1 text-right font-mono">{fmtPln(s.totalRevenuePln)}</td>
                                        <td className="px-2 py-1 text-right font-mono">{s.verifiedNetProfitPln !== null ? fmtPln(s.verifiedNetProfitPln) : 'Brak COGS'}</td>
                                        <td className="px-2 py-1 text-right font-mono text-rose-700">{fmtInt(s.stockoutDays)}</td>
                                        <td className="px-2 py-1 text-right font-mono">{fmtPln(s.lostDirectPln)}</td>
                                        <td className="px-2 py-1 text-right font-mono">{fmtPln(s.lostCrossSellPln)}</td>
                                        <td className="px-2 py-1 text-right font-mono">{fmtPln(s.lostRelevancePln)}</td>
                                        <td className="px-2 py-1 text-right font-bold text-rose-700">{fmtPln(s.totalLostGmvPln)}</td>
                                        <td className="px-2 py-1 text-right font-bold text-indigo-700">{fmtInt(s.recommendedOrderQty)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-900 text-white font-bold">
                                <tr>
                                    <td className="px-2 py-2" colSpan={3}>SUMA KONTROLNA (100% SKU: {fmtInt(allSkus.length)})</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtInt(controlTotals.units)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPln(controlTotals.revenue)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPln(controlTotals.netProfit)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtInt(controlTotals.stockoutDays)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPln(controlTotals.lostDirect)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPln(controlTotals.lostCross)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPln(controlTotals.lostRelevance)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtPln(controlTotals.lostTotal)}</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtInt(controlTotals.orderQty)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
