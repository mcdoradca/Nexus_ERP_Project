import React from 'react';
import { Loader2, Zap, LayoutTemplate, UserCheck, ShieldCheck, MailWarning } from 'lucide-react';

export const StatusBadge = ({ status }) => {
    switch (status) {
        case 'QUEUED':
            return (
                <div className="flex items-center px-3 py-1.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-200">
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin"/> W Kolejce API
                </div>
            );
        case 'VISION_AI':
            return (
                <div className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-500 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                    <Zap className="w-3 h-3 mr-1.5 animate-pulse"/> Audyt AI Vision
                </div>
            );
        case 'GEO_BUILDER':
            return (
                <div className="flex items-center px-3 py-1.5 bg-fuchsia-50 text-fuchsia-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-fuchsia-100">
                    <LayoutTemplate className="w-3 h-3 mr-1.5 animate-pulse"/> Generowanie GEO
                </div>
            );
        case 'HITL_REVIEW':
            return (
                <div className="flex items-center px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-200 shadow-sm shadow-amber-900/5">
                    <UserCheck className="w-3 h-3 mr-1.5"/> Akceptacja Human-in-Loop
                </div>
            );
        case 'PUBLISHED':
            return (
                <div className="flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-200">
                    <ShieldCheck className="w-3 h-3 mr-1.5"/> Wyslane BaseLinker
                </div>
            );
        case 'ERROR_400':
        case 'ERROR_429':
            return (
                <div className="flex items-center px-3 py-1.5 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-rose-200 shadow-sm shadow-rose-900/10">
                    <MailWarning className="w-3 h-3 mr-1.5"/> Błąd {status.split('_')[1]}
                </div>
            );
        default:
            return (
                <div className="flex items-center px-3 py-1.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                    Nieznany
                </div>
            );
    }
};
