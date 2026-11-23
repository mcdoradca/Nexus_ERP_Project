import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
    RefreshCw, UploadCloud, CheckCircle2, AlertTriangle,
    Trash2, Copy, Check, Database, FileSpreadsheet, ShieldAlert, Loader2
} from 'lucide-react';
import {
    fmtInt, fmtShortDate, fmtDateTime, BASELINKER_CSV_COLUMNS_GUIDE
} from './formatters';

export default function DataSourcesTab({
    API_URL,
    token,
    statusData,
    onRefreshAll
}) {
    const [selectedPlatforms, setSelectedPlatforms] = useState({
        BASELINKER: true,
        ALLEGRO: true,
        VONHALSKY: true
    });
    const [syncDays, setSyncDays] = useState(60);
    const [deepMode, setDeepMode] = useState(false);
    const [isSubmittingSync, setIsSubmittingSync] = useState(false);
    const [localSyncJob, setLocalSyncJob] = useState(null);
    const [syncError, setSyncError] = useState(null);

    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResults, setUploadResults] = useState([]);
    const [uploadError, setUploadError] = useState(null);
    const [copiedGuide, setCopiedGuide] = useState(false);
    const [deletingBatchId, setDeletingBatchId] = useState(null);
    const fileInputRef = useRef(null);

    const accounts = statusData?.accounts || { BASELINKER: [], ALLEGRO: [], VONHALSKY: [] };
    const totals = statusData?.totals || {};
    const monthlyCoverage = statusData?.monthlyCoverage || [];
    const batches = statusData?.batches || [];

    const serverJob = statusData?.activeSyncJob || null;
    const effectiveJob = (() => {
        if (!localSyncJob) return serverJob;
        if (!serverJob) return localSyncJob;
        const localMs = new Date(localSyncJob.updatedAt || localSyncJob.startedAt || 0).getTime();
        const serverMs = new Date(serverJob.updatedAt || serverJob.startedAt || 0).getTime();
        return localMs >= serverMs ? localSyncJob : serverJob;
    })();
    const isSyncRunning = effectiveJob?.status === 'RUNNING';

    useEffect(() => {
        if (!isSyncRunning) return undefined;
        let cancelled = false;

        const pollStatus = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/sales-intelligence/sync/status`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (cancelled) return;
                const job = res.data?.job || null;
                if (job) {
                    setLocalSyncJob(job);
                    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
                        await onRefreshAll();
                    }
                }
            } catch {
                // ignore transient network error, next poll will retry
            }
        };

        const intervalId = setInterval(pollStatus, 2000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [isSyncRunning, API_URL, token, onRefreshAll]);

    const togglePlatform = (key) => {
        setSelectedPlatforms(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSyncNow = async () => {
        const platforms = Object.entries(selectedPlatforms)
            .filter(([, enabled]) => enabled)
            .map(([k]) => k);
        if (platforms.length === 0) {
            setSyncError('Wybierz przynajmniej jedną platformę do synchronizacji.');
            return;
        }
        setIsSubmittingSync(true);
        setSyncError(null);
        try {
            const res = await axios.post(
                `${API_URL}/api/sales-intelligence/sync`,
                { platforms, days: Number(syncDays) || 60, deepMode },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.job) {
                setLocalSyncJob(res.data.job);
            } else {
                await onRefreshAll();
            }
        } catch (err) {
            setSyncError(err.response?.data?.error || err.message || 'Błąd uruchomienia synchronizacji API.');
        } finally {
            setIsSubmittingSync(false);
        }
    };

    const handleUploadFiles = async (fileList) => {
        const arr = Array.from(fileList || []);
        if (arr.length === 0) return;

        setIsUploading(true);
        setUploadError(null);
        setUploadResults([]);
        try {
            const formData = new FormData();
            for (const f of arr) {
                formData.append('files', f);
            }
            const res = await axios.post(`${API_URL}/api/sales-intelligence/import`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            setUploadResults(res.data?.results || []);
            await onRefreshAll();
        } catch (err) {
            setUploadError(err.response?.data?.error || err.message || 'Błąd importu plików.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteBatch = async (batchId) => {
        setDeletingBatchId(batchId);
        try {
            await axios.delete(`${API_URL}/api/sales-intelligence/imports/${batchId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await onRefreshAll();
        } catch (err) {
            setUploadError(err.response?.data?.error || err.message || 'Nie udało się usunąć paczki importu.');
        } finally {
            setDeletingBatchId(null);
        }
    };

    const handleCopyTemplate = () => {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(BASELINKER_CSV_COLUMNS_GUIDE).then(() => {
                setCopiedGuide(true);
                setTimeout(() => setCopiedGuide(false), 2000);
            }).catch(() => {});
        }
    };

    const maxMonthlyOrders = Math.max(1, ...monthlyCoverage.map(m => Number(m.totalOrders || 0)));

    return (
        <div className="space-y-6">
            {/* Synchronizacja API Na Żądanie + Podpięte Konta */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Database className="w-4 h-4 text-indigo-600" />
                            Synchronizacja Bezpośrednia API (Multi-Workspace)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Nocny CRON (03:30) automatycznie archiwizuje dzienne migawki stanów, odwiedzin Allegro oraz statusów Von Halsky.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] text-slate-600 inline-flex items-center gap-1.5 mr-2 cursor-pointer" title="Dociąga też historię logów stanów Base.com dla Top 20 SKU oraz czasy paczek kurierskich (wolniejsze z uwagi na limit zapytań Base.com)">
                            <input
                                type="checkbox"
                                checked={deepMode}
                                onChange={e => setDeepMode(e.target.checked)}
                                disabled={isSubmittingSync || isSyncRunning}
                                className="rounded border-slate-300 text-indigo-600"
                            />
                            Tryb głęboki (logi + SLA)
                        </label>
                        <select
                            value={syncDays}
                            onChange={e => setSyncDays(Number(e.target.value))}
                            disabled={isSubmittingSync || isSyncRunning}
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                        >
                            <option value={30}>Zakres: ostatnie 30 dni</option>
                            <option value={60}>Zakres: ostatnie 60 dni (Allegro max)</option>
                            <option value={90}>Zakres: ostatnie 90 dni (Base / InPost)</option>
                        </select>
                        <button
                            type="button"
                            onClick={handleSyncNow}
                            disabled={isSubmittingSync || isSyncRunning}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 shadow-sm"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${(isSubmittingSync || isSyncRunning) ? 'animate-spin' : ''}`} />
                            {isSyncRunning
                                ? `Synchronizuję (${effectiveJob?.progressPct || 0}%)...`
                                : (isSubmittingSync ? 'Uruchamiam...' : 'Synchronizuj wybrane API')}
                        </button>
                    </div>
                </div>

                {/* Karty 3 Platform */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {[
                        {
                            key: 'BASELINKER',
                            title: 'Base.com / BaseLinker API',
                            accs: accounts.BASELINKER || [],
                            ordersCnt: totals.ordersByPlatform?.BASELINKER || 0,
                            hint: 'Zamówienia (do 90d), stany, PO, logi stanów i zwroty'
                        },
                        {
                            key: 'ALLEGRO',
                            title: 'Allegro REST API',
                            accs: accounts.ALLEGRO || [],
                            ordersCnt: totals.ordersByPlatform?.ALLEGRO || 0,
                            hint: 'Oferty (visits/watchers), bilingi prowizji/Smart, jakość 30d'
                        },
                        {
                            key: 'VONHALSKY',
                            title: 'InPost Von Halsky OpenAPI',
                            accs: accounts.VONHALSKY || [],
                            ordersCnt: totals.ordersByPlatform?.VONHALSKY || 0,
                            hint: 'Oferty, odrzucenia, Program Cenowy, zamówienia & Posprzedaż v2'
                        }
                    ].map(card => (
                        <label
                            key={card.key}
                            className={`cursor-pointer rounded-xl border p-4 transition-colors block ${selectedPlatforms[card.key] ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-slate-50/40'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(selectedPlatforms[card.key])}
                                        onChange={() => togglePlatform(card.key)}
                                        className="rounded border-slate-300 text-indigo-600"
                                    />
                                    <span className="text-xs font-bold text-slate-900">{card.title}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${card.accs.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {card.accs.length > 0 ? `${card.accs.length} konto` : 'Brak konta'}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1.5">{card.hint}</p>
                            <div className="mt-2 text-[11px] text-slate-700 font-medium">
                                W bazie: <strong>{fmtInt(card.ordersCnt)}</strong> zamówień
                            </div>
                        </label>
                    ))}
                </div>

                {syncError && (
                    <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> {syncError}
                    </div>
                )}

                {isSyncRunning && effectiveJob && (
                    <div className="mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                            <span className="inline-flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                {effectiveJob.stageMessage || 'Trwa synchronizacja w tle...'}
                            </span>
                            <span className="font-mono">{effectiveJob.progressPct || 0}%</span>
                        </div>
                        <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-600 transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(5, Number(effectiveJob.progressPct) || 5))}%` }}
                            />
                        </div>
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-indigo-800">
                            <span>Aktywna platforma: <strong>{effectiveJob.currentPlatform || '—'}</strong></span>
                            <span>
                                Zapisano na bieżąco: <strong>{fmtInt(effectiveJob.counters?.orders || 0)}</strong> zam. •{' '}
                                <strong>{fmtInt(effectiveJob.counters?.snapshots || 0)}</strong> ofert/stanów •{' '}
                                <strong>{fmtInt(effectiveJob.counters?.financial || 0)}</strong> bilingów
                            </span>
                        </div>
                    </div>
                )}

                {effectiveJob?.status === 'FAILED' && (
                    <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> Synchronizacja przerwana: {effectiveJob.error || effectiveJob.stageMessage}
                    </div>
                )}

                {effectiveJob?.status === 'COMPLETED' && (
                    <div className="mt-4 space-y-2">
                        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                                <span>Synchronizacja zakończona ({fmtDateTime(effectiveJob.syncedAt || effectiveJob.finishedAt)}).</span>
                            </span>
                            <span className="text-[11px] font-medium">
                                Zapisano: {fmtInt(effectiveJob.counters?.orders || 0)} zam. • {fmtInt(effectiveJob.counters?.snapshots || 0)} ofert/stanów • {fmtInt(effectiveJob.counters?.financial || 0)} bilingów
                            </span>
                        </div>
                        {Array.isArray(effectiveJob.scopeWarnings) && effectiveJob.scopeWarnings.length > 0 && (
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                    <ShieldAlert className="w-4 h-4 text-amber-600" /> Ostrzeżenia uprawnień OAuth (Scope):
                                </div>
                                {effectiveJob.scopeWarnings.map((sw, idx) => (
                                    <div key={idx} className="text-[11px]">• {sw.message}</div>
                                ))}
                            </div>
                        )}
                        {Array.isArray(effectiveJob.warnings) && effectiveJob.warnings.length > 0 && (
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1 max-h-36 overflow-y-auto">
                                {effectiveJob.warnings.map((w, idx) => <div key={idx}>• {w}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Importer CSV / XLSX / JSON */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        Importer Danych Historycznych i Reklamowych (CSV / XLSX / JSON)
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                        Automatycznie rozpoznaje: Archiwum zamówień Base.com (&gt; 90 dni), eksporty kampanii Allegro Ads, bilingi/ruch Allegro Analytics oraz cache JSON Base.com.
                    </p>

                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            handleUploadFiles(e.dataTransfer.files);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'}`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".csv,.xlsx,.xls,.json,.txt"
                            onChange={(e) => handleUploadFiles(e.target.files)}
                            className="hidden"
                        />
                        <UploadCloud className="w-8 h-8 mx-auto text-indigo-600 mb-2" />
                        <div className="text-xs font-semibold text-slate-800">
                            {isUploading ? 'Przetwarzam i deduplikuję przesłane pliki...' : 'Przeciągnij pliki tutaj lub kliknij, aby wybrać z dysku (max 20 plików naraz)'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                            Obsługuje kodowanie UTF-8 i Windows-1250, separatory ; , TAB oraz pliki Excel .xlsx
                        </div>
                    </div>

                    {uploadError && (
                        <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">{uploadError}</div>
                    )}

                    {uploadResults.length > 0 && (
                        <div className="mt-4 space-y-2">
                            {uploadResults.map(r => (
                                <div key={r.batchId} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-slate-900">{r.fileName}</div>
                                        <div className="text-[11px] text-slate-600">
                                            Format: <strong>{r.format}</strong> • Zaimportowano: <strong>{fmtInt(r.recordsImported)}</strong> • Pominięto: {fmtInt(r.recordsSkipped)}
                                        </div>
                                        {Array.isArray(r.warnings) && r.warnings.length > 0 && (
                                            <div className="text-[11px] text-amber-700 mt-0.5">{r.warnings.join(' | ')}</div>
                                        )}
                                    </div>
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{r.platform}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Instrukcja eksportu Base.com */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Jak pobrać historię &gt; 90 dni z Base.com?</h4>
                        <ol className="mt-2 space-y-1.5 text-xs text-slate-600 list-decimal list-inside">
                            <li>Base.com &rarr; <strong>Zamówienia &rarr; Eksport / Wydruki &rarr; Eksport CSV</strong>.</li>
                            <li>Wybierz zakres dat za ostatnie 12–24 miesiące (w kawałkach np. po kwartał).</li>
                            <li>Zaznacz w szablonie eksportu obowiązkowo: ID zamówienia, Data dodania, Waluta, Źródło, SKU, EAN, Nazwa produktu, Ilość, Cena brutto.</li>
                            <li>Wgraj wygenerowany plik CSV tutaj — system sam zdeduplikuje zamówienia nakładające się z API!</li>
                        </ol>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-slate-700">Zalecany nagłówek CSV:</span>
                            <button
                                type="button"
                                onClick={handleCopyTemplate}
                                className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1"
                            >
                                {copiedGuide ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedGuide ? 'Skopiowano' : 'Kopiuj kolumny'}
                            </button>
                        </div>
                        <div className="p-2 bg-slate-900 text-slate-200 rounded text-[10px] font-mono break-all">
                            {BASELINKER_CSV_COLUMNS_GUIDE}
                        </div>
                    </div>
                </div>
            </div>

            {/* Oś pokrycia 24M */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Mapa Pokrycia Danych 24-Miesięcznych (API vs Archiwum CSV)</h3>
                        <p className="text-xs text-slate-500">
                            Od {fmtShortDate(totals.earliestOrderDate)} do {fmtShortDate(totals.latestOrderDate)} • Łącznie {fmtInt(totals.totalOrders)} rekordów zamówień, {fmtInt(totals.dailySnapshots)} migawek, {fmtInt(totals.financialEntries)} wpisów bilingowych, {fmtInt(totals.adsMetrics)} wierszy Ads.
                        </p>
                    </div>
                </div>
                <div className="flex items-end gap-1 h-28 pt-2 overflow-x-auto">
                    {monthlyCoverage.map(m => {
                        const pct = m.totalOrders > 0 ? Math.max(12, Math.round((m.totalOrders / maxMonthlyOrders) * 100)) : 4;
                        return (
                            <div key={m.month} className="flex-1 min-w-[18px] flex flex-col items-center justify-end h-full">
                                <div
                                    style={{ height: `${pct}%` }}
                                    className={`w-full rounded-t transition-all ${m.totalOrders === 0 ? 'bg-slate-200' : (m.apiOrders > 0 ? 'bg-indigo-600' : 'bg-emerald-500')}`}
                                    title={`${m.month}: ${m.totalOrders} zam. (API: ${m.apiOrders}, CSV: ${m.csvOrders})`}
                                />
                                <span className="text-[9px] font-mono text-slate-500 mt-1">{m.month.slice(2)}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" /> Dane z API (lub API + CSV)</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Archiwum wyłącznie CSV/XLSX</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-200 inline-block" /> Brak danych (luka do dogrania CSV)</span>
                </div>
            </div>

            {/* Historia Importów & Cofanie */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Historia Synchronizacji i Importów Plików</h3>
                <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 rounded-lg">
                    <table className="min-w-full text-xs divide-y divide-slate-200">
                        <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold">
                            <tr>
                                <th className="px-3 py-2 text-left">Data</th>
                                <th className="px-2 py-2 text-left">Platforma</th>
                                <th className="px-2 py-2 text-left">Źródło / Plik</th>
                                <th className="px-2 py-2 text-center">Status</th>
                                <th className="px-2 py-2 text-right">Zaimportowano</th>
                                <th className="px-2 py-2 text-left">Zakres dat</th>
                                <th className="px-2 py-2 text-center">Cofnij</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {batches.map(b => (
                                <tr key={b.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDateTime(b.createdAt)}</td>
                                    <td className="px-2 py-2 font-semibold">{b.platform}</td>
                                    <td className="px-2 py-2">{b.fileName || b.sourceType}</td>
                                    <td className="px-2 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${b.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                            {b.status}
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono">{fmtInt(b.recordsImported)}</td>
                                    <td className="px-2 py-2 text-slate-500">
                                        {b.dateRangeStart ? `${fmtShortDate(b.dateRangeStart)} – ${fmtShortDate(b.dateRangeEnd)}` : '—'}
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                        <button
                                            type="button"
                                            disabled={deletingBatchId === b.id}
                                            onClick={() => handleDeleteBatch(b.id)}
                                            className="p-1 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-40"
                                            title="Cofnij tę paczkę importu (usuń powiązane rekordy)"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {batches.length === 0 && (
                                <tr><td colSpan={7} className="py-6 text-center text-slate-500">Brak historii synchronizacji i importów.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
