import React from 'react';
import { Plus, Users, Settings } from 'lucide-react';

import { getInitials, getDepartmentColor } from '../utils';

export default function AdminView({ users, setEditingUser, setIsUserEditModalOpen }) {
  return (
    <div className="flex-1 flex flex-col p-12 bg-[#f8fafc] min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-12 shrink-0">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Panel Kontrolny</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-2">Zarządzanie infrastrukturą Nexus ERP</p>
        </div>
        <div className="flex space-x-4">
          <button className="px-8 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm">Eksport Danych</button>
          <button className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-2xl shadow-indigo-200 transition-all">Nowy Operator</button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 overflow-y-auto custom-scrollbar pb-12 pr-4">
        {/* User Management Module */}
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col h-[40rem] relative group">
          <div className="p-10 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center mr-6 shadow-2xl shadow-indigo-200">
                <Users className="w-6 h-6 text-white"/>
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.25em]">Kadra Pracownicza</h3>
            </div>
            <button className="p-3 bg-white border border-slate-200 hover:bg-indigo-600 hover:text-white rounded-2xl text-slate-400 transition-all shadow-sm"><Plus className="w-6 h-6"/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-slate-100">
                <tr>
                  <th className="px-10 py-6">Konsultant / Operator</th>
                  <th className="px-10 py-6 text-center">Rola Systemowa</th>
                  <th className="px-10 py-6 text-right">Zarządzanie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-10 py-8">
                      <div className="flex items-center text-left">
                        <div className={`w-12 h-12 rounded-[1.25rem] ${getDepartmentColor(u.department)} flex items-center justify-center text-[11px] font-black mr-5`}>
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <div className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1.5">{u.name}</div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-center">
                      <div className="flex flex-col items-center">
                        <span className="px-5 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] mb-2 shadow-lg">{u.role}</span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{u.group || 'STANDARD'}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex justify-end space-x-3">
                        <button onClick={() => { setEditingUser(u); setIsUserEditModalOpen(true); }} className="p-4 bg-indigo-50 text-indigo-600 rounded-[1.25rem] hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-90">
                          <Settings className="w-5 h-5"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health Module */}
        <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden flex flex-col justify-center">
           <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full"></div>
           <div className="relative z-10">
              <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.4em] mb-8">System Health & Metrics</h3>
              <div className="grid grid-cols-2 gap-10">
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">99.9%</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uptime Core</div>
                 </div>
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">24ms</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API Latency</div>
                 </div>
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">Active</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PIM Sync</div>
                 </div>
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">Safe</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Encryption</div>
                 </div>
              </div>
              <div className="mt-12 p-8 bg-white/5 rounded-[2rem] border border-white/10">
                 <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Database Load</span>
                    <span className="text-[10px] font-black text-emerald-400">Normal</span>
                 </div>
                 <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-1/3 shadow-lg shadow-indigo-500/50"></div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
