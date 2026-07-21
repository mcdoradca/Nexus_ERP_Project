import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Clock, Loader2, Save, Users, Plus, Trash2, CheckCircle, XCircle, Edit, Video, BellRing } from 'lucide-react';
import { io } from 'socket.io-client';

const MeetingDashboardView = ({ token, API_URL }) => {
    const [bookings, setBookings] = useState([]);
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Edycja spotkań
    const [editingBooking, setEditingBooking] = useState(null);
    const [editForm, setEditForm] = useState({ meetingDate: '', startTime: '', recruiterName: '', recruiterEmail: '' });

    // Notyfikacje
    const [notification, setNotification] = useState(null);

    const daysOfWeek = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

    useEffect(() => {
        fetchData();
        
        // Socket.IO dla notyfikacji o nowych spotkaniach
        const socket = io(API_URL, { path: '/api/socket.io', query: { token } });
        socket.on('nexus-notification', (data) => {
            if (data.type === 'MEETING_BOOKED') {
                setNotification(data.message);
                fetchData(); // Odśwież listę na żywo
                setTimeout(() => setNotification(null), 8000);
            }
        });
        return () => socket.disconnect();
    }, [API_URL, token]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [bRes, rRes] = await Promise.all([
                axios.get(`${API_URL}/api/meetings/admin/bookings`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/api/meetings/admin/availability`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setBookings(bRes.data);
            
            if (rRes.data.length > 0) {
                setRules(rRes.data);
            } else {
                // Default rules if empty
                setRules([
                    { dayOfWeek: 1, startTime: '10:00', endTime: '16:00', isActive: true },
                    { dayOfWeek: 2, startTime: '10:00', endTime: '16:00', isActive: true },
                    { dayOfWeek: 3, startTime: '10:00', endTime: '16:00', isActive: true },
                    { dayOfWeek: 4, startTime: '10:00', endTime: '16:00', isActive: true },
                    { dayOfWeek: 5, startTime: '10:00', endTime: '14:00', isActive: true }
                ]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveRules = async () => {
        setSaving(true);
        try {
            await axios.post(`${API_URL}/api/meetings/admin/availability`, { rules }, { headers: { Authorization: `Bearer ${token}` } });
            alert("Reguły dostępności zostały zapisane.");
        } catch (err) {
            console.error(err);
            alert("Błąd zapisu reguł.");
        } finally {
            setSaving(false);
        }
    };

    const addRule = () => {
        setRules([...rules, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isActive: true }]);
    };

    const updateRule = (index, field, value) => {
        const newRules = [...rules];
        newRules[index][field] = field === 'dayOfWeek' ? Number(value) : value;
        setRules(newRules);
    };

    const removeRule = (index) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const updateBookingStatus = async (id, status) => {
        try {
            await axios.patch(`${API_URL}/api/meetings/admin/bookings/${id}`, { status }, { headers: { Authorization: `Bearer ${token}` } });
            setBookings(bookings.map(b => b.id === id ? { ...b, status } : b));
        } catch (err) { console.error(err); }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.put(`${API_URL}/api/meetings/admin/bookings/${editingBooking.id}`, editForm, { headers: { Authorization: `Bearer ${token}` } });
            setBookings(bookings.map(b => b.id === editingBooking.id ? res.data.booking : b));
            setEditingBooking(null);
            alert("Spotkanie zaktualizowane.");
        } catch (err) {
            console.error(err);
            alert("Błąd podczas edycji.");
        }
    };

    const openEditModal = (b) => {
        setEditingBooking(b);
        setEditForm({
            meetingDate: new Date(b.meetingDate).toISOString().split('T')[0],
            startTime: b.startTime,
            recruiterName: b.recruiterName,
            recruiterEmail: b.recruiterEmail
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Powiadomienie (Toast) z boku ekranu */}
            {notification && (
                <div className="absolute top-6 right-6 z-50 bg-indigo-600 text-white p-4 rounded-xl shadow-2xl flex items-center animate-in slide-in-from-right duration-300">
                    <BellRing className="w-5 h-5 mr-3 animate-bounce text-indigo-200" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-indigo-200">Nowy Lead!</p>
                        <p className="font-bold text-sm">{notification}</p>
                    </div>
                </div>
            )}
            
            {/* Modal Edycji Spotkania */}
            {editingBooking && (
                <div className="absolute inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-slate-800">Edycja Spotkania</h3>
                            <button onClick={() => setEditingBooking(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Data Spotkania</label>
                                <input type="date" required value={editForm.meetingDate} onChange={e => setEditForm({...editForm, meetingDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Godzina</label>
                                <input type="time" required value={editForm.startTime} onChange={e => setEditForm({...editForm, startTime: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Imię Rekrutera</label>
                                <input type="text" required value={editForm.recruiterName} onChange={e => setEditForm({...editForm, recruiterName: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">E-mail</label>
                                <input type="email" required value={editForm.recruiterEmail} onChange={e => setEditForm({...editForm, recruiterEmail: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" />
                            </div>
                            <button type="submit" className="w-full py-3 mt-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-lg hover:bg-indigo-700">Zapisz Zmiany</button>
                        </form>
                    </div>
                </div>
            )}
            <div className="p-6 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center mb-1">
                    <Calendar className="w-8 h-8 text-indigo-600 mr-4" />
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Zarządzanie Kalendarzem</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Konfiguracja Calendly-Clone</p>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center">
                    <span className="text-xs font-bold text-indigo-800">Publiczny link dla rekruterów:</span>
                    <a href="/book" target="_blank" rel="noopener noreferrer" className="ml-3 text-xs font-black text-indigo-600 hover:underline">
                        {window.location.origin}/book
                    </a>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Nadchodzące Spotkania */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[70vh]">
                    <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                            <Users className="w-4 h-4 mr-2 text-indigo-500" /> Nadchodzące Rozmowy
                        </h3>
                    </div>
                    <div className="p-5 overflow-y-auto custom-scrollbar space-y-4">
                        {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /> : bookings.length === 0 ? <p className="text-center text-xs font-bold text-slate-400 py-10">Brak zarezerwowanych spotkań</p> : null}
                        
                        {bookings.filter(b => b.status !== 'CANCELLED').map(b => (
                            <div key={b.id} className="p-5 border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors bg-white shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="text-sm font-black text-slate-900">{b.recruiterName}</div>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{b.companyName || 'Brak firmy'} • {b.recruiterEmail}</div>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-sm ${b.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : b.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {b.status}
                                    </span>
                                </div>
                                <div className="flex items-center text-indigo-600 text-xs font-black mb-2 bg-indigo-50 w-max px-3 py-1.5 rounded-lg">
                                    <Clock className="w-3 h-3 mr-2" />
                                    {new Date(b.meetingDate).toLocaleDateString()} o {b.startTime} ({b.durationMinutes || 30} min)
                                </div>
                                
                                {/* Link do Google Meet po akceptacji */}
                                {b.status === 'CONFIRMED' && b.meetLink && (
                                    <div className="flex items-center mb-4 mt-2">
                                        <div className="bg-emerald-50 text-emerald-700 text-[10px] font-black flex items-center px-3 py-1.5 rounded-lg border border-emerald-200 w-full">
                                            <Video className="w-3 h-3 mr-2 shrink-0" /> 
                                            <a href={b.meetLink} target="_blank" rel="noopener noreferrer" className="hover:underline truncate w-full">
                                                {b.meetLink.replace('https://', '')}
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {b.jobDescription && (
                                    <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg mb-4 italic border border-slate-100">
                                        "{b.jobDescription}"
                                    </div>
                                )}
                                
                                {b.status === 'PENDING' && (
                                    <div className="flex space-x-2 pt-3 border-t border-slate-100">
                                        <button onClick={() => updateBookingStatus(b.id, 'CONFIRMED')} className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center transition-colors">
                                            <CheckCircle className="w-3 h-3 mr-1" /> Potwierdź
                                        </button>
                                        <button onClick={() => updateBookingStatus(b.id, 'CANCELLED')} className="flex-1 py-2 bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center transition-colors">
                                            <XCircle className="w-3 h-3 mr-1" /> Odrzuć
                                        </button>
                                        <button onClick={() => openEditModal(b)} className="px-3 py-2 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center transition-colors">
                                            <Edit className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {b.status !== 'PENDING' && (
                                    <div className="flex justify-end space-x-3 pt-2 mt-2 border-t border-slate-100">
                                        <button onClick={() => updateBookingStatus(b.id, 'CANCELLED')} className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-700 hover:underline flex items-center">
                                            <XCircle className="w-3 h-3 mr-1" /> Odwołaj
                                        </button>
                                        <button onClick={() => openEditModal(b)} className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-700 hover:underline flex items-center">
                                            <Edit className="w-3 h-3 mr-1" /> Edytuj
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Konfiguracja Dostępności */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[70vh]">
                    <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                            <Clock className="w-4 h-4 mr-2 text-indigo-500" /> Dostępność (Sloty)
                        </h3>
                        <button onClick={addRule} className="text-[10px] font-black text-indigo-600 uppercase hover:underline flex items-center">
                            <Plus className="w-3 h-3 mr-1" /> Dodaj Regułę
                        </button>
                    </div>
                    <div className="p-5 overflow-y-auto custom-scrollbar space-y-4">
                        {rules.map((rule, idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <select 
                                    value={rule.dayOfWeek} 
                                    onChange={(e) => updateRule(idx, 'dayOfWeek', e.target.value)}
                                    className="p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-indigo-500 flex-1"
                                >
                                    {daysOfWeek.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                </select>
                                
                                <input 
                                    type="time" 
                                    value={rule.startTime}
                                    onChange={(e) => updateRule(idx, 'startTime', e.target.value)}
                                    className="p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-indigo-500 w-24"
                                />
                                <span className="text-slate-400 font-black">-</span>
                                <input 
                                    type="time" 
                                    value={rule.endTime}
                                    onChange={(e) => updateRule(idx, 'endTime', e.target.value)}
                                    className="p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-indigo-500 w-24"
                                />
                                
                                <button onClick={() => removeRule(idx)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors hover:bg-rose-50 rounded-lg">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}

                        <div className="pt-6 mt-4 border-t border-slate-200">
                            <button 
                                onClick={handleSaveRules} 
                                disabled={saving}
                                className="w-full py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md disabled:bg-slate-400 flex items-center justify-center"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Zapisz Grafik
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MeetingDashboardView;
