import React, { useState, useEffect } from 'react';
import { 
    PlayCircle, Loader2, Info, TrendingUp, Anchor, AlertTriangle, 
    ShieldCheck, Bot, BarChart3, PackageOpen, Layers, Zap
} from 'lucide-react';

import axios from 'axios';

const InfoTooltip = ({ text }) => (
    <div className="group relative ml-2 inline-flex">
        <Info className="w-3 h-3 text-indigo-400 cursor-help" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] font-bold rounded-sm shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
        </div>
    </div>
);

const PortfolioManagerView = ({ token, API_URL }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [portfolioData, setPortfolioData] = useState(null);
    const [error, setError] = useState(null);
    const [executingIdx, setExecutingIdx] = useState(null);
    const [execResults, setExecResults] = useState({});
    
    // Stany dla Strażników (Sentinels)
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResults, setAuditResults] = useState(null);

    // FAZA 1 - Pamięć podręczna (Cache)
    useEffect(() => {
        const loadCachedState = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/portfolio/state`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data.success && res.data.data) {
                    setPortfolioData(res.data.data);
                }
            } catch (err) {
                console.error("Nie udało się załadować stanu z pamięci podręcznej", err);
            }
        };
        loadCachedState();
    }, [API_URL, token]);

    const executeAction = async (action, idx) => {
        setExecutingIdx(idx);
        try {
            const res = await axios.post(`${API_URL}/api/portfolio/execute`, { action }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setExecResults(prev => ({ ...prev, [idx]: { status: 'success', message: res.data.data.message } }));
            } else {
                setExecResults(prev => ({ ...prev, [idx]: { status: 'error', message: res.data.error } }));
            }
        } catch (err) {
            setExecResults(prev => ({ ...prev, [idx]: { status: 'error', message: err.response?.data?.error || err.message } }));
        } finally {
            setExecutingIdx(null);
        }
    };

    const runAnalysis = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${API_URL}/api/portfolio/analyze`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setPortfolioData(res.data.data);
            } else {
                setError(res.data.error || 'Błąd analizy');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const runSentinelAudit = async () => {
        setIsAuditing(true);
        setAuditResults(null);
        try {
            const res = await axios.post(`${API_URL}/api/portfolio/sentinel-audit`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setAuditResults(res.data.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsAuditing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
            {/* Kompaktowy Nagłówek */}
            <div className="bg-white border-b border-slate-200 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-md flex items-center justify-center border border-indigo-100 shrink-0">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-800 leading-tight">Portfolio Manager</h2>
                        <span className="text-[10px] font-medium text-slate-500">God-Mode Analytics (CMO AI)</span>
                    </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                    {/* Status Strażnika Smarta */}
                    <div className="flex items-center px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-md">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
                        <div>
                            <div className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide leading-none">Strażnik Smarta</div>
                            <div className="text-[9px] font-medium text-emerald-600">Audyt Nocny: Bezpieczny</div>
                        </div>
                    </div>

                    <button 
                        onClick={runSentinelAudit}
                        disabled={isAuditing}
                        className="flex items-center px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-md hover:bg-rose-100 transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isAuditing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />}
                        {isAuditing ? 'Audytowanie...' : 'Wymuś Audyt'}
                    </button>

                    <button 
                        onClick={runAnalysis}
                        disabled={isLoading}
                        className="flex items-center px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5 mr-1.5" />}
                        {isLoading ? 'Analiza Koszyków...' : 'Skan (Odśwież)'}
                    </button>
                </div>
            </div>

            {/* Pasek Wyników Audytu Strażników */}
            {auditResults && (
                <div className="bg-slate-900 border-b-4 border-rose-500 p-4 shrink-0 flex justify-center space-x-8">
                    <div className="flex items-center text-white">
                        <ShieldCheck className="w-5 h-5 text-emerald-400 mr-3" />
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Purity Guard</div>
                            <div className="text-sm font-bold">Przeskanowano: {auditResults.dataPurity?.scanned} | Zablokowano: <span className={auditResults.dataPurity?.violations > 0 ? "text-rose-400 font-black" : "text-emerald-400"}>{auditResults.dataPurity?.violations}</span></div>
                        </div>
                    </div>
                    <div className="w-px bg-slate-700"></div>
                    <div className="flex items-center text-white">
                        <AlertTriangle className="w-5 h-5 text-amber-400 mr-3" />
                        <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margin Overseer</div>
                            <div className="text-sm font-bold">Skontrolowano: {auditResults.marginOverseer?.checked} | Wstrzymano: <span className={auditResults.marginOverseer?.frozen > 0 ? "text-rose-400 font-black" : "text-emerald-400"}>{auditResults.marginOverseer?.frozen}</span></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Obszar Roboczy */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {error && (
                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md flex items-start space-x-2 text-rose-700 text-xs shadow-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="font-mono">{error}</div>
                    </div>
                )}

                {!portfolioData && !isLoading && (
                    <div className="py-20 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg bg-white shadow-sm">
                        <Layers className="w-12 h-12 text-slate-300 mb-3" />
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Wymagany Skan Portfela</h3>
                        <p className="text-xs font-medium text-slate-400 mt-1">Naciśnij przycisk, aby pobrać zamówienia i odpalić algorytmy Apriori.</p>
                    </div>
                )}

                {portfolioData && (
                    <div className="space-y-4">
                        {/* Metryki Główne */}
                        <div className="grid grid-cols-4 gap-3">
                            <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">Przeanalizowane Zamówienia</div>
                                <div className="text-xl font-bold text-slate-800">{portfolioData.totalOrdersAnalyzed}</div>
                            </div>
                            <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">Skatalogowane SKU</div>
                                <div className="text-xl font-bold text-slate-800">{portfolioData.totalSkus}</div>
                            </div>
                            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg shadow-sm">
                                <div className="text-[10px] font-medium text-indigo-600 uppercase tracking-wide mb-1">Znalezione Reguły (Zestawy)</div>
                                <div className="text-xl font-bold text-indigo-700">{portfolioData.rulesDiscovered}</div>
                            </div>
                            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-md">
                                <div className="text-[10px] font-medium text-emerald-400 uppercase tracking-wide mb-1 flex items-center">
                                    <Bot className="w-3 h-3 mr-1" /> Wygenerowane Akcje CMO
                                </div>
                                <div className="text-xl font-bold text-white">{portfolioData.recommendations.length} gotowych</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            {/* Lewa kolumna: Rekomendacje AI */}
                            <div className="col-span-1 space-y-4">
                                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                                    <Zap className="w-4 h-4 mr-2 text-amber-500" /> Rekomendacje AI (Do akceptacji)
                                </h3>
                                
                                {portfolioData.recommendations.map((rec, idx) => (
                                    <div key={idx} className="p-4 bg-white border border-slate-200 rounded-sm shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-colors">
                                        <div className={`absolute top-0 left-0 w-1 h-full ${rec.type === 'PROTECT_CPC' ? 'bg-emerald-500' : rec.type === 'CREATE_VIRTUAL_BUNDLE' ? 'bg-indigo-500' : 'bg-rose-500'}`}></div>
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">EAN: {rec.targetEan || 'MULTI'}</div>
                                        <p className="text-[11px] font-bold text-slate-700 leading-relaxed mb-4">{rec.message}</p>
                                        
                                        {execResults[idx] ? (
                                            <div className={`p-2 text-[9px] font-black uppercase tracking-widest rounded-sm ${execResults[idx].status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                                {execResults[idx].status === 'success' ? '✅ Wykonano: ' : '❌ Błąd: '} {execResults[idx].message}
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => executeAction(rec, idx)}
                                                disabled={executingIdx === idx}
                                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-black uppercase tracking-widest rounded-sm transition-colors disabled:opacity-50 flex items-center justify-center"
                                            >
                                                {executingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Zap className="w-3 h-3 mr-2" />}
                                                Zatwierdź Akcję (Exec)
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Prawa kolumna: Podgląd Kategoryzacji */}
                            <div className="col-span-2 space-y-4">
                                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
                                    <Layers className="w-4 h-4 mr-2 text-slate-500" /> Macierz Asortymentu
                                </h3>
                                
                                <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Kategoria AI</th>
                                                <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Produkt</th>
                                                <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Sprzedaż (30d)</th>
                                                <th className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Zapas</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {portfolioData.portfolio.map((item, idx) => (
                                                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                                                    <td className="p-3">
                                                        {item.category === 'LOKOMOTYWA' && <span className="inline-flex items-center px-2 py-1 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-widest rounded-sm"><TrendingUp className="w-3 h-3 mr-1"/> LOKOMOTYWA</span>}
                                                        {item.category === 'WAGON' && <span className="inline-flex items-center px-2 py-1 bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-widest rounded-sm"><Anchor className="w-3 h-3 mr-1"/> WAGON</span>}
                                                        {item.category === 'ŚPIOCH' && <span className="inline-flex items-center px-2 py-1 bg-rose-100 text-rose-800 text-[9px] font-black uppercase tracking-widest rounded-sm"><AlertTriangle className="w-3 h-3 mr-1"/> ŚPIOCH</span>}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="text-xs font-bold text-slate-800">{item.name}</div>
                                                        <div className="text-[9px] font-bold text-slate-400 mt-0.5">{item.rationale}</div>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="text-xs font-black text-slate-800">{item.soldLastPeriod} szt.</div>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="text-xs font-black text-slate-600">{item.stock} szt.</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PortfolioManagerView;
