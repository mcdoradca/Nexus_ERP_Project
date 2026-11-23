import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
    TrendingUp, RefreshCw, FileSpreadsheet, FileText,
    BarChart3, PackageX, ShoppingBag, Activity, Database, Printer
} from 'lucide-react';
import { PLATFORM_TABS, MARKET_OPTIONS, downloadBlobFile } from './formatters';
import OverviewTab from './OverviewTab';
import InventoryProcurementTab from './InventoryProcurementTab';
import BasketPortfolioTab from './BasketPortfolioTab';
import PlatformDetailsTab from './PlatformDetailsTab';
import DataSourcesTab from './DataSourcesTab';
import BoardReportTab from './BoardReportTab';
import SkuDeepDiveModal from './SkuDeepDiveModal';
import MetricTooltip from './MetricTooltip';
import { METRIC_TOOLTIPS } from './metricTooltips';

const SUB_TABS = [
    { id: 'overview', label: 'Przegląd i Decyzje', icon: BarChart3 },
    { id: 'inventory', label: 'Magazyn, Braki i ROP', icon: PackageX },
    { id: 'baskets', label: 'Koszyki i Portfolio', icon: ShoppingBag },
    { id: 'platforms', label: 'Diagnostyka Platform', icon: Activity },
    { id: 'sources', label: 'Źródła API i CSV', icon: Database },
    { id: 'report', label: 'Raport Zarządu (PDF/XLSX)', icon: Printer }
];

