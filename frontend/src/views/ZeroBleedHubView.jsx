import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldAlert, Truck, AlertTriangle, CheckCircle, Package, ArrowRight, X, AlertOctagon } from 'lucide-react';

const ZeroBleedHubView = ({ token, API_URL }) => {
    const [activeTab, setActiveTab] = useState('rma');
    const [blacklist, setBlacklist] = useState([]);
    const [returns, setReturns] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'rma') {
                const [resBlacklist, resReturns] = await Promise.all([
                    axios.get(`${API_URL}/api/rma/blacklist`, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(`${API_URL}/api/rma/returns`, { headers: { Authorization: `Bearer ${token}` } })
                ]);
                setBlacklist(resBlacklist.data);
                setReturns(resReturns.data);
            } else if (activeTab === 'logistics') {
                const res = await axios.get(`${API_URL}/api/logistics/suppliers`, { headers: { Authorization: `Bearer ${token}` } });
                setSuppliers(res.data);
            }
        } catch (error) {
            console.error("Błąd ładowania danych Zero Bleed Hub", error);
        } finally {
            setLoading(false);
        }
    };

    const handleBan = async (id) => {
        try {
            await axios.post(`${API_URL}/api/rma/blacklist/${id}/ban`, {}, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch (error) { console.error("Błąd blokowania", error); }
    };

    const handleDismiss = async (id) => {
        try {
            await axios.post(`${API_URL}/api/rma/blacklist/${id}/dismiss`, {}, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch (error) { console.error("Błąd odrzucania", error); }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* HUB HEADER */}
            <div className="p-6 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center space-x-4 mb-6">
                    <div className="w-12 h-12 bg-rose-50 rounded-sm flex items-center justify-center text-rose-500 shadow-sm border border-rose-100">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Zero-Bleed Hub</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Centrum Ochrony Finansów (RMA & B2B)</p>
                    </div>
                </div>

                {/* Sub-Tabs (Burger/Pills Menu) */}
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setActiveTab('rma')} 
                        className={`px-6 py-2.5 rounded-sm text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'rma' ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        <ShieldAlert className="w-4 h-4 inline-block mr-2" />
                        Czarna Lista (RMA)
                    </button>
                    <button 
                        onClick={() => setActiveTab('logistics')} 
                        className={`px-6 py-2.5 rounded-sm text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'logistics' ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        <Truck className="w-4 h-4 inline-block mr-2" />
                        Wirtualny Zaopatrzeniowiec
                    </button>
                </div>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {loading ? (
                    <div className="flex justify-center items-center h-64 text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">
                        Ładowanie danych analitycznych...
                    </div>
                ) : (
                    <>
                        {/* TAB: RMA */}
                        {activeTab === 'rma' && (
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                {/* Lista Oszustów */}
                                <div className="xl:col-span-1 bg-white border border-slate-300 rounded-sm shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
                                    <div className="p-4 bg-slate-50 border-b border-slate-300">
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] flex items-center">
                                            <AlertOctagon className="w-4 h-4 mr-2 text-rose-500" />
                                            Rejestr Ryzyka (3 Strikes)
                                        </h3>
                                    </div>
                                    <div className="overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                        {blacklist.length === 0 && <div className="text-center text-slate-400 text-xs font-bold py-10">Brak zarejestrowanych oszustów</div>}
                                        {blacklist.map(b => (
                                            <div key={b.id} className={`p-4 rounded-sm border ${b.isBlacklisted ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'} transition-all`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-xs font-black text-slate-900">{b.allegroLogin}</span>
                                                    {b.isBlacklisted ? (
                                                        <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-0.5 rounded-sm shadow-sm">Zbanowany</span>
                                                    ) : b.reviewStatus === 'WARNING' ? (
                                                        <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-sm">Decyzja</span>
                                                    ) : (
                                                        <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-700 px-2 py-0.5 rounded-sm">Bezpieczny</span>
                                                    )}
                                                </div>
                                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200/50">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Zwrotów: <b className="text-slate-800">{b.totalReturns}</b></span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fraud: <b className="text-slate-800">{b.fraudScore}%</b></span>
                                                </div>
                                                {b.reviewStatus === 'WARNING' && !b.isBlacklisted && (
                                                    <div className="flex space-x-2 mt-3 pt-3 border-t border-slate-200/50">
                                                        <button onClick={() => handleBan(b.id)} className="flex-1 text-[9px] font-black bg-rose-500 text-white py-1 rounded-sm hover:bg-rose-600 uppercase transition-colors shadow-sm">Zablokuj</button>
                                                        <button onClick={() => handleDismiss(b.id)} className="flex-1 text-[9px] font-black bg-slate-100 text-slate-600 py-1 rounded-sm hover:bg-slate-200 uppercase transition-colors">Odrzuć</button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Ostatnie Zwroty Dziennika */}
                                <div className="xl:col-span-2 bg-white border border-slate-300 rounded-sm shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
                                    <div className="p-4 bg-slate-50 border-b border-slate-300">
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] flex items-center">
                                            <ShieldAlert className="w-4 h-4 mr-2 text-amber-500" />
                                            Dziennik Zwrotów BaseLinker
                                        </h3>
                                    </div>
                                    <div className="overflow-y-auto p-4 custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="pb-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">Data</th>
                                                    <th className="pb-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">Login (Allegro)</th>
                                                    <th className="pb-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">Powód</th>
                                                    <th className="pb-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 text-right">Kwota Zwrotu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {returns.length === 0 && (
                                                    <tr><td colSpan="4" className="py-10 text-center text-xs font-bold text-slate-400">Brak logów w dzienniku</td></tr>
                                                )}
                                                {returns.map(r => (
                                                    <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="py-4 border-b border-slate-100 text-[11px] font-bold text-slate-600">{new Date(r.createdAt).toLocaleDateString()}</td>
                                                        <td className="py-4 border-b border-slate-100 text-[11px] font-black text-slate-800">{r.customerLogin}</td>
                                                        <td className="py-4 border-b border-slate-100 text-[11px] font-bold text-slate-600">
                                                            <div className="flex items-center text-amber-600">
                                                                <AlertTriangle className="w-3 h-3 mr-1" />
                                                                {r.reason}
                                                            </div>
                                                        </td>
                                                        <td className="py-4 border-b border-slate-100 text-[11px] font-black text-slate-800 text-right">{r.refundAmount} PLN</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: LOGISTICS */}
                        {activeTab === 'logistics' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {suppliers.length === 0 && <div className="col-span-full text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest">Brak Skonfigurowanych Dostawców B2B</div>}
                                {suppliers.map(s => (
                                    <div key={s.id} className="bg-white border border-slate-300 rounded-sm shadow-sm p-6 hover:border-indigo-300 hover:shadow-xl transition-all flex flex-col h-full">
                                        <div className="flex items-center mb-6 border-b border-slate-100 pb-4">
                                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-sm flex items-center justify-center mr-4">
                                                <Truck className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{s.name}</h3>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Lead Time: {s.leadTimeDays || 14} dni</p>
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Mapowane Produkty ({s.products?.length || 0})</div>
                                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                                {s.products?.slice(0, 5).map(p => (
                                                    <div key={p.ean} className="flex items-center justify-between bg-slate-50 p-2 rounded-sm border border-slate-200">
                                                        <div className="flex items-center min-w-0">
                                                            <Package className="w-3 h-3 mr-2 text-slate-400 shrink-0" />
                                                            <span className="text-[10px] font-bold text-slate-700 truncate">{p.name || p.ean}</span>
                                                        </div>
                                                        <span className={`text-[10px] font-black ml-2 shrink-0 ${p.stockErpUnits <= 50 ? 'text-rose-500' : 'text-emerald-600'}`}>{p.stockErpUnits || 0} szt</span>
                                                    </div>
                                                ))}
                                                {s.products?.length > 5 && <div className="text-center text-[9px] font-bold text-slate-400 mt-2">+ {s.products.length - 5} kolejnych SKU</div>}
                                            </div>
                                        </div>
                                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.email}</span>
                                            <button className="text-[10px] font-black uppercase text-indigo-600 tracking-widest hover:text-indigo-800 transition-colors flex items-center">
                                                Audytuj Burn Rate <ArrowRight className="w-3 h-3 ml-1" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ZeroBleedHubView;
