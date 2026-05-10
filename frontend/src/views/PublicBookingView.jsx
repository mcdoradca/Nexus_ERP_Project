import React, { useState } from 'react';
import axios from 'axios';
import { Calendar as CalendarIcon, Clock, Briefcase, Mail, User, CheckCircle2, Loader2, Video } from 'lucide-react';

const PublicBookingView = ({ API_URL }) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [selectedTime, setSelectedTime] = useState(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    
    const [form, setForm] = useState({
        recruiterName: '',
        recruiterEmail: '',
        companyName: '',
        jobDescription: ''
    });
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Wylicz najbliższe 14 dni
    const generateDays = () => {
        const days = [];
        const today = new Date();
        // Pomijamy dzisiaj jeśli jest późno, uproszczone: dodaj 14 kolejnych dni
        for (let i = 1; i <= 14; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            // Wyklucz weekendy
            if (d.getDay() !== 0 && d.getDay() !== 6) {
                days.push(d);
            }
        }
        return days;
    };

    const days = generateDays();

    const fetchSlots = async (dateObj) => {
        setLoadingSlots(true);
        setSelectedTime(null);
        try {
            const dateStr = dateObj.toISOString().split('T')[0];
            const res = await axios.get(`${API_URL}/api/meetings/public/availability?date=${dateStr}`);
            setAvailableSlots(res.data.slots || []);
        } catch (err) {
            console.error(err);
            setAvailableSlots([]);
        } finally {
            setLoadingSlots(false);
        }
    };

    const handleDateSelect = (d) => {
        setSelectedDate(d);
        fetchSlots(d);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await axios.post(`${API_URL}/api/meetings/public/book`, {
                ...form,
                meetingDate: selectedDate.toISOString(),
                startTime: selectedTime,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
            setIsSuccess(true);
        } catch (err) {
            alert(err.response?.data?.error || 'Wystąpił błąd podczas rezerwacji. Spróbuj ponownie.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-lg w-full bg-white p-10 rounded-2xl shadow-xl border border-slate-200 text-center animate-in zoom-in duration-500">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-4">Spotkanie Zarezerwowane!</h2>
                    <p className="text-slate-600 mb-8 leading-relaxed">
                        Świetnie! Potwierdzenie oraz link do spotkania (Google Meet / Teams) wyślemy na adres: <strong className="text-slate-900">{form.recruiterEmail}</strong> w najbliższym czasie.
                    </p>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Szczegóły</span>
                        <span className="font-black text-indigo-600">{selectedDate?.toLocaleDateString('pl-PL')} o {selectedTime}</span>
                        <span className="text-xs font-medium text-slate-500 mt-1">Strefa czasowa: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">
            <header className="py-6 px-8 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                        <span className="text-white font-black text-xl">N</span>
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tighter">Nexus Booking</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Enterprise Calendar</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-8 items-start justify-center mt-8">
                {/* Lewa kolumna: Opis i Wybór Daty */}
                <div className="w-full md:w-[45%] bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
                        <h2 className="text-2xl font-black text-slate-900 mb-2">Zaplanuj Rozmowę</h2>
                        <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">
                            Wybierz dogodny termin na 30-minutowe spotkanie wprowadzające. System zsynchronizuje kalendarze.
                        </p>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center text-slate-600 text-sm font-bold">
                                <Clock className="w-5 h-5 mr-3 text-indigo-500" /> 30 Minut
                            </div>
                            <div className="flex items-center text-slate-600 text-sm font-bold">
                                <Video className="w-5 h-5 mr-3 text-indigo-500" /> Google Meet / MS Teams
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-8">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Wybierz Dzień</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            {days.map((d, i) => {
                                const isSelected = selectedDate && d.toDateString() === selectedDate.toDateString();
                                return (
                                    <button 
                                        key={i}
                                        onClick={() => handleDateSelect(d)}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                                            isSelected 
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105 z-10' 
                                            : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {d.toLocaleDateString('pl-PL', { weekday: 'short' })}
                                        </span>
                                        <span className="text-xl font-black">{d.getDate()}</span>
                                        <span className={`text-[9px] font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {d.toLocaleDateString('pl-PL', { month: 'short' })}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Prawa kolumna: Godziny i Formularz */}
                <div className="w-full md:w-[55%] flex flex-col gap-6">
                    {selectedDate && !selectedTime && (
                        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 animate-in slide-in-from-right duration-300">
                            <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center">
                                <CalendarIcon className="w-5 h-5 mr-2 text-indigo-500" />
                                {selectedDate.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </h3>
                            
                            {loadingSlots ? (
                                <div className="flex justify-center items-center h-32">
                                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                </div>
                            ) : availableSlots.length > 0 ? (
                                <div className="grid grid-cols-3 gap-3">
                                    {availableSlots.map(time => (
                                        <button 
                                            key={time}
                                            onClick={() => setSelectedTime(time)}
                                            className="py-3 px-4 border border-indigo-200 rounded-xl text-indigo-700 font-black hover:bg-indigo-600 hover:text-white transition-all text-center shadow-sm hover:shadow-md"
                                        >
                                            {time}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-slate-500 font-bold">Brak dostępnych terminów w tym dniu.</p>
                                    <button onClick={() => setSelectedDate(null)} className="mt-4 text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">Wybierz inny dzień</button>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedTime && (
                        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 animate-in slide-in-from-right duration-300">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Szczegóły Spotkania</h3>
                                    <p className="text-sm font-bold text-indigo-600 mt-1">
                                        {selectedDate.toLocaleDateString('pl-PL')} o {selectedTime}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedTime(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors border border-slate-200 px-3 py-1.5 rounded-lg">
                                    Zmień czas
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Imię i Nazwisko *</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input required type="text" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800" placeholder="Jan Kowalski" value={form.recruiterName} onChange={e => setForm({...form, recruiterName: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Adres E-mail *</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input required type="email" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800" placeholder="jan.kowalski@firma.com" value={form.recruiterEmail} onChange={e => setForm({...form, recruiterEmail: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Firma / Agencja</label>
                                    <div className="relative">
                                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input type="text" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800" placeholder="Tech Recruiters Inc." value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Dodatkowe informacje (Opcjonalnie)</label>
                                    <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-800 text-sm min-h-[100px] resize-none" placeholder="Link do oferty pracy, temat rozmowy..." value={form.jobDescription} onChange={e => setForm({...form, jobDescription: e.target.value})}></textarea>
                                </div>
                                
                                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all flex justify-center items-center disabled:bg-slate-300">
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Potwierdź Rezerwację'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PublicBookingView;