export default function SalesIntelligenceView({ token, API_URL, activeWorkspace, onOpenProduct }) {
    const [activePlatform, setActivePlatform] = useState('ALL');
    const [activeSubTab, setActiveSubTab] = useState('overview');

    const [marketFilter, setMarketFilter] = useState('ALL');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [stockoutThreshold, setStockoutThreshold] = useState(2);
    const [smartThresholdPln, setSmartThresholdPln] = useState(49.90);
    const [leadTimeDays, setLeadTimeDays] = useState(14);

    const [analysis, setAnalysis] = useState(null);
    const [statusData, setStatusData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [selectedSku, setSelectedSku] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    const queryParams = useMemo(() => {
        const params = {
            platform: activePlatform,
            marketFilter,
            stockoutThreshold: Number.isFinite(Number(stockoutThreshold)) ? Number(stockoutThreshold) : 2,
            smartThresholdPln: Number(smartThresholdPln) > 0 ? Number(smartThresholdPln) : 49.90,
            leadTimeDays: Number(leadTimeDays) > 0 ? Number(leadTimeDays) : 14
        };
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        return params;
    }, [activePlatform, marketFilter, dateFrom, dateTo, stockoutThreshold, smartThresholdPln, leadTimeDays]);

    const fetchAllData = useCallback(async () => {
        const headers = { Authorization: `Bearer ${token}` };
        const [dashRes, statRes] = await Promise.all([
            axios.get(`${API_URL}/api/sales-intelligence/dashboard`, { params: queryParams, headers }),
            axios.get(`${API_URL}/api/sales-intelligence/status`, { headers })
        ]);
        return { dash: dashRes.data, status: statRes.data };
    }, [API_URL, token, queryParams]);

    useEffect(() => {
        let cancelled = false;
        async function initialLoad() {
            try {
                const { dash, status } = await fetchAllData();
                if (!cancelled) {
                    setAnalysis(dash);
                    setStatusData(status);
                    setLoadError(null);
                    setIsLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setLoadError(err.response?.data?.error || err.message || 'Błąd ładowania centrum analityki.');
                    setIsLoading(false);
                }
            }
        }
        initialLoad();
        return () => {
            cancelled = true;
        };
    }, [fetchAllData]);

    const handleManualRefresh = async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const { dash, status } = await fetchAllData();
            setAnalysis(dash);
            setStatusData(status);
        } catch (err) {
            setLoadError(err.response?.data?.error || err.message || 'Błąd odświeżania danych.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportXlsx = async () => {
        setIsExporting(true);
        try {
            const res = await axios.get(`${API_URL}/api/sales-intelligence/export/xlsx`, {
                params: queryParams,
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const dt = new Date().toISOString().slice(0, 10);
            downloadBlobFile(res.data, `Nexus_Sales_Intelligence_${activePlatform.toLowerCase()}_${dt}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } catch (err) {
            setLoadError(err.response?.data?.error || err.message || 'Błąd eksportu .XLSX');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportCsv = async () => {
        setIsExporting(true);
        try {
            const res = await axios.get(`${API_URL}/api/sales-intelligence/export/csv`, {
                params: queryParams,
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const dt = new Date().toISOString().slice(0, 10);
            downloadBlobFile(res.data, `Nexus_Sales_Intelligence_${activePlatform.toLowerCase()}_${dt}.csv`, 'text/csv;charset=utf-8');
        } catch (err) {
            setLoadError(err.response?.data?.error || err.message || 'Błąd eksportu .CSV');
        } finally {
            setIsExporting(false);
        }
    };

    const hasAnyOrders = (analysis?.dataCounts?.rawOrdersCount || 0) > 0 || (analysis?.skus || []).length > 0;

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Górny pasek modułu i wyboru platformy */}
            <div className="print:hidden bg-white border-b border-slate-200 px-6 py-4 shrink-0">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900">
                                Centrum Analityki Sprzedaży i Zatowarowania PRO
                            </h1>
                            <p className="text-xs text-slate-500">
                                Klient: <strong>{activeWorkspace?.name || 'Domyślny'}</strong> • Próg wyłączenia ofert: <strong>stan &le; {stockoutThreshold} szt. = BRAK W OFERCIE</strong> • Próg Smart!: <strong>{Number(smartThresholdPln).toFixed(2)} zł</strong>
                            </p>
                        </div>
                    </div>

                    {/* Switcher platform */}
                    <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
                        {PLATFORM_TABS.map(pt => (
                            <button
                                key={pt.id}
                                type="button"
                                onClick={() => setActivePlatform(pt.id)}
                                title={pt.desc}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activePlatform === pt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                {pt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Globalny pasek parametrów & eksportów */}
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                                <MetricTooltip text={METRIC_TOOLTIPS.filterMarket}>Rynek / Waluta</MetricTooltip>
                            </label>
                            <select
                                value={marketFilter}
                                onChange={e => setMarketFilter(e.target.value)}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                            >
                                {MARKET_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Od dnia</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Do dnia</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                                <MetricTooltip text={METRIC_TOOLTIPS.filterStockoutThreshold}>Próg braku (≤ szt.)</MetricTooltip>
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={50}
                                value={stockoutThreshold}
                                onChange={e => setStockoutThreshold(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-20 bg-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                                <MetricTooltip text={METRIC_TOOLTIPS.filterSmartThreshold}>Próg Smart! (zł)</MetricTooltip>
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                min={1}
                                value={smartThresholdPln}
                                onChange={e => setSmartThresholdPln(Number(e.target.value) || 49.90)}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-24 bg-white font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                                <MetricTooltip text={METRIC_TOOLTIPS.filterLeadTime}>Lead Time (dni)</MetricTooltip>
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={120}
                                value={leadTimeDays}
                                onChange={e => setLeadTimeDays(Math.max(1, Number(e.target.value) || 14))}
                                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-20 bg-white font-mono"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Odśwież
                        </button>
                        <button
                            type="button"
                            onClick={handleExportXlsx}
                            disabled={isExporting || !analysis}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX (8 ark.)
                        </button>
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={isExporting || !analysis}
                            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                        >
                            <FileText className="w-3.5 h-3.5" /> CSV
                        </button>
                    </div>
                </div>

                {/* Nawigacja pod-zakładek */}
                <div className="mt-4 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
                    {SUB_TABS.map(st => {
                        const Icon = st.icon;
                        const active = activeSubTab === st.id;
                        return (
                            <button
                                key={st.id}
                                type="button"
                                onClick={() => setActiveSubTab(st.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                <Icon className="w-3.5 h-3.5" /> {st.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Treść główna */}
            <div className="flex-1 overflow-y-auto p-6">
                {loadError && (
                    <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                        {loadError}
                    </div>
                )}

                {isLoading && !analysis ? (
                    <div className="py-16 text-center text-xs text-slate-500">
                        Ładowanie Centrum Analityki Sprzedaży...
                    </div>
                ) : (
                    <>
                        {!hasAnyOrders && activeSubTab !== 'sources' && (
                            <div className="mb-6 bg-white rounded-xl border border-indigo-200 p-6 text-center shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900">Brak danych sprzedażowych dla tego klienta w bazie analitycznej</h3>
                                <p className="text-xs text-slate-600 mt-1 max-w-xl mx-auto">
                                    Przejdź do zakładki <strong>Źródła API i CSV</strong>, aby pobrać zamówienia i oferty z API (BaseLinker / Allegro / InPost Von Halsky) lub wgrać eksport archiwalny CSV/XLSX z Base.com oraz Allegro Ads.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setActiveSubTab('sources')}
                                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                                >
                                    Przejdź do Źródeł API i CSV
                                </button>
                            </div>
                        )}

                        {activeSubTab === 'overview' && (
                            <OverviewTab analysis={analysis} onSelectSku={setSelectedSku} onOpenProduct={onOpenProduct} />
                        )}
                        {activeSubTab === 'inventory' && (
                            <InventoryProcurementTab analysis={analysis} onSelectSku={setSelectedSku} onOpenProduct={onOpenProduct} />
                        )}
                        {activeSubTab === 'baskets' && (
                            <BasketPortfolioTab analysis={analysis} onSelectSku={setSelectedSku} onOpenProduct={onOpenProduct} />
                        )}
                        {activeSubTab === 'platforms' && (
                            <PlatformDetailsTab analysis={analysis} onSelectSku={setSelectedSku} />
                        )}
                        {activeSubTab === 'sources' && (
                            <DataSourcesTab API_URL={API_URL} token={token} statusData={statusData} onRefreshAll={handleManualRefresh} />
                        )}
                        {activeSubTab === 'report' && (
                            <BoardReportTab
                                analysis={analysis}
                                workspaceName={activeWorkspace?.name}
                                onExportXlsx={handleExportXlsx}
                                onExportCsv={handleExportCsv}
                            />
                        )}
                    </>
                )}
            </div>

            {selectedSku && (
                <SkuDeepDiveModal
                    API_URL={API_URL}
                    token={token}
                    skuOrEan={selectedSku}
                    queryParams={queryParams}
                    onClose={() => setSelectedSku(null)}
                    onOpenProduct={onOpenProduct}
                />
            )}
        </div>
    );
}
