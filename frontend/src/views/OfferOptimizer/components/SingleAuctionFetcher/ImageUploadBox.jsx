import React, { useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, Link as LinkIcon, DatabaseZap } from 'lucide-react';

export const ImageUploadBox = ({ onAnalysisComplete }) => {
    const [ean, setEan] = useState('');
    const [status, setStatus] = useState('IDLE'); // IDLE | THINKING | SUCCESS
    const [lastError, setLastError] = useState(null);

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

            if (!response.ok) {
                let srvErr = "";
                let srvStack = "";
                try {
                    const errData = await response.json();
                    srvErr = errData.error || errData.message;
                    srvStack = errData.stack;
                } catch {
                    // ignore
                }
                
                throw new Error(srvErr ? `${srvErr} | STACK: ${srvStack || 'brak'}` : `Błąd serwera (HTTP ${response.status})`);
            }

            const data = await response.json();
            
            setStatus('SUCCESS');
            setLastError(null);
            if (onAnalysisComplete) {
                 onAnalysisComplete(data);
            }
        } catch (error) {
            console.error(error);
            setStatus('IDLE');
            setLastError(error.message);
        }
    };

    return (
        <div className="w-full bg-white rounded-sm shadow-sm border border-slate-400 overflow-hidden relative">
            {status === 'THINKING' && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/50 via-purple-50/50 to-indigo-50/50 transition-opacity duration-1000 animate-pulse z-0"></div>
            )}
            
            <div className="relative z-10 p-8 xl:p-12 flex flex-col justify-center items-center h-full">
                <div className="bg-indigo-50 w-16 h-16 rounded-sm flex items-center justify-center mb-6 border border-indigo-100 shadow-sm shadow-indigo-900/5">
                    <DatabaseZap className="w-8 h-8 text-indigo-500" />
                </div>
                
                <h2 className="text-2xl font-black text-slate-800 tracking-tighter mb-2">Pobierz Ofertę PIM z BaseLinkera</h2>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-8 text-center max-w-lg">
                   Backend automatycznie wyszuka kod EAN w katalogu PIM. Jeśli zajdzie potrzeba, pobierze bogaty HTML i media prosto z API BaseLinker, chroniąc przed blokadami Allegro.
                </p>

                <form onSubmit={handleAnalyze} className="w-full max-w-2xl relative flex flex-col items-center">
                    
                    <div className="w-full bg-slate-50 shadow-inner rounded-sm border border-slate-400 p-3 flex items-center transition-all focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 mb-2">
                        <div className="px-4 text-slate-600">
                            <LinkIcon className="w-5 h-5" />
                        </div>
                        <input
                            type="text"
                            placeholder="Wpisz KOD EAN Produktu (np. 8809822540631)"
                            value={ean}
                            onChange={(e) => setEan(e.target.value)}
                            disabled={status === 'THINKING'}
                            required
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 outline-none w-full disabled:opacity-50 py-3"
                        />
                        
                        <div className="flex items-center space-x-2 pl-2 border-l border-slate-400 ml-2">
                            <button
                                type="submit"
                                disabled={status === 'THINKING' || !ean}
                                className={`px-8 py-4 rounded-sm text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center 
                                   ${status === 'SUCCESS' ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20' 
                                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'} 
                                   disabled:opacity-40 disabled:cursor-not-allowed min-w-[180px]`}
                            >
                                {status === 'IDLE' && <><Sparkles className="w-4 h-4 mr-2" /> Pobierz z API</>}
                                {status === 'THINKING' && <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transfer...</>}
                                {status === 'SUCCESS' && <><CheckCircle2 className="w-4 h-4 mr-2" /> Gotowe</>}
                            </button>
                        </div>
                    </div>

                    {status === 'SUCCESS' && !lastError && (
                        <div className="absolute -bottom-8 w-full text-center animate-in fade-in slide-in-from-top-2">
                           <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-sm">Połączono dane z API z modelem LLM</span>
                        </div>
                    )}

                    {lastError && (
                        <div className="absolute -bottom-14 w-full text-center animate-in fade-in slide-in-from-top-2 border border-rose-200 bg-rose-50 p-3 rounded-sm shadow-sm z-20">
                           <span className="text-xs font-bold text-rose-600 block mb-1">KRYTYCZNY BŁĄD BACKENDU:</span>
                           <span className="text-[11px] font-medium text-rose-500 break-words">{lastError}</span>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};
