import React, { useState, useEffect } from 'react';
import { 
    Activity, ShieldAlert, Crosshair, BarChart3, TrendingUp, Search, 
    Droplet, Percent, Zap, AlertTriangle, ChevronRight, Layers, ArrowRight, Bot
} from 'lucide-react';
import axios from 'axios';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
    Legend, ResponsiveContainer, Cell, AreaChart, Area, ComposedChart, Line
} from 'recharts';

const GodModeAnalyticsView = ({ token, API_URL }) => {
    const [skuInput, setSkuInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [error, setError] = useState(null);

    const fetchReport = async (targetSku = '') => {
        setIsLoading(true);
        setError(null);
        setReport(null);
        try {
            const url = targetSku ? `${API_URL}/api/analytics/god-mode/${targetSku}` : `${API_URL}/api/analytics/god-mode`;
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setReport(res.data.data);
            } else {
                setError(res.data.error || 'Wystąpił błąd podczas analizy PIM.');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Inicjalnie ładujemy dla całego portfela
        fetchReport();
    }, [API_URL, token]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchReport(skuInput);
    };

    return (
        <div className="flex flex-col h-full bg-[#0b0f19] overflow-hidden relative font-sans text-slate-300">
            {/* Header Mroczny (Hakerski) */}
            <div className="p-6 border-b border-slate-800 bg-[#0f1523] flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-rose-600 rounded-sm flex items-center justify-center shadow-[0_0_20px_rgba(225,29,72,0.3)]">
                        <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Nexus Sentinel</h2>
                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">God-Mode Analytics (Dowody ROI)</span>
                    </div>
                </div>
                
                <form onSubmit={handleSearch} className="flex items-center space-x-2">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="Wpisz EAN / SKU..." 
                            value={skuInput}
                            onChange={(e) => setSkuInput(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-xs px-10 py-3 w-64 focus:outline-none focus:border-rose-500 transition-colors"
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-3 bg-rose-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Analizowanie...' : 'Skanuj'}
                    </button>
                </form>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {error && (
                    <div className="p-6 bg-rose-950/30 border-l-4 border-rose-600 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10"><ShieldAlert className="w-24 h-24" /></div>
                        <h3 className="text-rose-500 font-black uppercase tracking-widest text-sm flex items-center mb-2">
                            <AlertTriangle className="w-4 h-4 mr-2" /> Blokada Analityki: Rygor Danych
                        </h3>
                        <div className="text-slate-300 text-xs font-bold leading-relaxed max-w-3xl">
                            {error.includes('PIM_') ? (
                                <>
                                    <span className="text-white block mb-2">{error.split(':').length > 1 ? error.split(':')[1] : error}</span>
                                    <span className="text-rose-400">Akcja wymagana: Przejdź do modułu PIM i uzupełnij bazę kosztową, aby Nexus mógł wyliczyć prawdziwe Unit Economics bez opierania się na estymacjach.</span>
                                </>
                            ) : error}
                        </div>
                    </div>
                )}

                {isLoading && !report && (
                    <div className="py-32 flex flex-col items-center justify-center">
                        <Activity className="w-16 h-16 text-rose-600 animate-pulse mb-4" />
                        <h3 className="text-sm font-black text-rose-500 uppercase tracking-widest">Dekonstrukcja Prawdy...</h3>
                    </div>
                )}

                {report && (
                    <>
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                                    Analizowany Cel:
                                    {report.productDetails.dataSource === 'PIM_VERIFIED' && (
                                        <span className="ml-3 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-2 py-0.5 rounded-sm text-[9px] flex items-center">
                                            <ShieldAlert className="w-3 h-3 mr-1" /> PIM: 100% ZWERYFIKOWANE KOSZTY
                                        </span>
                                    )}
                                </div>
                                <div className="text-2xl font-black text-white uppercase">{report.productDetails.sku}</div>
                                <div className="text-xs text-slate-400 mt-1">{report.productDetails.name}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Incremental ROAS (iROAS)</div>
                                <div className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">{report.metrics.iRoas}%</div>
                            </div>
                        </div>

                        {/* Karty KPI */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-[#131b2c] p-5 border-l-2 border-emerald-500 shadow-xl">
                                <div className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest mb-2 flex items-center">
                                    <BarChart3 className="w-3 h-3 mr-2" /> True Net Margin
                                </div>
                                <div className="text-2xl font-black text-emerald-400">{report.metrics.trueNetMarginPct}%</div>
                                <div className="text-[9px] text-slate-500 uppercase mt-2">Zysk na czysto (po odliczeniu Ads, BDO, Kartonu)</div>
                            </div>
                            
                            <div className="bg-[#131b2c] p-5 border-l-2 border-indigo-500 shadow-xl">
                                <div className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest mb-2 flex items-center">
                                    <Layers className="w-3 h-3 mr-2" /> Tradycyjny ROAS
                                </div>
                                <div className="text-2xl font-black text-indigo-400">{report.metrics.standardRoas}%</div>
                                <div className="text-[9px] text-slate-500 uppercase mt-2">Mylny wskaźnik uwzględniający organicę</div>
                            </div>

                            <div className="bg-[#131b2c] p-5 border-l-2 border-amber-500 shadow-xl">
                                <div className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest mb-2 flex items-center">
                                    <Crosshair className="w-3 h-3 mr-2" /> Zysk Bezpośredni (Solo)
                                </div>
                                <div className="text-2xl font-black text-amber-400">{report.metrics.directProfit} PLN</div>
                                <div className="text-[9px] text-slate-500 uppercase mt-2">Zysk z konkretnego kliknięcia w reklamę</div>
                            </div>

                            <div className="bg-[#0b0f19] p-5 border-l-2 border-slate-700 shadow-xl opacity-80">
                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center">
                                    <TrendingUp className="w-3 h-3 mr-2 text-slate-600" /> Zysk Halo (Cross-sell)
                                </div>
                                <div className="text-xl font-black text-slate-500">BRAK DANYCH</div>
                                <div className="text-[9px] text-slate-600 uppercase mt-2">Wymagana integracja Data Warehouse</div>
                            </div>
                        </div>

                        {/* Wykresy i Dowody */}
                        <div className="grid grid-cols-2 gap-6 mt-6">
                            
                            {/* Wodospad Prawdy */}
                            <div className="bg-[#131b2c] p-6 border border-slate-800 shadow-xl relative">
                                <div className="absolute top-0 right-0 bg-rose-600 text-[9px] font-black uppercase text-white px-3 py-1">Dowód nr 1</div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1 flex items-center">
                                    <Droplet className="w-4 h-4 mr-2 text-indigo-500" /> Wodospad Kosztów (Unit Economics)
                                </h3>
                                <p className="text-[10px] text-slate-400 mb-6 uppercase tracking-wider">Demaskujemy ukryte opłaty przed Zarządem</p>
                                
                                <div className="w-full" style={{ minWidth: 0, height: '250px' }}>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <BarChart data={report.waterfall} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                            <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickMargin={10} interval={0} angle={-25} textAnchor="end" />
                                            <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `${v}zł`} />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#0f1523', borderColor: '#334155', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                                                itemStyle={{ color: '#fff' }}
                                                formatter={(value) => [`${value.toFixed(2)} PLN`, 'Wartość']}
                                            />
                                            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                                                {report.waterfall.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Efekt Kanibalizacji */}
                            <div className="bg-[#131b2c] p-6 border border-slate-800 shadow-xl relative">
                                <div className="absolute top-0 right-0 bg-rose-600 text-[9px] font-black uppercase text-white px-3 py-1">Dowód nr 2</div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1 flex items-center">
                                    <Activity className="w-4 h-4 mr-2 text-rose-500" /> Wskaźnik Kanibalizacji Zestawów
                                </h3>
                                <p className="text-[10px] text-slate-400 mb-6 uppercase tracking-wider">Czy Zestaw pożarł sprzedaż Pojedynczej oferty?</p>

                                {report.cannibalizationData ? (
                                    <div className="w-full" style={{ minWidth: 0, height: '250px' }}>
                                        <ResponsiveContainer width="100%" height={250}>
                                            <AreaChart data={report.cannibalizationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                                <XAxis dataKey="week" stroke="#64748b" fontSize={10} tickMargin={10} />
                                                <YAxis stroke="#64748b" fontSize={10} />
                                                <RechartsTooltip 
                                                    contentStyle={{ backgroundColor: '#0f1523', borderColor: '#334155', color: '#fff', fontSize: '11px' }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                <Area type="monotone" dataKey="soloVol" name="Sprzedaż Solo" stackId="1" stroke="#3b82f6" fill="#1d4ed8" fillOpacity={0.4} />
                                                <Area type="monotone" dataKey="bundleVol" name="Sprzedaż w Zestawie" stackId="1" stroke="#10b981" fill="#047857" fillOpacity={0.4} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="w-full h-[250px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-sm bg-[#0a0f18] mt-4">
                                        <Layers className="w-8 h-8 text-slate-700 mb-2" />
                                        <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Brak Danych Historycznych</div>
                                        <div className="text-[9px] font-bold text-slate-500 text-center max-w-xs mt-1">System nie zgaduje. Wymagane podpięcie pełnych koszyków z Data Warehouse do wyliczenia spadku wolumenu ofert.</div>
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Podsumowanie dla Zarządu (Nexus Narrative) */}
                        <div className="bg-[#0f1523] border border-slate-700 p-6 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 group-hover:bg-rose-500 transition-colors"></div>
                            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center">
                                <Bot className="w-4 h-4 mr-2" /> Raport Gotowy dla Sceptyków (Narracja AI)
                            </h3>
                            
                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">Zarzut: "Reklama nie zarabia"</div>
                                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                                        <ArrowRight className="inline w-3 h-3 text-rose-500 mr-1"/> {report.nexusNarrative.haloEffect}
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">Zarzut: "To ruch organiczny"</div>
                                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                                        <ArrowRight className="inline w-3 h-3 text-emerald-500 mr-1"/> {report.nexusNarrative.iroas}
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">Zarzut: "Kanibalizacja Zestawów"</div>
                                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                                        <ArrowRight className="inline w-3 h-3 text-indigo-500 mr-1"/> {report.nexusNarrative.cannibalization}
                                    </p>
                                </div>
                            </div>
                        </div>

                    </>
                )}
            </div>
        </div>
    );
};

export default GodModeAnalyticsView;
