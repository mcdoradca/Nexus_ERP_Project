import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PlayCircle, Loader2, Info, Activity, AlertOctagon, CheckCircle2, ShieldAlert, Cpu, Bot, TrendingDown, TrendingUp, RefreshCw, Layers } from 'lucide-react';

const AllegroAdsMonitor = ({ token, API_URL }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [trace, setTrace] = useState(null);
    const [error, setError] = useState(null);
    const [targetEan, setTargetEan] = useState('');

    const runTest = async () => {
        setIsLoading(true);
        setError(null);
        setTrace(null);
        try {
            const url = targetEan.trim() ? `${API_URL}/api/allegro-ads/backtest?ean=${encodeURIComponent(targetEan.trim())}` : `${API_URL}/api/allegro-ads/backtest`;
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setTrace(res.data.trace);
            } else {
                setError(res.data.error || 'Błąd testu');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const InfoTooltip = ({ text }) => (
        <div className="group relative ml-2 inline-flex">
            <Info className="w-3 h-3 text-indigo-400 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] font-bold rounded-sm shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {text}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
            <div className="bg-white border-b border-slate-200 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between p-2 px-4 md:py-2.5 gap-3">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-md flex items-center justify-center border border-indigo-100 shrink-0">
                        <Bot className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-800 leading-tight">Mózg AI (Allegro Ads)</h2>
                        <span className="text-[10px] font-medium text-slate-500">RL Backtest Monitor</span>
                    </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                    <input 
                        type="text" 
                        placeholder="EAN lub SKU (opcjonalnie)" 
                        value={targetEan}
                        onChange={(e) => setTargetEan(e.target.value)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium outline-none focus:bg-white focus:border-indigo-400 placeholder:text-slate-400 w-56 transition-all"
                    />
                    <button 
                        onClick={runTest}
                        disabled={isLoading}
                        className="flex items-center px-4 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-indigo-600 transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5 mr-1.5" />}
                        {isLoading ? 'Symulacja...' : 'Pełny Test'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-3 gap-6 content-start relative">
                {error && (
                    <div className="col-span-3 p-6 bg-rose-50 border border-rose-200 rounded-sm flex items-start space-x-4">
                        <AlertOctagon className="w-6 h-6 text-rose-600 shrink-0" />
                        <div>
                            <div className="text-sm font-black text-rose-900 uppercase tracking-widest mb-1">Błąd Krytyczny Pipeline'u</div>
                            <div className="text-xs font-bold text-rose-700 font-mono">{error}</div>
                        </div>
                    </div>
                )}

                {!trace && !isLoading && !error && (
                    <div className="col-span-3 py-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-sm bg-white">
                        <Cpu className="w-16 h-16 text-slate-300 mb-4" />
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">System Wstrzymany</h3>
                        <p className="text-xs font-bold text-slate-400 mt-2">Naciśnij przycisk "Uruchom", aby aktywować silnik testowy E2E.</p>
                    </div>
                )}

                {trace && (
                    <>
                        {/* Kolumna 1: Kroki E2E */}
                        <div className="col-span-1 space-y-4">
                            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] flex items-center mb-6">
                                <Layers className="w-4 h-4 mr-2" /> Fazy Wykonania Backtestingu
                                <InfoTooltip text="Lista kroków, jakie wykonuje środowisko - od utworzenia sztucznego konta bez płacenia (Headless), po załadowanie zysków i uruchomienie modelu AI." />
                            </h3>
                            {trace.steps.map((s, i) => (
                                <div key={i} className={`p-4 border rounded-sm flex items-center justify-between ${s.status === 'success' ? 'bg-white border-emerald-200' : s.status === 'error' ? 'bg-rose-50 border-rose-200' : s.status === 'skipped (blocked by AI)' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center space-x-3">
                                        <div className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-black ${s.status === 'success' ? 'bg-emerald-100 text-emerald-700' : s.status === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{s.step}</div>
                                        <div>
                                            <div className="text-[11px] font-black uppercase tracking-widest text-slate-800">{s.name}</div>
                                            {s.details && <div className="text-[9px] font-bold text-slate-500 mt-1">{s.details}</div>}
                                        </div>
                                    </div>
                                    {s.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                    {s.status === 'error' && <AlertOctagon className="w-4 h-4 text-rose-500" />}
                                    {s.status === 'skipped (blocked by AI)' && <ShieldAlert className="w-4 h-4 text-amber-500" />}
                                </div>
                            ))}
                        </div>

                        {/* Kolumna 2 i 3: Analityka i Decyzja */}
                        <div className="col-span-2 space-y-6">
                            {/* ROAS vs ROI Panel */}
                            {trace.unitEconomics && (
                                <div className="p-6 bg-white border border-slate-300 rounded-sm shadow-xl relative overflow-hidden">
                                    <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                    <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] flex items-center mb-6">
                                        <Activity className="w-4 h-4 mr-2" /> Unit Economics (Prawdziwe ROI)
                                        <InfoTooltip text="Algorytm Mózgu nie używa ROASu jako wskaźnika sukcesu. Poniżej widać matematykę operacyjną, która wylicza prawdziwy zysk netto przed podjęciem decyzji o stawce." />
                                    </h3>
                                    
                                    <div className="grid grid-cols-3 gap-6 mb-8">
                                        <div>
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center">ROAS Modelu RL <InfoTooltip text="Obliczany na podstawie testów, a nie fikcyjnego wskaźnika Allegro." /></div>
                                            <div className="text-2xl font-black text-slate-400">{Number(trace.kpi.rateOfReturn || 0).toFixed(2)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center">Obecny Koszt Pozyskania <InfoTooltip text="Rzeczywisty koszt jednej konwersji wynikający ze straconych pieniędzy na Ads." /></div>
                                            <div className="text-2xl font-black text-rose-600">{Number(trace.unitEconomics.currentCpaNet || 0).toFixed(2)} PLN</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1 flex items-center">Max Dopuszczalne CPA <InfoTooltip text="Maksymalna granica, ile można wydać za konwersję (Ads), aby nie spaść poniżej wymaganej przez firmę rentowności netto." /></div>
                                            <div className="text-2xl font-black text-indigo-600">{Number(trace.unitEconomics.economics.maxCpaNet || 0).toFixed(2)} PLN</div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-sm p-4 border border-slate-200">
                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Wpływ ze sprzedaży Netto:</span>
                                            <span className="text-xs font-bold text-slate-800">{Number(trace.unitEconomics.economics.netRevenue || 0).toFixed(2)} PLN</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Koszty Towaru (COGS):</span>
                                            <span className="text-xs font-bold text-rose-600">-{Number(trace.unitEconomics.economics.costs.cogs || 0).toFixed(2)} PLN</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Prowizje i Ukryte (Allegro, Smart):</span>
                                            <span className="text-xs font-bold text-rose-600">-{Number(trace.unitEconomics.economics.costs.allegroCommissions || 0).toFixed(2)} PLN</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2">
                                            <span className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Zysk Organiczny (przed Ads):</span>
                                            <span className="text-sm font-black text-emerald-700">{Number(trace.unitEconomics.economics.organicNetProfit || 0).toFixed(2)} PLN</span>
                                        </div>
                                    </div>
                                    
                                    {trace.unitEconomics.isBleeding ? (
                                        <div className="mt-4 p-3 bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest rounded-sm border border-rose-200 flex items-center">
                                            <TrendingDown className="w-4 h-4 mr-2" /> Alarm: Oferta krwawi operacyjnie! Kill-Switch gotowy do użycia.
                                        </div>
                                    ) : (
                                        <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-sm border border-emerald-200 flex items-center">
                                            <TrendingUp className="w-4 h-4 mr-2" /> Status: Stabilny. Koszty mieszczą się w docelowej marży.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Macierz Decyzyjna */}
                            {trace.decision && (
                                <div className="p-6 bg-slate-900 border border-slate-800 rounded-sm shadow-2xl relative overflow-hidden">
                                    <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none"><Cpu className="w-64 h-64 -mb-16 -mr-16" /></div>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center mb-6 relative z-10">
                                        <Bot className="w-4 h-4 mr-2" /> Ostateczny Werdykt Algorytmu
                                        <InfoTooltip text="Finalna decyzja przetworzona przez silnik po przejściu przez tarcze bezpieczeństwa, predykcje XGBoost (godziny) oraz Reinforcement Learning (Q-Learning)." />
                                    </h3>
                                    
                                    <div className="grid grid-cols-2 gap-6 relative z-10 mb-6">
                                        <div>
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Wybrana Strategia</div>
                                            <div className="text-xl font-black text-white">{trace.decision.strategy}</div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Akcja Wykonawcza</div>
                                            <div className={`text-xl font-black ${trace.decision.action === 'BLOCK' || trace.decision.action === 'KILL_SWITCH' ? 'text-rose-500' : 'text-emerald-400'}`}>
                                                {trace.decision.action}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-4 relative z-10 p-4 bg-black/40 rounded-sm border border-white/10">
                                        <div>
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Zaproponowane CPC</div>
                                            <div className="text-lg font-black text-indigo-400">{trace.decision.suggestedMaxCpc} PLN</div>
                                        </div>
                                        {trace.decision.suggestedMaxCpm && (
                                            <div>
                                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Sugerowane CPM</div>
                                                <div className="text-lg font-black text-pink-400">{trace.decision.suggestedMaxCpm} PLN</div>
                                            </div>
                                        )}
                                        <div>
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Eksploracja Q-Learning <InfoTooltip text="Ruch agenta ukształtowany na bazie Epsilon-Greedy (Bellman). Algorytm sprawdza elastyczność stawki względem zysku." /></div>
                                            <div className="text-lg font-black text-slate-200">{trace.decision.qLearningAction || 'N/A'}</div>
                                        </div>
                                    </div>
                                    
                                    {trace.decision.reason && (
                                        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-sm text-xs font-bold text-slate-300 relative z-10">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Powód odrzucenia (Pre-flight Audit):</span>
                                            {trace.decision.reason}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Raw Logs */}
                            <div className="bg-slate-900 rounded-sm border border-slate-800 overflow-hidden shadow-2xl">
                                <div className="p-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
                                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Pełny Zrzut Terminala</h3>
                                    <RefreshCw className="w-3 h-3 text-slate-600" />
                                </div>
                                <div className="p-4 h-64 overflow-y-auto custom-scrollbar font-mono text-[10px] text-emerald-400 bg-[#0a0a0a] leading-relaxed">
                                    {trace.logs.map((log, idx) => (
                                        <div key={idx} className="whitespace-pre-wrap mb-1">{log}</div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AllegroAdsMonitor;
