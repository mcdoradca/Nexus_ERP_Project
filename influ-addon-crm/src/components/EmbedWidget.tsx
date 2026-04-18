'use client';

import React, { useState } from 'react';

export default function EmbedWidget() {
    const [status, setStatus] = useState('IDLE');

    const handleSync = async () => {
        setStatus('SYNCING...');
        // Symulacja integracji z CrmIntegrationService
        setTimeout(() => setStatus('ZAMKNIĘTO W HUBSPOT'), 1500);
    };

    return (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden font-sans">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 shrink-0">
                <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse"></span>
                    Nexus AI Add-On (HubSpot)
                </h3>
            </div>
            
            <div className="p-5 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative overflow-hidden">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dopasowanie Wektorowe PIM</p>
                    <p className="text-sm font-bold text-slate-800">Anna Kowalska (@ania_kowalska)</p>
                    <div className="flex justify-between items-end mt-3">
                        <div>
                            <p className="text-[9px] text-slate-400 uppercase">Match Score</p>
                            <p className="text-emerald-500 font-black text-lg">94.2%</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-slate-400 uppercase">Estymowane ROI</p>
                            <p className="text-indigo-600 font-black">+340%</p>
                        </div>
                    </div>
                    {/* Wzorzec krystalicznego tła ze stylizacji NanoInflu */}
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-16 h-16 bg-gradient-to-br from-indigo-100 to-transparent rounded-full opacity-50 blur-xl"></div>
                </div>

                <div className="flex justify-between gap-3 pt-2">
                    <button 
                        onClick={handleSync}
                        disabled={status !== 'IDLE'}
                        className={`flex-1 py-3 px-4 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${status === 'IDLE' ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                    >
                        {status === 'IDLE' ? 'Wypchnij do CRM' : status}
                    </button>
                </div>
            </div>
        </div>
    );
}
