import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Users, Settings, Archive, RotateCcw, Search, CloudLightning, Save, CheckCircle2, Trash2, ShoppingCart, ExternalLink, Loader2, Image, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getInitials, getDepartmentColor } from '../utils';

const AdminPanelView = ({
  users,
  setUsers,
  setIsNewUserModalOpen,
  setEditingUser,
  setIsUserEditModalOpen,
  token,
  API_URL
}) => {
  const [activeTab, setActiveTab] = useState('USERS'); // 'USERS' | 'ARCHIVE' | 'INTEGRATIONS' | 'PHOTOROOM_DEBUG'
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [debugImages, setDebugImages] = useState([]);
  const [baseLinkerToken, setBaseLinkerToken] = useState('');
  const [tokenMeta, setTokenMeta] = useState(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [tokenVerifyInfo, setTokenVerifyInfo] = useState(null);
  
  const [allegroAuthData, setAllegroAuthData] = useState(null);
  const [isAllegroPolling, setIsAllegroPolling] = useState(false);
  const [allegroSuccess, setAllegroSuccess] = useState(false);
  const [allegroError, setAllegroError] = useState('');
  const pollInterval = React.useRef(null);

  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);
  
  useEffect(() => {
    if (activeTab === 'ARCHIVE') {
       axios.get(`${API_URL}/api/tasks/archive/list`, { headers: { Authorization: `Bearer ${token}` } })
         .then(res => setArchivedTasks(res.data))
         .catch(err => console.error(err));
    } else if (activeTab === 'INTEGRATIONS') {
       axios.get(`${API_URL}/api/settings/BASELINKER_TOKEN`, { headers: { Authorization: `Bearer ${token}` } })
         .then(res => {
           setTokenMeta(res.data || null);
           setBaseLinkerToken('');
         })
         .catch(err => console.error(err));
    } else if (activeTab === 'PHOTOROOM_DEBUG') {
       axios.get(`${API_URL}/api/photoroom/debug/list`, { headers: { Authorization: `Bearer ${token}` } })
         .then(res => setDebugImages(res.data.files || []))
         .catch(err => console.error(err));
    }
  }, [activeTab, API_URL, token]);

  const startAllegroAuth = async () => {
    setAllegroError('');
    setAllegroSuccess(false);
    try {
      const res = await axios.post(`${API_URL}/api/allegro/auth/start`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        setAllegroAuthData(res.data);
        setIsAllegroPolling(true);
        
        pollInterval.current = setInterval(async () => {
          try {
            const pollRes = await axios.post(`${API_URL}/api/allegro/auth/poll`, {}, { headers: { Authorization: `Bearer ${token}` } });
            if (pollRes.data.success) {
              clearInterval(pollInterval.current);
              setIsAllegroPolling(false);
              setAllegroSuccess(true);
              setAllegroAuthData(null);
            }
          } catch (pollErr) {
            if (pollErr.response && pollErr.response.status === 202) {
              // oczekiwanie na użytkownika
            } else {
              clearInterval(pollInterval.current);
              setIsAllegroPolling(false);
              setAllegroError(pollErr.response?.data?.error || 'Błąd autoryzacji tokena.');
            }
          }
        }, 5000);
      }
    } catch (err) {
      setAllegroError(err.response?.data?.error || 'Nie udało się nawiązać połączenia z API.');
    }
  };

  const handleVerifyToken = async () => {
     setTokenError('');
     setTokenVerifyInfo(null);
     setIsVerifyingToken(true);
     try {
        const res = await axios.post(`${API_URL}/api/settings/BASELINKER_TOKEN/verify`, {}, { headers: { Authorization: `Bearer ${token}` } });
        setTokenVerifyInfo(res.data);
     } catch (err) {
        setTokenError(err.response?.data?.errorMessage || err.response?.data?.error || 'Nie udało się zweryfikować tokena BaseLinker.');
     } finally {
        setIsVerifyingToken(false);
     }
  };

  const handleSaveToken = async () => {
     setTokenError('');
     setTokenSaved(false);
     setTokenVerifyInfo(null);
     const trimmed = baseLinkerToken.trim();
     if (trimmed.length < 25) {
        setTokenError(`Token jest zbyt krótki (${trimmed.length} zn.). Wklej pełny, ważny token API z Base.com — baza danych nie została zmieniona.`);
        return;
     }
     setIsSavingToken(true);
     try {
        const res = await axios.post(
          `${API_URL}/api/settings`,
          { key: 'BASELINKER_TOKEN', value: trimmed, confirmOverwrite },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setBaseLinkerToken('');
        setConfirmOverwrite(false);
        setTokenMeta(res.data || null);
        setTokenVerifyInfo({
          ok: true,
          source: res.data?.tokenSource || 'db',
          encrypted: true,
          inventories: res.data?.inventories || []
        });
        setTokenSaved(true);
        setTimeout(() => setTokenSaved(false), 5000);
     } catch (err) {
        setTokenError(err.response?.data?.error || 'Błąd weryfikacji lub zapisu tokena (poprzedni stan bazy został zachowany).');
     } finally {
        setIsSavingToken(false);
     }
  };

  const handleRestore = async (taskId) => {
     try {
        await axios.patch(`${API_URL}/api/tasks/${taskId}/restore`, {}, { headers: { Authorization: `Bearer ${token}` } });
        setArchivedTasks(archivedTasks.filter(t => t.id !== taskId));
     } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (userId, userName) => {
     if (window.confirm(`Czy na pewno chcesz usunąć pracownika: ${userName}?\nZostanie on zarchiwizowany (soft-delete).`)) {
         try {
             await axios.delete(`${API_URL}/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
             if (setUsers) {
                 setUsers(users.filter(u => u.id !== userId));
             }
         } catch (err) {
             alert(err.response?.data?.error || 'Błąd podczas usuwania pracownika');
         }
     }
  };

  return (
    <div className="flex-1 flex flex-col p-10 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] min-h-0 overflow-hidden relative">
      <div className="bg-white border-b border-slate-200 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between p-2 px-4 md:py-2.5 gap-3 mb-6 rounded-lg shadow-sm relative z-10">
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-tight">Panel Administracyjny</h2>
          <p className="text-[10px] font-medium text-slate-500">Nadzór nad uprawnieniami Nexus ERP</p>
        </div>
        <div className="flex space-x-4">
          <button onClick={() => setIsNewUserModalOpen(true)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-500 shadow-sm transition-all flex items-center">
             <Plus className="w-3.5 h-3.5 mr-1.5" /> Nowy Operator
          </button>
        </div>
      </div>
      
      <div className="flex space-x-2 mb-4 shrink-0 relative z-10">
         <button onClick={() => setActiveTab('USERS')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'USERS' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Users className="w-3.5 h-3.5 mr-1.5" /> Baza Osobowościowa
         </button>
         <button onClick={() => setActiveTab('ARCHIVE')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'ARCHIVE' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Archiwum Zadań
         </button>
         <button onClick={() => setActiveTab('INTEGRATIONS')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'INTEGRATIONS' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <CloudLightning className="w-3.5 h-3.5 mr-1.5" /> Integracje API
         </button>
         <button onClick={() => setActiveTab('PHOTOROOM_DEBUG')} className={`px-4 py-2 rounded-md text-xs font-medium transition-all flex items-center shadow-sm ${activeTab === 'PHOTOROOM_DEBUG' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Image className="w-3.5 h-3.5 mr-1.5" /> Debug Photoroom
         </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
        <div className="bg-white rounded-sm border border-slate-300 shadow-[0_15px_40px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col min-h-[30rem] w-full">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-slate-900 rounded-sm flex items-center justify-center mr-5 shadow-xl shadow-slate-900/20">
                {activeTab === 'USERS' && <Users className="w-5 h-5 text-white"/>}
                {activeTab === 'ARCHIVE' && <Archive className="w-5 h-5 text-emerald-400" />}
                {activeTab === 'INTEGRATIONS' && <CloudLightning className="w-5 h-5 text-fuchsia-400" />}
                {activeTab === 'PHOTOROOM_DEBUG' && <Image className="w-5 h-5 text-indigo-400" />}
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.25em]">
                {activeTab === 'USERS' && 'Kadra Pracownicza i Uprawnienia'}
                {activeTab === 'ARCHIVE' && 'Globalne Repozytorium Historycznych Zadań'}
                {activeTab === 'INTEGRATIONS' && 'Skarbiec Kluczy Autoryzacyjnych API'}
                {activeTab === 'PHOTOROOM_DEBUG' && 'Logi Graficzne z Silnika Photoroom'}
              </h3>
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto">
             {activeTab === 'USERS' ? (
                <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50/80 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-300">
                <tr>
                  <th className="px-8 py-5">Operator</th>
                  <th className="px-8 py-5 text-center">Rola</th>
                  <th className="px-8 py-5 text-center">Grupa</th>
                  <th className="px-8 py-5 text-center">Departament</th>
                  <th className="px-8 py-5">Dostępne Moduły</th>
                  <th className="px-8 py-5 text-right">Zarządzanie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-8 py-6">
                      <div className="flex items-center text-left">
                        <div className={`w-10 h-10 rounded-sm ${getDepartmentColor(u.department)} flex items-center justify-center text-[10px] font-black mr-4`}>
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1 group-hover:text-indigo-600 transition-colors">{u.name}</div>
                          <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-sm text-[8px] font-black uppercase tracking-[0.2em] ${u.role === 'ADMIN' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-100 text-slate-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{u.group || 'STANDARD'}</span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{u.department || 'BRAK'}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-1.5 max-w-sm">
                        {u.accessibleModules?.length > 0 
                          ? u.accessibleModules.map(m => <span key={m} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black rounded uppercase">{m}</span>)
                          : <span className="text-rose-500 text-[8px] font-black uppercase">Brak widoków</span>
                        }
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end space-x-2">
                        <button onClick={() => { setEditingUser({...u, accessibleModules: u.accessibleModules || []}); setIsUserEditModalOpen(true); }} className="p-3 bg-white border border-slate-400 text-slate-600 rounded-sm hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95 group-hover:border-indigo-200">
                          <Settings className="w-4 h-4"/>
                        </button>
                        <button onClick={() => handleDeleteUser(u.id, u.name)} className="p-3 bg-white border border-slate-400 text-rose-500 rounded-sm hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-95 group-hover:border-rose-200" title="Usuń konto">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : activeTab === 'ARCHIVE' ? (
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50/80 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-300">
                    <tr>
                      <th className="px-8 py-5">Tytuł Zlecenia / Ticket</th>
                      <th className="px-8 py-5 text-center">Data Założenia</th>
                      <th className="px-8 py-5 text-center">Twórca</th>
                      <th className="px-8 py-5">Powiązania</th>
                      <th className="px-8 py-5 text-right flex justify-end">Opcje Operacyjne</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {archivedTasks.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-all group">
                         <td className="px-8 py-6">
                            <div className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{t.title}</div>
                            <div className="text-[9px] font-black text-slate-600 font-mono tracking-widest">{t.taskId}</div>
                         </td>
                         <td className="px-8 py-6 text-center text-[10px] font-bold text-slate-500">
                            {new Date(t.createdAt).toLocaleDateString()}
                         </td>
                         <td className="px-8 py-6 text-center text-[10px] font-black text-indigo-700 uppercase">
                            {t.creator?.name || 'DOMYŚLNY'}
                         </td>
                         <td className="px-8 py-6">
                            {(t.project || t.campaign) ? (
                              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[8px] font-black rounded uppercase">
                                {t.project ? `PROJEKT: ${t.project.name}` : `KAMPANIA: ${t.campaign.name}`}
                              </span>
                            ) : <span className="text-[9px] font-black text-slate-300 uppercase">Zadanie Abstrakcyjne (Luźne)</span>}
                         </td>
                         <td className="px-8 py-6 text-right">
                           <div className="flex justify-end pr-2">
                             <button onClick={() => handleRestore(t.id)} className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-500 hover:text-white rounded-sm text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center active:scale-95 group-hover:border-emerald-300">
                               <RotateCcw className="w-3 h-3 mr-2" /> Przywróć na Tablicę
                             </button>
                           </div>
                         </td>
                      </tr>
                    ))}
                    {archivedTasks.length === 0 && (
                      <tr><td colSpan="5" className="px-8 py-10 text-center"><div className="flex flex-col items-center"><Archive className="w-10 h-10 text-slate-200 mb-4" /><span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Brak zamkniętych zgłoszeń. System jest czysty.</span></div></td></tr>
                    )}
                  </tbody>
                </table>
            ) : activeTab === 'INTEGRATIONS' ? (
                <div className="p-12">
                   <div className="max-w-3xl bg-white border border-slate-300 rounded-sm p-10 shadow-[0_15px_40px_rgba(0,0,0,0.03)] focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                      <div className="flex items-center mb-8">
                         <div className="w-16 h-16 bg-blue-50 rounded-sm flex items-center justify-center mr-6 border border-blue-100">
                            <CloudLightning className="w-8 h-8 text-blue-600 drop-shadow-sm" />
                         </div>
                         <div>
                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Połączenie BaseLinker</h4>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Główny Token Personalny / X-BLToken</p>
                         </div>
                      </div>
                      
                      <div className="space-y-4">
                         <p className="text-xs text-slate-500 font-bold mb-4">Wklej tutaj swój wygenerowany BaseLinker Token. Przed zapisem backend przetestuje połączenie z Base.com, zaszyfruje token (AES-256-GCM) i nigdy nie odeśle go z powrotem do przeglądarki.</p>

                         {tokenMeta && (
                           <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-sm text-xs">
                             <div className="flex items-center gap-2 text-slate-700 font-bold">
                               <ShieldCheck className={`w-4 h-4 ${tokenMeta.configured ? 'text-emerald-600' : 'text-amber-500'}`} />
                               <span>
                                 Status: {tokenMeta.configured
                                   ? `Zapisany (${tokenMeta.tokenSource === 'env' ? 'ENV serwera' : tokenMeta.encrypted ? 'Szyfrowany AES-256-GCM w bazie' : 'Legacy w bazie'})`
                                   : 'Brak aktywnego klucza'}
                               </span>
                               {tokenMeta.updatedAt && (
                                 <span className="text-[11px] font-normal text-slate-500">
                                   • Zmiana: {new Date(tokenMeta.updatedAt).toLocaleString('pl-PL')}
                                 </span>
                               )}
                             </div>
                             <button
                               type="button"
                               onClick={handleVerifyToken}
                               disabled={isVerifyingToken}
                               className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-sm text-[10px] font-black uppercase tracking-wider hover:bg-slate-100 disabled:opacity-50 flex items-center"
                             >
                               {isVerifyingToken ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                               Testuj połączenie
                             </button>
                           </div>
                         )}

                         <div className="flex space-x-4">
                            <input
                               id="bl_personal_api_token_once"
                               name="bl_personal_api_token_once"
                               type="password"
                               autoComplete="new-password"
                               data-lpignore="true"
                               data-1p-ignore="true"
                               data-form-type="other"
                               placeholder="Wklej pełny token Base.com (pole celowo zawsze puste)"
                               className="flex-1 px-6 py-4 bg-slate-50 border border-slate-400 rounded-sm text-sm font-mono text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                               value={baseLinkerToken}
                               onChange={(e) => setBaseLinkerToken(e.target.value)}
                            />
                            <button
                               type="button"
                               onClick={handleSaveToken}
                               disabled={isSavingToken}
                               className="px-8 py-4 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 shadow-xl shadow-slate-900/10 transition-all active:scale-95 flex items-center hover:shadow-indigo-500/20 disabled:opacity-50"
                            >
                               {isSavingToken ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Weryfikacja...</> : tokenSaved ? <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400"/> Zapisano i Zweryfikowano</> : <><Save className="w-4 h-4 mr-2"/> Zweryfikuj i Zapisz</>}
                            </button>
                         </div>

                         {tokenMeta?.configured && tokenMeta?.tokenSource === 'db' && (
                           <label className="flex items-center gap-2 text-xs text-slate-600 font-semibold cursor-pointer select-none pt-1">
                             <input
                               type="checkbox"
                               checked={confirmOverwrite}
                               onChange={(e) => setConfirmOverwrite(e.target.checked)}
                               className="rounded border-slate-400"
                             />
                             Świadomie potwierdzam zastąpienie obecnego tokena w bazie (wymagane tylko jeśli obecny token działa)
                           </label>
                         )}

                         {tokenError && (
                           <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm flex items-start gap-2">
                             <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                             <span>{tokenError}</span>
                           </div>
                         )}

                         {tokenVerifyInfo && (
                           <div className={`p-3.5 border text-xs font-bold rounded-sm ${tokenVerifyInfo.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                             {tokenVerifyInfo.ok ? (
                               <span>
                                 Połączenie z Base.com aktywne (źródło: {tokenVerifyInfo.source === 'env' ? 'ENV' : 'baza AES-256-GCM'}). Wykryte katalogi ({tokenVerifyInfo.inventories?.length || 0}): {(tokenVerifyInfo.inventories || []).map(i => `${i.name} [#${i.inventory_id}]`).join(', ') || 'brak'}.
                               </span>
                             ) : (
                               <span>Test połączenia nieudany ({tokenVerifyInfo.errorCode}): {tokenVerifyInfo.errorMessage}</span>
                             )}
                           </div>
                         )}
                      </div>
                   </div>

                   <div className="max-w-3xl bg-white border border-slate-300 rounded-sm p-10 shadow-[0_15px_40px_rgba(0,0,0,0.03)] focus-within:ring-4 focus-within:ring-orange-500/10 transition-all mt-8">
                      <div className="flex items-center mb-8">
                         <div className="w-16 h-16 bg-orange-50 rounded-sm flex items-center justify-center mr-6 border border-orange-100">
                            <ShoppingCart className="w-8 h-8 text-orange-500 drop-shadow-sm" />
                         </div>
                         <div>
                            <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Autoryzacja Allegro</h4>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">OAuth2 Device Flow / Odświeżanie Tokenu</p>
                         </div>
                      </div>
                      
                      <div className="space-y-4">
                         <p className="text-xs text-slate-500 font-bold mb-6">Użyj tego przycisku, gdy stracisz połączenie z Allegro (Device Flow). Wygenerowany zostanie link autoryzacyjny. Pamiętaj, by logować się na właściwe konto firmowe.</p>
                         
                         {!allegroAuthData && !isAllegroPolling && (
                           <button 
                              onClick={startAllegroAuth} 
                              className="px-8 py-4 bg-orange-500 text-white rounded-sm text-[10px] font-black uppercase tracking-[0.2em] hover:bg-orange-600 shadow-xl shadow-orange-500/20 transition-all active:scale-95 flex items-center"
                           >
                              <RotateCcw className="w-4 h-4 mr-2" /> Wymuś Odświeżenie Sesji
                           </button>
                         )}

                         {allegroError && (
                           <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm mt-4">
                             {allegroError}
                           </div>
                         )}

                         {allegroSuccess && (
                           <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-sm mt-4 flex items-center">
                             <CheckCircle2 className="w-4 h-4 mr-2" /> Sukces! Token został zapisany w systemie PIM.
                           </div>
                         )}

                         {allegroAuthData && isAllegroPolling && (
                           <div className="p-6 bg-slate-50 border border-slate-200 rounded-sm mt-4">
                             <p className="text-sm font-bold text-slate-800 mb-2">Wymagana Akcja Użytkownika</p>
                             <p className="text-xs text-slate-600 mb-4">{allegroAuthData.message}</p>
                             
                             <div className="flex items-center space-x-4 bg-white p-4 border border-slate-300 rounded-sm shadow-sm mb-4">
                                <a 
                                  href={allegroAuthData.verification_uri_complete} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex-1 text-sm font-mono text-indigo-600 hover:text-indigo-800 truncate"
                                >
                                  {allegroAuthData.verification_uri_complete}
                                </a>
                                <ExternalLink className="w-5 h-5 text-slate-400 shrink-0" />
                             </div>
                             
                             <div className="flex items-center text-xs font-bold text-indigo-600">
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Oczekuję na potwierdzenie w przeglądarce... (Polling)
                             </div>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
            ) : activeTab === 'PHOTOROOM_DEBUG' ? (
                <div className="p-8">
                   <div className="flex justify-between items-center mb-6">
                      <p className="text-xs font-bold text-slate-500">Podgląd na żywo plików zapisanych przez Agenta 11 na dysku w trakcie generowania Photoroom.</p>
                      <button onClick={() => {
                         axios.get(`${API_URL}/api/photoroom/debug/list`, { headers: { Authorization: `Bearer ${token}` } })
                           .then(res => setDebugImages(res.data.files || []))
                           .catch(err => console.error(err));
                      }} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm">
                         Odśwież
                      </button>
                   </div>
                   {debugImages.length === 0 ? (
                      <div className="py-20 text-center"><div className="flex flex-col items-center"><Image className="w-10 h-10 text-slate-200 mb-4" /><span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Brak obrazów w folderze debug_images.</span></div></div>
                   ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                         {debugImages.map(img => (
                            <div key={img.name} className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                               <div className="aspect-square bg-slate-100 overflow-hidden relative">
                                  <img 
                                     src={`${API_URL}/api/photoroom/debug-images/raw/${img.name}`} 
                                     alt={img.name} 
                                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                  />
                               </div>
                               <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                                  <div className="text-[9px] font-black text-slate-800 break-all leading-tight mb-2 uppercase" title={img.name}>
                                     {img.name.replace('photoroom_debug_raw_', '')}
                                  </div>
                                  <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                                     {new Date(img.createdAt).toLocaleString()}
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanelView;
