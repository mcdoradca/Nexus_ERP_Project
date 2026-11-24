import React from 'react';
import { RefreshCw, Scissors, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
    MAX_ALLEGRO_TITLE_LEN,
    OPTIMAL_MIN_ALLEGRO_TITLE_LEN,
    validateAllegroTitleClient,
    smartTrimTitleTo75
} from '../../utils/allegroTitleValidator';

/**
 * @typedef {Object} TitleValidatorProps
 * @property {string} liveTitle
 * @property {(text: string) => void} setLiveTitle
 * @property {boolean} isRegeneratingTitle
 * @property {() => void} handleRegenerateTitle
 */

export const TitleValidator = ({ liveTitle = "", setLiveTitle, isRegeneratingTitle, handleRegenerateTitle }) => {
    const val = validateAllegroTitleClient(liveTitle);
    const { length, wordCount, errors, warnings, valid, seoOptimal } = val;
    const isOverLimit = length > MAX_ALLEGRO_TITLE_LEN;

    let colorClass = "text-slate-700 bg-slate-50 border-slate-400";
    let statusMessage = "";

    if (!valid || isOverLimit) {
        colorClass = "text-rose-700 bg-rose-50 border-rose-400 focus:border-rose-500 focus:ring-rose-500/20";
        statusMessage = errors[0] || `Przekroczono limit ${MAX_ALLEGRO_TITLE_LEN} znaków!`;
    } else if (!seoOptimal) {
        colorClass = "text-amber-700 bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-amber-500/20";
        statusMessage = warnings[0] || `Wykorzystaj potencjał SEO/Ads (cel: ${OPTIMAL_MIN_ALLEGRO_TITLE_LEN}–74 znaki).`;
    } else if (length > 70) {
        colorClass = "text-emerald-800 bg-emerald-50 border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20";
        statusMessage = `Optymalna długość pod Allegro Ads i Trafność (zapas ${MAX_ALLEGRO_TITLE_LEN - length} zn.).`;
    } else {
        colorClass = "text-emerald-700 bg-emerald-50 border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20";
        statusMessage = "Optymalna długość i czystość fraz pod Allegro SEO / Ads.";
    }

    const handleChange = (e) => {
        if (setLiveTitle) setLiveTitle(e.target.value);
    };

    const handleSmartTrim = () => {
        if (!setLiveTitle) return;
        setLiveTitle(smartTrimTitleTo75(liveTitle));
    };

    return (
        <div className="flex flex-col space-y-3 mb-6 relative group">
            <div className="flex flex-wrap justify-between items-end gap-2">
                <label htmlFor="geoTitle" className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                    Walidacja Tytułu Allegro SEO / Ads (Limit {MAX_ALLEGRO_TITLE_LEN} zn.)
                </label>
                <div className="flex items-center gap-2">
                    {isOverLimit && (
                        <button
                            type="button"
                            onClick={handleSmartTrim}
                            className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white flex items-center transition-colors shadow-sm"
                            title="Skróć tytuł bez ucinania wyrazów do limitu 75 znaków"
                        >
                            <Scissors className="w-3 h-3 mr-1" /> Skróć mądrze do ≤75 zn.
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleRegenerateTitle}
                        disabled={isRegeneratingTitle}
                        className="text-[10px] uppercase font-bold text-indigo-500 hover:text-indigo-400 flex items-center transition-colors"
                        title="Wygeneruj nowy tytuł SEO/Ads na bazie Allegro i Google Suggest"
                    >
                        <RefreshCw className={`w-3 h-3 mr-1 ${isRegeneratingTitle ? 'animate-spin' : ''}`} /> Odśwież SEO
                    </button>
                    <div
                        className={`text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-sm ${
                            isOverLimit || !valid
                                ? 'bg-rose-600 text-white shadow-sm shadow-rose-500/30'
                                : seoOptimal
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-amber-500 text-white'
                        }`}
                    >
                        {length} / {MAX_ALLEGRO_TITLE_LEN} ZN.
                    </div>
                </div>
            </div>

            <input
                type="text"
                value={liveTitle}
                onChange={handleChange}
                id="geoTitle"
                name="geoTitle"
                placeholder="Wpisz tytuł Allegro (cel: 58–74 znaki, max 75)..."
                className={`w-full p-4 rounded-xl text-lg font-black outline-none border-2 transition-all shadow-sm focus:ring-4 ${colorClass}`}
            />

            <div className="flex flex-wrap justify-between items-center gap-2 text-xs tracking-wider px-1">
                <span className={`font-bold flex items-center gap-1.5 ${!valid || isOverLimit ? 'text-rose-600' : (!seoOptimal ? 'text-amber-600' : 'text-emerald-600')}`}>
                    {(!valid || isOverLimit || !seoOptimal) ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    {statusMessage}
                </span>
                <span className="text-slate-500 font-bold">Słowa: {wordCount} (min. 3) • Cel Ads: 58–74 zn.</span>
            </div>

            {(errors.length > 1 || (errors.length > 0 && warnings.length > 0) || warnings.length > 1) && (
                <ul className="text-[11px] space-y-1 px-2 pt-1 text-slate-600 list-disc list-inside">
                    {errors.slice(1).map((err, idx) => (
                        <li key={`err-${idx}`} className="text-rose-600 font-semibold">{err}</li>
                    ))}
                    {warnings.map((warn, idx) => (
                        <li key={`warn-${idx}`} className="text-amber-700">{warn}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};
