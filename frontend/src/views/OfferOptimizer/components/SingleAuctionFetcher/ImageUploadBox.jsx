import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, CheckCircle2, Search, DatabaseZap, ShieldCheck, Cpu, Database, Fingerprint } from 'lucide-react';

export const ImageUploadBox = ({ onAnalysisComplete, socket }) => {
    const [ean, setEan] = useState('');
    const [status, setStatus] = useState('IDLE'); // IDLE | THINKING | SUCCESS
    const [lastError, setLastError] = useState(null);
    const [progress, setProgress] = useState(0);

    // Animacja fałszywego postępu (do wizualizacji potoku)
    useEffect(() => {
        let interval;
        if (status === 'THINKING') {
            setProgress(0);
            interval = setInterval(() => {
                setProgress(p => {
                    if (p >= 95) return p;
                    // Skok postępu malejący z czasem
                    const increment = Math.max(1, (95 - p) / 10); 
                    return p + increment;
                });
            }, 1000);
        } else if (status === 'SUCCESS') {
            setProgress(100);
            if (interval) clearInterval(interval);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [status]);

    // Odbieranie asynchronicznych powiadomień z backendu po zakończeniu potoku EAN Pipeline
    useEffect(() => {
        if (!socket) return;
        const handler = (data) => {
            // Upewniamy się, że event dotyczy naszego aktualnego EAN-u (i zignoruj wielkość liter)
            if (data.type === 'PIPELINE_COMPLETE' && String(data.ean) === String(ean).trim()) {
                setStatus('SUCCESS');
                setLastError(null);
                setTimeout(() => {
                    if (onAnalysisComplete) onAnalysisComplete(data.result);
                }, 800);
            } else if (data.type === 'PIPELINE_ERROR' && String(data.ean) === String(ean).trim()) {
                setStatus('IDLE');
                setLastError(data.error || 'Wystąpił nieoczekiwany błąd podczas pracy potoku.');
            }
        };
        socket.on('nexus-notification', handler);
        return () => socket.off('nexus-notification', handler);
    }, [socket, ean, onAnalysisComplete]);

    const handleAnalyze = async (e) => {
        e.preventDefault();
        let extractedId = ean.trim();

        if (!extractedId || !/^\d{8,14}$/.test(extractedId)) {
             setLastError("Podaj poprawny kod EAN (8-14 cyfr).");
             return;
        }
        
        setStatus('THINKING');
        setLastError(null);
        
        try {
            const token = localStorage.getItem('aps_token') || '';
            const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

            const response = await fetch(`${API_URL}/api/offer-optimizer/pipeline/trigger`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ean: extractedId })
            });

            if (!response.ok && response.status !== 202) {
                let srvErr = "";
                let srvStack = "";
                try {
                    const errData = await response.json();
                    srvErr = errData.error || errData.message;
                    srvStack = errData.stack;
                } catch { }
                throw new Error(srvErr ? `${srvErr}` : `Błąd serwera (HTTP ${response.status})`);
            }

            // Oczekujemy na WebSocket, chyba że endpoint zadziałał synchronicznie
            if (response.status === 202) {
                // Potok przetwarza dane w tle, nie parsujemy JSON'a, zostajemy w trybie THINKING
                return;
            }

            const data = await response.json();
            
            setStatus('SUCCESS');
            setLastError(null);
            setTimeout(() => {
                 if (onAnalysisComplete) onAnalysisComplete(data);
            }, 800);
            
        } catch (error) {
            console.error(error);
            setStatus('IDLE');
            setLastError(error.message);
        }
    };

    return (
        <div className="w-full min-h-[500px] bg-slate-950 rounded-xl shadow-2xl border border-slate-800 overflow-hidden relative flex flex-col items-center justify-center p-8">
            {/* Animowane tło */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px]"></div>
                {status === 'THINKING' && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[80px] animate-pulse"></div>
                )}
            </div>

            <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">
                <div className="bg-slate-900 w-20 h-20 rounded-2xl flex items-center justify-center mb-8 border border-slate-700 shadow-xl shadow-black/50">
                    <DatabaseZap className="w-10 h-10 text-indigo-400" />
                </div>
                
                <h1 className="text-4xl font-black text-white tracking-tight mb-4 text-center">
                    Nexus Ultimate <span className="text-indigo-400">EAN Pipeline</span>
                </h1>
                <p className="text-sm font-medium text-slate-400 mb-12 text-center max-w-md leading-relaxed">
                    Uruchom potok neuro-lingwistyczny i pobierz strukturyzowane dane produktowe z BaseLinkera. Zasil PIM nową wiedzą.
                </p>

                <form onSubmit={handleAnalyze} className="w-full relative">
                    <div className={`relative flex items-center transition-all duration-500 ${status === 'THINKING' ? 'opacity-50 blur-sm pointer-events-none' : 'opacity-100'}`}>
                        <div className="absolute left-6 text-slate-500">
                            <Fingerprint className="w-6 h-6" />
                        </div>
                        <input
                            type="text"
                            placeholder="Wprowadź kod EAN (np. 8809822540631)"
                            value={ean}
                            onChange={(e) => setEan(e.target.value)}
                            disabled={status !== 'IDLE'}
                            className="w-full bg-slate-900/80 border border-slate-700 text-white font-mono text-lg px-16 py-6 rounded-xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600 shadow-inner"
                        />
                        <button
                            type="submit"
                            disabled={status !== 'IDLE' || !ean}
                            className="absolute right-3 top-3 bottom-3 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            <Sparkles className="w-4 h-4 mr-2" /> Start Potoku
                        </button>
                    </div>

                    {lastError && (
                        <div className="absolute top-full left-0 right-0 mt-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-lg flex items-start space-x-3 backdrop-blur-sm">
                            <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="block font-bold text-sm mb-1">Odrzucono zapytanie</span>
                                <span className="text-xs opacity-80">{lastError}</span>
                            </div>
                        </div>
                    )}
                </form>

                {status !== 'IDLE' && (
                    <div className="w-full mt-12 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center">
                                {status === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400"/> : <Cpu className="w-4 h-4 mr-2 animate-pulse"/>}
                                {status === 'SUCCESS' ? 'Potok Zakończony' : 'Rozprowadzanie Modeli AI...'}
                            </span>
                            <span className="text-xs font-bold text-slate-500 font-mono">{Math.floor(progress)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ease-out ${status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${progress}%` }}
                            >
                                {status === 'THINKING' && (
                                    <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                                )}
                            </div>
                        </div>
                        
                        {status === 'THINKING' && (
                            <div className="mt-6 grid grid-cols-3 gap-4 text-center opacity-60">
                                <div className="flex flex-col items-center">
                                    <Database className="w-5 h-5 text-slate-400 mb-2" />
                                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">1. Weryfikacja PIM</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Sparkles className="w-5 h-5 text-indigo-400 mb-2" />
                                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">2. Ekstrakcja AEO</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <ShieldCheck className="w-5 h-5 text-slate-400 mb-2" />
                                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">3. Compliance</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Definicja animacji shimmer w inline style */}
            <style jsx="true">{`
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
};
