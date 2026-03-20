import React, { useState } from 'react';
import { 
  Clock, PlayCircle, Eye, CheckCircle2, Megaphone, Folder, AlertOctagon, 
  ChevronRight, MessageCircle, Zap, Plus, LayoutDashboard, List, Search, Filter 
} from 'lucide-react';
import { getInitials, getDepartmentColor } from '../utils';
import { DevBadge } from '../components/DevBadge';

const KanbanView = ({ 
  tasks, projects, campaigns, 
  selectedFilterId, setSelectedFilterId, 
  setIsNewTaskModalOpen, setSelectedTask, devMode 
}) => {
  const [viewMode, setViewMode] = useState('BOARD'); // 'BOARD' | 'LIST'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const columns = [
    { id: 'TODO', name: 'Zaległe / Backlog', color: 'bg-blue-50 border-blue-200 text-blue-800', icon: <Clock className="w-4 h-4 mr-2" />, dot: 'bg-blue-500' },
    { id: 'IN_PROGRESS', name: 'W Realizacji', color: 'bg-indigo-50 border-indigo-200 text-indigo-800', icon: <PlayCircle className="w-4 h-4 mr-2" />, dot: 'bg-indigo-600' },
    { id: 'REVIEW', name: 'Weryfikacja QA', color: 'bg-amber-50 border-amber-200 text-amber-800', icon: <Eye className="w-4 h-4 mr-2" />, dot: 'bg-amber-600' },
    { id: 'DONE', name: 'Zakończone', color: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: <CheckCircle2 className="w-4 h-4 mr-2" />, dot: 'bg-emerald-600' }
  ];

  let filteredTasks = tasks;
  if (selectedFilterId !== 'all') {
    if (selectedFilterId.startsWith('proj_')) {
      filteredTasks = filteredTasks.filter(t => t.projectId === selectedFilterId.replace('proj_', ''));
    } else {
      filteredTasks = filteredTasks.filter(t => t.campaignId === selectedFilterId);
    }
  }
  
  if (searchQuery.trim() !== '') {
    filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.taskId.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (viewMode === 'LIST' && statusFilter !== 'ALL') {
    filteredTasks = filteredTasks.filter(t => t.status === statusFilter);
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] min-h-0 overflow-hidden relative">
      <DevBadge id="K-10" devMode={devMode} />
      {/* TOOLBAR */}
      <div className="px-8 py-5 flex items-center justify-between border-b border-slate-200 bg-white shadow-sm shrink-0 relative z-10 w-full overflow-x-auto custom-scrollbar">
        <div className="flex items-center space-x-3 shrink-0">
          <div className="text-[12px] font-black uppercase tracking-widest text-slate-400">Widok Operacyjny</div>
        </div>

        <div className="flex items-center space-x-4 shrink-0 px-4 ml-auto">
          <div className="flex items-center bg-slate-100 p-1 rounded-sm border border-slate-200">
            <button onClick={() => setViewMode('BOARD')} className={`flex items-center px-4 py-1.5 rounded-sm text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'BOARD' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" /> Kanban 
            </button>
            <button onClick={() => setViewMode('LIST')} className={`flex items-center px-4 py-1.5 rounded-sm text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'LIST' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <List className="w-3.5 h-3.5 mr-1.5" /> Lista 
            </button>
          </div>
          <button onClick={() => setIsNewTaskModalOpen(true)} className="px-6 py-2.5 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg flex items-center active:scale-95">
            <Plus className="w-4 h-4 mr-1.5" /> Zadanie
          </button>
        </div>
      </div>

      {viewMode === 'LIST' && (
        <div className="px-8 py-3 bg-white border-b border-slate-100 flex items-center space-x-4 shrink-0 z-0">
           <div className="relative">
             <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
             <input type="text" placeholder="Szukaj po tytule lub ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-64" />
           </div>
           <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none cursor-pointer">
                 <option value="ALL">Wszystkie Statusy</option>
                 <option value="TODO">Backlog</option>
                 <option value="IN_PROGRESS">W Realizacji</option>
                 <option value="REVIEW">Weryfikacja</option>
                 <option value="DONE">Zakończone</option>
              </select>
           </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'BOARD' ? (
          <div className="absolute inset-0 overflow-x-auto p-4 lg:p-8 flex space-x-6 scroll-smooth items-start">
            {columns.map(col => (
              <div key={col.id} className="w-[19rem] flex-shrink-0 flex flex-col max-h-full bg-slate-50/80 rounded-sm border border-slate-200/50">
                <div className={`flex items-center justify-between px-4 py-3 m-2 rounded-sm border ${col.color}`}>
                  <div className="flex items-center">
                    {col.icon}
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{col.name}</span>
                  </div>
                  <span className="bg-white/70 px-2 py-0.5 rounded-sm text-[10px] font-black border border-white/50">{filteredTasks.filter(t => t.status === col.id).length}</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-3">
                  {filteredTasks.filter(t => t.status === col.id).map(task => (
                    <div key={task.id} onClick={() => setSelectedTask(task)} className={`group bg-white p-4 rounded-sm border shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden active:scale-[0.98] ${task.isBlocked ? 'border-rose-400 ring-1 ring-rose-400/50' : 'border-slate-200 hover:border-indigo-300'}`}>
                      {task.isBlocked && <div className="absolute top-0 right-0 bg-rose-500 text-white px-2 py-1 rounded-bl-lg font-black text-[8px] uppercase tracking-widest flex items-center z-10">Blokada</div>}
                      {task.activeWorkers?.length > 0 && <div className="absolute top-0 left-0 bg-indigo-600 text-white px-2 py-1 rounded-br-lg font-black text-[8px] uppercase tracking-widest flex items-center z-10 animate-pulse"><Zap className="w-2.5 h-2.5 mr-1" /></div>}
                      
                      <div className="flex justify-between items-start mb-2 mt-1">
                        <span className="text-[8px] font-black text-slate-400 font-mono tracking-tight uppercase">{task.taskId}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${task.priority === 'URGENT' ? 'bg-red-600 text-white animate-pulse' : task.priority === 'HIGH' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                          {task.priority === 'URGENT' ? 'PILNE' : task.priority}
                        </span>
                      </div>

                      <h3 className="text-[11px] font-black text-slate-800 leading-snug mb-3 group-hover:text-indigo-600 transition-colors uppercase tracking-tight line-clamp-3">{task.title}</h3>
                      
                      {task.project && (
                        <div className="inline-flex items-center px-2 py-1 rounded-md bg-slate-50 text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-3 border border-slate-100">
                          <Folder className="w-2.5 h-2.5 mr-1" /> {task.project.name}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-auto">
                        <div className="flex -space-x-1.5">
                          {task.assignees?.slice(0, 3).map(a => {
                            const isWorking = task.activeWorkers?.some(w => w.id === a.id);
                            return (
                              <div key={a.id} title={a.name} className={`w-6 h-6 rounded-sm flex items-center justify-center text-[8px] font-black ${getDepartmentColor(a.department)} relative`}>
                                {getInitials(a.name)}
                                {isWorking && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border border-white rounded-full"></div>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center space-x-2 text-slate-400">
                          {task._count?.comments > 0 && <div className="text-[9px] font-black flex items-center"><MessageCircle className="w-3 h-3 mr-1" /> {task._count.comments}</div>}
                          <Clock className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredTasks.filter(t => t.status === col.id).length === 0 && (
                    <div className="py-6 flex flex-col items-center justify-center opacity-40">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Pusto</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto p-4 lg:p-8 custom-scrollbar bg-white">
             <table className="w-full text-left whitespace-nowrap">
               <thead className="bg-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] border-y-2 border-slate-200 sticky top-0 z-10">
                 <tr>
                   <th className="px-6 py-4 rounded-tl-sm bg-slate-100">Zlecenie (ID / Tytuł)</th>
                   <th className="px-6 py-4 bg-slate-100">Status</th>
                   <th className="px-6 py-4 bg-slate-100">Priorytet</th>
                   <th className="px-6 py-4 bg-slate-100">Przydział</th>
                   <th className="px-6 py-4 bg-slate-100">Powiązanie</th>
                   <th className="px-6 py-4 text-right rounded-tr-sm bg-slate-100">Opcje</th>
                 </tr>
               </thead>
               <tbody className="divide-y-2 divide-slate-100">
                 {filteredTasks.length > 0 ? filteredTasks.map(task => {
                    const colInfo = columns.find(c => c.id === task.status) || columns[0];
                    return (
                      <tr key={task.id} onClick={() => setSelectedTask(task)} className={`odd:bg-white even:bg-slate-50 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer group ${task.isBlocked ? '!bg-rose-50' : ''}`}>
                         <td className="px-6 py-4 bg-transparent group-hover:bg-indigo-50/50">
                            <div className="flex items-center">
                               {task.isBlocked && <AlertOctagon className="w-3.5 h-3.5 text-rose-500 mr-2" />}
                               <div>
                                 <div className="text-xs font-black text-slate-800 uppercase tracking-tight group-hover:text-indigo-600 mb-0.5 truncate max-w-sm">{task.title}</div>
                                 <div className="text-[9px] font-mono text-slate-400 font-bold tracking-widest">{task.taskId}</div>
                               </div>
                            </div>
                         </td>
                         <td className="px-6 py-4">
                            <div className={`inline-flex items-center px-3 py-1.5 rounded-sm border text-[8px] font-black uppercase tracking-widest ${colInfo.color}`}>
                               {colInfo.icon} {colInfo.name}
                            </div>
                         </td>
                         <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${task.priority === 'URGENT' ? 'bg-red-600 text-white animate-pulse' : task.priority === 'HIGH' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                              {task.priority === 'URGENT' ? 'PILNE' : task.priority}
                            </span>
                         </td>
                         <td className="px-6 py-4">
                            <div className="flex -space-x-1.5">
                              {task.assignees?.slice(0, 5).map(a => {
                                return (
                                <div key={a.id} title={a.name} className={`w-6 h-6 rounded-sm flex items-center justify-center text-[8px] font-black ${getDepartmentColor(a.department)}`}>
                                  {getInitials(a.name)}
                                </div>
                                );
                              })}
                            </div>
                         </td>
                         <td className="px-6 py-4">
                            {(task.project || task.campaign) ? (
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                                {task.project ? <Folder className="w-3 h-3 mr-1.5" /> : <Megaphone className="w-3 h-3 mr-1.5" />}
                                {task.project ? task.project.name : task.campaign.name}
                              </span>
                            ) : <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">- LUZ -</span>}
                         </td>
                         <td className="px-6 py-4 text-right">
                            <button onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }} className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-100 rounded-sm text-[9px] font-black uppercase tracking-widest transition-all">
                               Otwórz Szufladę
                            </button>
                         </td>
                      </tr>
                    );
                 }) : (
                   <tr>
                     <td colSpan="6" className="px-6 py-12 text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                        Brak zgłoszeń spełniających wymogi filtra.
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default KanbanView;
