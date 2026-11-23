import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, ExternalLink, Loader2, AlertTriangle, TrendingUp } from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip
} from 'recharts';
import { fmtPln, fmtInt, fmtNum, fmtPct, fmtDateTime, ROLE_META } from './formatters';

export default function SkuDeepDiveModal({ API_URL, token, skuOrEan, queryParams, onClose, onOpenProduct }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!skuOrEan) return undefined;
        let cancelled = false;

        async function fetchDeepDive() {
            try {
                const encoded = encodeURIComponent(skuOrEan);
                const res = await axios.get(`${API_URL}/api/sales-intelligence/sku/${encoded}`, {
                    params: queryParams,
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!cancelled) {
                    setData(res.data);
                    setError(null);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.error || err.message || 'Nie udało się pobrać diagnostyki SKU.');
                    setLoading(false);
                }
            }
        }

        fetchDeepDive();
        return () => {
            cancelled = true;
        };
    }, [API_URL, token, skuOrEan, queryParams]);

    const sku = data?.sku || null;
    const threshold = data?.meta?.stockoutThreshold ?? 2;
    const roleInfo = sku ? (ROLE_META[sku.role] || ROLE_META.SOLO) : ROLE_META.SOLO;

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Diagnostyka Produktu 360&deg;</div>
                        <h3 className="text-base font-bold text-slate-900 truncate">
                            {sku ? sku.name : skuOrEan}
                        </h3>
                        {sku && (
                            <div className="text-xs font-mono text-slate-500 mt-0.5">
                                SKU: {sku.sku} {sku.ean ? `• EAN: ${sku.ean}` : ''} • Klasa: {sku.abcXyz}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {sku?.pimProductId && onOpenProduct && (
                            <button
                                type="button"
                                onClick={() => {
                                    onOpenProduct(sku.pimProductId);
                                    onClose();
                                }}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> Otwórz w Offer Optimizer
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {loading && (
                        <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                            Wczytuję pełną telemetrię produktu...
                        </div>
                    )}

                    {error && (
                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" /> {error}
                        </div>
                    )}

                    {!loading && !error && sku && (
                        <>
                            {/* Karty ekonomii SKU */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                                    <div className="text-[11px] text-slate-500">Stan & Zapas sprzedażowy</div>
                                    <div className={`text-lg font-bold mt-0.5 ${sku.isCurrentlyUnavailable ? 'text-rose-700' : 'text-slate-900'}`}>
                                        {sku.currentStock ?? '—'} szt. ({sku.isCurrentlyUnavailable ? `BRAK ≤ ${threshold}` : `Sprzed.: ${sku.sellableStock}`})
                                    </div>
                                    <div className="text-[11px] text-slate-500">ROP: {sku.recommendedRop} • Domów: <strong>{sku.recommendedOrderQty} szt.</strong></div>
                                </div>

                                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                                    <div className="text-[11px] text-slate-500">Sprzedaż & Rola Koszykowa</div>
                                    <div className="text-lg font-bold text-slate-900 mt-0.5">{fmtPln(sku.totalRevenuePln)}</div>
                                    <div className="mt-0.5 flex items-center gap-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${roleInfo.badgeClass}`}>{roleInfo.label}</span>
                                        <span className="text-[11px] text-slate-500">{fmtInt(sku.totalUnits)} szt.</span>
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                                    <div className="text-[11px] text-emerald-700">Zweryfikowany Zysk Netto (PIM)</div>
                                    <div className="text-lg font-bold text-emerald-800 mt-0.5">
                                        {sku.hasVerifiedCogs ? fmtPln(sku.verifiedNetProfitPln) : 'Brak COGS w PIM'}
                                    </div>
                                    <div className="text-[11px] text-emerald-700">
                                        {sku.hasVerifiedCogs ? `Marża: ${fmtPct(sku.verifiedNetMarginPct)} | COGS: ${fmtPln(sku.cogsPerUnit)}` : 'Uzupełnij basePrice w Katalogu SKU'}
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/50">
                                    <div className="text-[11px] text-rose-700">Straty przez braki (stan &le; {threshold})</div>
                                    <div className="text-lg font-bold text-rose-800 mt-0.5">{fmtPln(sku.totalLostGmvPln)}</div>
                                    <div className="text-[11px] text-rose-700">
                                        {sku.stockoutDays} dni przerw • Spadek trafności: {fmtPct(sku.relevanceDropPct)}
                                    </div>
                                </div>
                            </div>

                            {/* Wykres osi czasu migawek */}
                            {(data.snapshotsTimeline || []).length > 0 && (
                                <div className="bg-white rounded-xl border border-slate-200 p-4">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5 mb-2">
                                        <TrendingUp className="w-4 h-4 text-indigo-600" /> Oś Czasu Migawek (Stan vs Cena vs Odwiedziny Allegro)
                                    </h4>
                                    <div className="h-52">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={data.snapshotsTimeline}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                                                <RechartsTooltip />
                                                <Bar yAxisId="left" dataKey="stock" name="Stan (szt.)" fill="#4f46e5" />
                                                <Line yAxisId="right" type="monotone" dataKey="pricePln" name="Cena (PLN)" stroke="#059669" strokeWidth={2} />
                                                <Line yAxisId="right" type="monotone" dataKey="visitsCount" name="Odwiedziny" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Pary koszykowe + Ostatnie zamówienia */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-xl border border-slate-200 p-4">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase mb-2">Najczęstsi Partnerzy Koszykowi</h4>
                                    <div className="space-y-2 text-xs">
                                        {(data.relatedPairs || []).map((p, i) => {
                                            const partnerName = p.skuKeyA === sku.skuKey ? p.nameB : p.nameA;
                                            return (
                                                <div key={i} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded">
                                                    <span className="truncate font-medium text-slate-800">{partnerName}</span>
                                                    <span className="font-mono text-indigo-700 font-bold shrink-0 ml-2">
                                                        {p.coCount}x • Lift {fmtNum(p.lift, 2)}x
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {(data.relatedPairs || []).length === 0 && (
                                            <div className="text-slate-500 py-3">Produkt kupowany głównie pojedynczo.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 p-4">
                                    <h4 className="text-xs font-bold text-slate-800 uppercase mb-2">Ostatnie Zamówienia (Zdeduplikowane)</h4>
                                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                                        {(data.recentOrders || []).map((o, i) => (
                                            <div key={i} className="py-1.5 flex justify-between items-center">
                                                <div>
                                                    <div className="font-mono text-slate-800">{o.externalOrderId} ({o.originChannel})</div>
                                                    <div className="text-[10px] text-slate-500">{fmtDateTime(o.orderDate)} • {o.itemsCount} poz.</div>
                                                </div>
                                                <div className="font-semibold text-slate-900">{fmtPln(o.totalPln)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
