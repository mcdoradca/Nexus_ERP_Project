import React from 'react';
import { Clock, PlayCircle, Eye, CheckCircle2, Megaphone, Folder, Plus, AlertOctagon, ChevronRight, Zap, MessageCircle } from 'lucide-react';

export default function KanbanView({ tasks, projects, campaigns, selectedFilterId, setSelectedFilterId, setIsNewTaskModalOpen, setSelectedTask }) {
  const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  const columns = [
    { id: 'TODO', name: 'Zaległe / Backlog', color: 'bg-slate-100', icon: <Clock className="w-3.5 h-3.5 mr-2 text-slate-500" />, dot: 'bg-slate-400' },
    { id: 'IN_PROGRESS', name: 'W Realizacji', color: 'bg-indigo-50/50', icon: <PlayCircle className="w-3.5 h-3.5 mr-2 text-indigo-600" />, dot: 'bg-indigo-600' },
    { id: 'REVIEW', name: 'Weryfikacja QA', color: 'bg-amber-50/50', icon: <Eye className="w-3.5 h-3.5 mr-2 text-amber-600" />, dot: 'bg-amber-500' },
    { id: 'DONE', name: 'Zakończone', color: 'bg-emerald-50/50', icon: <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" />, dot: 'bg-emerald-500' }
  ];

  let filteredTasks = tasks;
  if (selectedFilterId !== 'all') {
    if (selectedFilterId.startsWith('proj_')) {
      filteredTasks = tasks.filter(t => t.projectId === selectedFilterId.replace('proj_', ''));
    } else {
      filteredTasks = tasks.filter(t => t.campaignId === selectedFilterId);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#f8fafc] animate-in fade-in duration-500">
      {/* KANBAN FILTERS */}
      <div className="px-10 py-6 flex items-center justify-between border-b border-slate-200/50 bg-white/50 backdrop-blur-md shrink-0 z-10 shadow-sm">
        <div className="flex items-center space-x-3 overflow-x-auto custom-scrollbar no-scrollbar scroll-smooth">
          <div onClick={() => setSelectedFilterId('all')} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all duration-300 shrink-0 ${selectedFilterId === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-900/20' : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200 hover:shadow-md'}`}>Wszystkie Zadania</div>
          {campaigns.map(c => (
            <div key={c.id} onClick={() => setSelectedFilterId(c.id)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all duration-300 shrink-0 flex items-center ${selectedFilterId === c.id ? `${c.color} text-white border-transparent shadow-xl shadow-pink-200/50 scale-105` : 'bg-white text-slate-500 border-slate-100 hover:border-pink-200 hover:shadow-md group'}`}>
              <Megaphone className={`w-3.5 h-3.5 mr-2 ${selectedFilterId === c.id ? 'text-white' : 'text-slate-400 group-hover:text-pink-500'}`} /> {c.name}
            </div>
          ))}
          {projects.map(p => (
            <div key={p.id} onClick={() => setSelectedFilterId(`proj_${p.id}`)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all duration-300 shrink-0 flex items-center ${selectedFilterId === `proj_${p.id}` ? `${p.color} text-white border-transparent shadow-xl shadow-indigo-200/50 scale-105` : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200 hover:shadow-md group'}`}>
              <Folder className={`w-3.5 h-3.5 mr-2 ${selectedFilterId === `proj_${p.id}` ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`} /> {p.name}
            </div>
          ))}
        </div>
        <button onClick={() => setIsNewTaskModalOpen(true)} className="px-8 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.15)] flex items-center active:scale-95 ml-6 shrink-0 border border-slate-700">
          <Plus className="w-4 h-4 mr-2" /> Uruchom Zadanie
        </button>
      </div>

      {/* KANBAN BOARD CONTENT */}
      <div className="flex-1 overflow-x-auto p-10 flex space-x-8 scroll-smooth bg-slate-50/30">
        {columns.map(col => (
          <div key={col.id} className={`w-[24rem] flex-shrink-0 flex flex-col min-h-0 bg-white/40 backdrop-blur-sm rounded-[3rem] p-5 border border-slate-200/50 shadow-sm ${col.color}`}>
            <div className="flex items-center justify-between px-6 py-5 mb-4 bg-white/60 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex items-center">
                <span className={`w-3 h-3 rounded-full ${col.dot} mr-3 shadow-inner ring-4 ring-white`}></span>
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em]">{col.name}</span>
              </div>
              <span className="bg-white px-4 py-1.5 rounded-xl text-[10px] font-black text-slate-500 border border-slate-100 shadow-sm tabular-nums">{filteredTasks.filter(t => t.status === col.id).length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 px-1 pb-6 pt-2">
              {filteredTasks.filter(t => t.status === col.id).map((task, idx) => (
                <div key={task.id} onClick={() => setSelectedTask(task)} className="group bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_50px_rgba(99,102,241,0.1)] hover:border-indigo-200 transition-all duration-300 cursor-pointer relative overflow-hidden active:scale-[0.98] animate-in slide-in-from-bottom-4" style={{ animationDelay: `${idx * 40}ms` }}>
                  {task.isBlocked && <div className="absolute top-0 right-0 bg-rose-500 text-white p-3 rounded-bl-3xl shadow-lg animate-pulse z-10"><AlertOctagon className="w-5 h-5" /></div>}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center space-x-3">
                       <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{task.taskId}</span>
                       <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${task.priority === 'HIGH' ? 'bg-rose-50 border-rose-100 text-rose-600' : task.priority === 'MEDIUM' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>{task.priority}</span>
                    </div>
                  </div>
                  <h3 className="text-[14px] font-black text-slate-800 leading-snug mb-5 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{task.title}</h3>
                  {task.project && <div className="inline-flex items-center px-4 py-2 rounded-2xl border border-slate-100 bg-slate-50/80 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6"><Folder className="w-3.5 h-3.5 mr-2 text-slate-400" /> {task.project.name}</div>}
                  <div className="flex items-center justify-between pt-5 border-t border-slate-100/80">
                    <div className="flex -space-x-3">
                      {task.assignees?.slice(0, 3).map(a => <div key={a.id} title={a.name} className={`w-10 h-10 rounded-[1.25rem] flex items-center justify-center text-[10px] font-black ${a.color} text-white ring-4 ring-white shadow-md hover:z-10 transition-transform hover:scale-110`}>{getInitials(a.name)}</div>)}
                    </div>
                    <div className="flex items-center space-x-4 text-slate-400">{task._count?.comments > 0 && <div className="text-[11px] font-black flex items-center"><MessageCircle className="w-4 h-4 mr-1.5" /> {task._count.comments}</div>}<Clock className="w-4 h-4" /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}