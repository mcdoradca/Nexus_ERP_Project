import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, Search, Plus, MapPin, Users, Phone, Mail, Globe, Hash, Edit3, Trash2, Loader2, ArrowRight, X, CloudLightning } from 'lucide-react';

const CrmView = ({ token, API_URL, currentUser }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedCompany, setSelectedCompany] = useState(null);
  
  // Modals
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  
  // Forms
  const [companyForm, setCompanyForm] = useState({ id: '', taxId: '', regon: '', krs: '', name: '', legalForm: '', industry: '', website: '', mainPhone: '', mainEmail: '', status: 'Aktywny', notes: '' });
  const [branchForm, setBranchForm] = useState({ id: '', name: '', type: 'Oddział', street: '', building: '', city: '', postalCode: '', country: 'Polska', isHeadquarters: false });
  const [contactForm, setContactForm] = useState({ id: '', firstName: '', lastName: '', role: '', phone: '', email: '', branchId: '' });

  const [autofilling, setAutofilling] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/crm/companies`, { headers: { Authorization: `Bearer ${token}` } });
      setCompanies(res.data);
      if (selectedCompany) {
        const updatedSelected = res.data.find(c => c.id === selectedCompany.id);
        setSelectedCompany(updatedSelected || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutofillGUS = async () => {
    if (!companyForm.taxId || companyForm.taxId.length < 10) return alert('Wprowadź prawidłowy NIP (10 cyfr).');
    setAutofilling(true);
    try {
      const res = await axios.get(`${API_URL}/api/crm/autofill/${companyForm.taxId}`, { headers: { Authorization: `Bearer ${token}` } });
      setCompanyForm({
        ...companyForm,
        name: res.data.name || '',
        regon: res.data.regon || '',
        krs: res.data.krs || '',
        notes: `Adres zarejestrowany: ${res.data.address}`
      });
    } catch (err) {
      alert('Nie odnaleziono podmiotu w bazie Ministerstwa Finansów lub serwer odrzucił połączenie.');
    } finally {
      setAutofilling(false);
    }
  };

  // --- SUBMITS ---
  const handleSaveCompany = async (e) => {
    e.preventDefault();
    try {
      if (companyForm.id) {
        await axios.patch(`${API_URL}/api/crm/companies/${companyForm.id}`, companyForm, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/api/crm/companies`, companyForm, { headers: { Authorization: `Bearer ${token}` } });
      }
      setIsCompanyModalOpen(false);
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.error || 'Błąd zapisu firmy');
    }
  };

  const handleDeleteCompany = async (id) => {
    if(!window.confirm('Czy na pewno chcesz bezpowrotnie usunąć rekrod kontrahenta wraz ze wszystkimi oddziałami i kontaktami?')) return;
    try {
      await axios.delete(`${API_URL}/api/crm/companies/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedCompany(null);
      fetchCompanies();
    } catch (err) { alert('Błąd usuwania'); }
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    try {
      if (branchForm.id) {
        await axios.patch(`${API_URL}/api/crm/branches/${branchForm.id}`, branchForm, { headers: { Authorization: `Bearer ${token}` } });
      } else {
         await axios.post(`${API_URL}/api/crm/companies/${selectedCompany.id}/branches`, branchForm, { headers: { Authorization: `Bearer ${token}` } });
      }
      setIsBranchModalOpen(false);
      fetchCompanies();
    } catch (err) { alert('Błąd zapisu oddziału'); }
  };

  const handleDeleteBranch = async (id) => {
    if(!window.confirm('Usunąć oddział?')) return;
    try {
      await axios.delete(`${API_URL}/api/crm/branches/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchCompanies();
    } catch (err) { alert('Błąd usuwania oddziału'); }
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...contactForm, branchId: contactForm.branchId || null };
      if (contactForm.id) {
        await axios.patch(`${API_URL}/api/crm/contacts/${contactForm.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/api/crm/companies/${selectedCompany.id}/contacts`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      setIsContactModalOpen(false);
      fetchCompanies();
    } catch (err) { alert('Błąd zapisu kontaktu'); }
  };

  const handleDeleteContact = async (id) => {
    if(!window.confirm('Usunąć kontakt?')) return;
    try {
      await axios.delete(`${API_URL}/api/crm/contacts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchCompanies();
    } catch (err) { alert('Błąd usuwania kontaktu'); }
  };

  const inputClass = "w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-400 transition-all placeholder:text-slate-400";
  const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2";

  return (
    <div className="flex-1 flex overflow-hidden bg-[#f8fafc] text-slate-900 font-sans">
      
      {/* LEWY PANEL - LISTA FIRM */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-[5px_0_30px_rgba(0,0,0,0.02)]">
        <div className="p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center">
              <Building2 className="w-5 h-5 mr-3 text-indigo-600" /> Baza Firm
            </h2>
            <button onClick={() => { setCompanyForm({ id: '', taxId: '', regon: '', krs: '', name: '', legalForm: '', industry: '', website: '', mainPhone: '', mainEmail: '', status: 'Aktywny', notes: '' }); setIsCompanyModalOpen(true); }} className="p-2 bg-indigo-50 text-indigo-600 rounded-sm hover:bg-indigo-600 hover:text-white transition-colors tooltip" title="Zarejestruj nową">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input type="text" placeholder="Szukaj po nazwie lub NIP..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-[2rem] text-xs font-bold outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-600/10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {loading ? (
             <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
          ) : (
            companies.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.taxId && c.taxId.includes(searchQuery))).map(c => (
              <div key={c.id} onClick={() => setSelectedCompany(c)} className={`p-4 rounded-sm border cursor-pointer transition-all ${selectedCompany?.id === c.id ? 'bg-slate-900 border-slate-800 text-white shadow-xl' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'}`}>
                <div className="text-xs font-black uppercase tracking-tight mb-1 truncate">{c.name}</div>
                <div className={`text-[9px] font-bold flex items-center ${selectedCompany?.id === c.id ? 'text-slate-400' : 'text-slate-500'}`}>
                  NIP: {c.taxId || 'Brak'} <span className="mx-2">•</span> {c.industry || 'Wielobranżowa'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PRAWY PANEL - SZCZEGÓŁY FIRMY */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-y-auto relative custom-scrollbar">
        {!selectedCompany ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
            <Building2 className="w-24 h-24 mb-6 opacity-20" />
            <h3 className="text-xl font-black uppercase tracking-widest text-slate-400 mb-2">Wybierz lub dodaj firmę</h3>
            <p className="text-xs font-bold uppercase tracking-widest max-w-sm text-center opacity-60">Zarządzaj ujednoliconą bazą B2B, dodawaj jej oddziały (Siedziby, Magazyny) oraz koordynuj z osobami kontaktowymi.</p>
          </div>
        ) : (
          <div className="p-10 max-w-6xl mx-auto w-full animate-in slide-in-from-bottom-8 duration-500">
            
            {/* HERADER FIRMY */}
            <div className="bg-white rounded-sm shadow-sm border border-slate-200 p-8 mb-8 relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                 <button onClick={() => { setCompanyForm(selectedCompany); setIsCompanyModalOpen(true); }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-sm text-[9px] font-black uppercase tracking-widest flex items-center"><Edit3 className="w-3 h-3 mr-2"/> Edytuj</button>
                 {currentUser?.role === 'ADMIN' && <button onClick={() => handleDeleteCompany(selectedCompany.id)} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-sm text-[9px] font-black uppercase tracking-widest flex items-center"><Trash2 className="w-3 h-3 mr-2"/> Usuń Systemowo</button>}
               </div>

               <div className="flex items-start">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-fuchsia-100 border border-indigo-200 rounded-sm flex items-center justify-center text-3xl font-black text-indigo-700 mr-8 shadow-inner shrink-0">
                    {selectedCompany.name.substring(0, 1)}
                  </div>
                  <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{selectedCompany.name}</h1>
                    <div className="flex items-center text-[10px] font-black uppercase tracking-widest space-x-4 mb-5">
                      <span className={`px-2.5 py-1 rounded-sm text-white ${selectedCompany.status === 'Aktywny' ? 'bg-emerald-500' : selectedCompany.status === 'Prospekt' ? 'bg-amber-500' : 'bg-rose-500'}`}>{selectedCompany.status}</span>
                      <span className="text-slate-500 flex items-center"><Hash className="w-3 h-3 mr-1"/> NIP: {selectedCompany.taxId || '-'}</span>
                      <span className="text-slate-500 border-l border-slate-300 pl-4">KRS: {selectedCompany.krs || '-'}</span>
                      <span className="text-indigo-600 border-l border-slate-300 pl-4">{selectedCompany.industry || 'Branża Niezdefiniowana'}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs text-slate-600 font-bold">
                       {selectedCompany.mainEmail && <div className="flex items-center"><Mail className="w-4 h-4 mr-2 text-slate-400"/> {selectedCompany.mainEmail}</div>}
                       {selectedCompany.mainPhone && <div className="flex items-center"><Phone className="w-4 h-4 mr-2 text-slate-400"/> {selectedCompany.mainPhone}</div>}
                       {selectedCompany.website && <div className="flex items-center"><Globe className="w-4 h-4 mr-2 text-slate-400"/> {selectedCompany.website}</div>}
                    </div>
                    {selectedCompany.notes && <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-sm text-xs font-bold text-yellow-800 break-words"><span className="uppercase tracking-widest text-[9px] mb-1 block opacity-60">Notatka Organizacyjna:</span>{selectedCompany.notes}</div>}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
               {/* KOLUMNA ODDZIAŁÓW */}
               <div>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center"><MapPin className="w-4 h-4 mr-2 text-indigo-600"/> Receptory / Oddziały</h3>
                    <button onClick={() => { setBranchForm({ id: '', name: '', type: 'Oddział', street: '', building: '', city: '', postalCode: '', country: 'Polska', isHeadquarters: false }); setIsBranchModalOpen(true); }} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center"><Plus className="w-3 h-3 mr-1"/> Dodaj Punkt</button>
                  </div>
                  <div className="space-y-4">
                     {selectedCompany.branches?.length === 0 ? <p className="text-xs text-slate-400 font-bold italic">Firma nie posiada jeszcze zdefiniowanych oddziałów adresowych. Dodaj Główną Siedzibę dla celów transportowych.</p> : selectedCompany.branches?.map(b => (
                       <div key={b.id} className="bg-white border border-slate-200 rounded-sm p-5 shadow-sm hover:border-indigo-300 transition-all group relative">
                          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                             <button onClick={() => { setBranchForm(b); setIsBranchModalOpen(true); }} className="text-slate-400 hover:text-indigo-600"><Edit3 className="w-3 h-3"/></button>
                             <button onClick={() => handleDeleteBranch(b.id)} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3 h-3"/></button>
                          </div>
                          <div className="flex justify-between items-start mb-2">
                             <div>
                                <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">{b.name}</h4>
                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-0.5 block">{b.type} {b.isHeadquarters && ' (Siedziba Główna)'}</span>
                             </div>
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 leading-relaxed max-w-[80%]">
                             Ulica: {b.street} {b.building} <br/>
                             Kod i Miasto: {b.postalCode} {b.city} <br/>
                             {b.country !== 'Polska' && `Kraj: ${b.country}`}
                          </div>
                       </div>
                     ))}
                  </div>
               </div>

               {/* KOLUMNA KONTAKTÓW */}
               <div>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center"><Users className="w-4 h-4 mr-2 text-pink-600"/> Wizytownik</h3>
                    <button onClick={() => { setContactForm({ id: '', firstName: '', lastName: '', role: '', phone: '', email: '', branchId: '' }); setIsContactModalOpen(true); }} className="text-[10px] font-black text-pink-600 uppercase tracking-widest hover:underline flex items-center"><Plus className="w-3 h-3 mr-1"/> Dodaj Kontakt</button>
                  </div>
                  <div className="space-y-4">
                     {selectedCompany.contacts?.length === 0 ? <p className="text-xs text-slate-400 font-bold italic">Książka telefoniczna pusta. Dodaj osobę, aby handlowcy mieli z kim rozmawiać.</p> : selectedCompany.contacts?.map(c => (
                       <div key={c.id} className="bg-white border text-left border-slate-200 rounded-sm p-4 shadow-sm hover:border-pink-300 transition-all flex items-center group">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600 mr-4 shrink-0 shadow-inner">
                            {c.firstName[0]}{c.lastName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="text-xs font-black uppercase tracking-tight text-slate-900 truncate">{c.firstName} {c.lastName}</div>
                             <div className="text-[9px] font-black text-pink-600 uppercase tracking-widest truncate">{c.role || 'Nie określono'}</div>
                             <div className="text-[9px] font-bold text-slate-500 flex items-center space-x-4 mt-2 truncate">
                               {c.phone && <span className="flex items-center"><Phone className="w-3 h-3 mr-1 opacity-50"/> {c.phone}</span>}
                               {c.email && <span className="flex items-center"><Mail className="w-3 h-3 mr-1 opacity-50"/> {c.email}</span>}
                             </div>
                             {c.branchId && (
                               <div className="mt-2 text-[8px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full inline-block border border-slate-200">
                                  {selectedCompany.branches?.find(b => b.id === c.branchId)?.name || 'Nieznany Oddział'}
                               </div>
                             )}
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col space-y-2 ml-4">
                             <button onClick={() => { setContactForm(c); setIsContactModalOpen(true); }} className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-indigo-100 hover:text-indigo-600"><Edit3 className="w-3 h-3"/></button>
                             <button onClick={() => handleDeleteContact(c.id)} className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-rose-100 hover:text-rose-600"><Trash2 className="w-3 h-3"/></button>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

          </div>
        )}
      </div>

      {/* MODAL: FIrma */}
      {isCompanyModalOpen && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] min-h-0 animate-in zoom-in-95">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                 <div>
                   <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">{companyForm.id ? 'Edycja Firmy' : 'Rejestracja Podmiotu B2B'}</h3>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Główny Rekord Systemowy CRM</p>
                 </div>
                 <button onClick={() => setIsCompanyModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-sm transition-all"><X className="w-5 h-5 text-slate-400" /></button>
               </div>
               <form onSubmit={handleSaveCompany} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                 
                 {/* Moduł API GUS */}
                 <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-sm mb-6 flex items-end justify-between">
                    <div className="w-[60%]">
                      <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-2 flex items-center"><CloudLightning className="w-4 h-4 mr-2"/> Automatyka GUS (Biała Lista)</label>
                      <input type="text" placeholder="Wpisz rzutem NIP (bez kresek)..." className="w-full px-4 py-3 bg-white border border-blue-200 rounded-sm text-sm font-bold text-slate-800 focus:border-indigo-500 outline-none" value={companyForm.taxId} onChange={e => setCompanyForm({...companyForm, taxId: e.target.value})} />
                    </div>
                    <button type="button" onClick={handleAutofillGUS} disabled={autofilling} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-sm shadow-md transition-all flex items-center">
                      {autofilling ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Search className="w-4 h-4 mr-2"/> } {autofilling ? 'Pobieram...' : 'Pobierz Dane'}
                    </button>
                 </div>

                 <div className="grid grid-cols-2 gap-6">
                   <div className="col-span-2">
                     <label className={labelClass}>Nazwa Przedsiębiorstwa (Pełna)</label>
                     <input required placeholder="Firma XYZ..." type="text" className={inputClass} value={companyForm.name} onChange={e => setCompanyForm({...companyForm, name: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>Forma Prawna</label>
                     <input placeholder="np. Sp. z o.o., S.A." type="text" className={inputClass} value={companyForm.legalForm} onChange={e => setCompanyForm({...companyForm, legalForm: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>Branża / Kategoria</label>
                     <input placeholder="np. IT, Sklep Elektroniczny" type="text" className={inputClass} value={companyForm.industry} onChange={e => setCompanyForm({...companyForm, industry: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>REGON</label>
                     <input type="text" className={inputClass} value={companyForm.regon} onChange={e => setCompanyForm({...companyForm, regon: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>KRS</label>
                     <input type="text" className={inputClass} value={companyForm.krs} onChange={e => setCompanyForm({...companyForm, krs: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>Główny Telefon</label>
                     <input type="text" className={inputClass} value={companyForm.mainPhone} onChange={e => setCompanyForm({...companyForm, mainPhone: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>Główny E-mail BOK</label>
                     <input type="email" className={inputClass} value={companyForm.mainEmail} onChange={e => setCompanyForm({...companyForm, mainEmail: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>Witryna WWW</label>
                     <input type="text" className={inputClass} value={companyForm.website} onChange={e => setCompanyForm({...companyForm, website: e.target.value})} />
                   </div>
                   <div>
                     <label className={labelClass}>Status Kooperacji</label>
                     <select className={inputClass} value={companyForm.status} onChange={e => setCompanyForm({...companyForm, status: e.target.value})}>
                        <option value="Aktywny">Aktywny (Klient / Dostawca)</option>
                        <option value="Prospekt">Prospekt (Zimny Lepik)</option>
                        <option value="Zablokowany">Zablokowany / Niewypłacalny</option>
                     </select>
                   </div>
                   <div className="col-span-2">
                     <label className={labelClass}>Notatki o firmie (Reguły Fakturowania itp.)</label>
                     <textarea className={`${inputClass} min-h-[100px] resize-y`} value={companyForm.notes} onChange={e => setCompanyForm({...companyForm, notes: e.target.value})}></textarea>
                   </div>
                 </div>
                 <div className="pt-4 pb-2">
                    <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-sm shadow-xl transition-all">Zapisz Rekord Systemowy</button>
                 </div>
               </form>
            </div>
         </div>
      )}

      {/* MODAL: Oddział */}
      {isBranchModalOpen && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] min-h-0 animate-in zoom-in-95 border-t-4 border-indigo-500">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                 <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{branchForm.id ? 'Edycja Oddziału' : 'Nowy Punku Dla Dostaw'}</h3>
                 <button onClick={() => setIsBranchModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-sm transition-all"><X className="w-5 h-5 text-slate-400" /></button>
               </div>
               <form onSubmit={handleSaveBranch} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                         <label className={labelClass}>Nazwa Rozpoznawcza</label>
                         <input required placeholder="Magazyn Północny" className={inputClass} value={branchForm.name} onChange={e => setBranchForm({...branchForm, name: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Typ Obiektu</label>
                         <select className={inputClass} value={branchForm.type} onChange={e => setBranchForm({...branchForm, type: e.target.value})}>
                            <option value="Oddział">Oddział Niesprecyzowany</option>
                            <option value="Siedziba Główna">Siedziba Główna (Biuro)</option>
                            <option value="Magazyn">Magazyn Logistyczny</option>
                            <option value="Sklep">Sklep Detaliczny (Point)</option>
                         </select>
                      </div>
                      <div className="flex items-center pt-6">
                         <input type="checkbox" id="hq" className="w-4 h-4 text-indigo-600 rounded bg-slate-100 border-slate-300" checked={branchForm.isHeadquarters} onChange={e => setBranchForm({...branchForm, isHeadquarters: e.target.checked})} />
                         <label htmlFor="hq" className="ml-2 text-[10px] font-black uppercase text-slate-600 tracking-widest">Jest Główną Siedzibą</label>
                      </div>
                      <div className="col-span-2"><hr className="border-slate-100 my-2" /></div>
                      <div>
                         <label className={labelClass}>Ulica</label>
                         <input required placeholder="Długa" className={inputClass} value={branchForm.street} onChange={e => setBranchForm({...branchForm, street: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Nr Domu/Lokalu</label>
                         <input required placeholder="1/A" className={inputClass} value={branchForm.building} onChange={e => setBranchForm({...branchForm, building: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Kod Pocztowy</label>
                         <input required placeholder="00-001" className={inputClass} value={branchForm.postalCode} onChange={e => setBranchForm({...branchForm, postalCode: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Miasto</label>
                         <input required placeholder="Warszawa" className={inputClass} value={branchForm.city} onChange={e => setBranchForm({...branchForm, city: e.target.value})} />
                      </div>
                   </div>
                   <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-slate-900 text-white font-black uppercase tracking-widest text-xs rounded-sm transition-all">Autoryzuj Powiązanie</button>
               </form>
            </div>
         </div>
      )}

      {/* MODAL: Kontakt */}
      {isContactModalOpen && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] min-h-0 animate-in zoom-in-95 border-t-4 border-pink-500">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                 <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{contactForm.id ? 'Edycja Persony' : 'Nowa Osoba Kontaktowa (Wizytówka)'}</h3>
                 <button onClick={() => setIsContactModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-sm transition-all"><X className="w-5 h-5 text-slate-400" /></button>
               </div>
               <form onSubmit={handleSaveContact} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className={labelClass}>Imię</label>
                         <input required className={inputClass} value={contactForm.firstName} onChange={e => setContactForm({...contactForm, firstName: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Nazwisko</label>
                         <input required className={inputClass} value={contactForm.lastName} onChange={e => setContactForm({...contactForm, lastName: e.target.value})} />
                      </div>
                      <div className="col-span-2">
                         <label className={labelClass}>Przypisz do Ośrodka (Oddziału)</label>
                         <select className={inputClass} value={contactForm.branchId} onChange={e => setContactForm({...contactForm, branchId: e.target.value})}>
                            <option value="">Wsparcie Globalne (Opcjonalny)</option>
                            {selectedCompany.branches?.map(b => (
                              <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                            ))}
                         </select>
                      </div>
                      <div className="col-span-2">
                         <label className={labelClass}>Stanowisko / Rola</label>
                         <input placeholder="np. Prezes, E-commerce Mngr" className={inputClass} value={contactForm.role} onChange={e => setContactForm({...contactForm, role: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Telefon Komórkowy</label>
                         <input placeholder="+48 ..." className={inputClass} value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} />
                      </div>
                      <div>
                         <label className={labelClass}>Adres E-mail</label>
                         <input type="email" placeholder="mail@firma.pl" className={inputClass} value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} />
                      </div>
                   </div>
                   <button type="submit" className="w-full py-4 bg-pink-600 hover:bg-slate-900 text-white font-black uppercase tracking-widest text-xs rounded-sm transition-all">Dodaj Do Wizytownika</button>
               </form>
            </div>
         </div>
      )}

    </div>
  );
};

export default CrmView;
