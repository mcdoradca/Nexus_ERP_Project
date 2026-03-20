import React from 'react';
import { Plus, ChevronRight, Clock } from 'lucide-react';
import { getInitials, getDepartmentColor } from '../utils';

const ProjectsView = ({
  projects,
  tasks,
  currentUser,
  setIsNewProjectModalOpen,
  setSelectedProject
}) => {
  return (
    <div className="flex-1 flex flex-col p-10 bg-[#f8fafc] min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-10 shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Projekty Operacyjne</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Zarządzanie Jednostkami i Zadaniami Zespołu</p>
        </div>
        {currentUser?.role === 'ADMIN' && (
          <button onClick={() => setIsNewProjectModalOpen(true)} className="px-8 py-3 bg-slate-900 text-white rounded-sm text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl flex items-center">
            <Plus className="w-4 h-4 mr-3" /> Nowy Projekt
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 overflow-y-auto custom-scrollbar pr-4 pb-12">
        {projects.map(p => {
          const projectTasks = tasks.filter(t => t.projectId === p.id);
          const doneTasks = projectTasks.filter(t => t.status === 'DONE').length;
          const progress = projectTasks.length > 0 ? (doneTasks / projectTasks.length) * 100 : 0;
          
          return (
            <div key={p.id} onClick={() => setSelectedProject(p)} className="group bg-white rounded-[3rem] border border-slate-100 p-10 shadow-[0_8px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.1)] hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden flex flex-col active:scale-[0.98]">
              <div className={`absolute top-0 left-0 w-3 h-full ${p.color} shadow-lg shadow-black/5`}></div>
              
              <div className="flex justify-between items-start mb-8">
                <div className={`px-4 py-1.5 rounded-sm border ${p.color.replace('bg-', 'bg-').replace('500', '50')} ${p.color.replace('bg-', 'text-').replace('500', '700')} ${p.color.replace('bg-', 'border-').replace('500', '100')} text-[10px] font-black uppercase tracking-widest`}>
                  {p.category || 'PROJEKT ERP'}
                </div>
                <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-4 uppercase leading-tight group-hover:text-indigo-600 transition-colors tracking-tight">{p.name}</h3>
              <p className="text-xs text-slate-500 font-bold mb-10 line-clamp-3 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{p.description}</p>
              
              <div className="mt-auto">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Postęp Realizacji</span>
                  <span className="text-[10px] font-black text-slate-900">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner mb-8">
                  <div className={`h-full ${p.color} transition-all duration-1000 shadow-sm`} style={{ width: `${progress}%` }}></div>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                   <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <Clock className="w-3.5 h-3.5 mr-2" /> Start: {new Date(p.createdAt).toLocaleDateString()}
                   </div>
                   <div className="flex -space-x-3">
                     {projectTasks.slice(0, 4).map(t => (
                       <div key={t.id} className={`w-9 h-9 rounded-sm ${getDepartmentColor(t.assignees?.[0]?.department)} border border-white flex items-center justify-center text-[9px] font-black shadow-xl`}>{getInitials(t.assignees?.[0]?.name)}</div>
                     ))}
                     {projectTasks.length > 4 && (
                       <div className="w-9 h-9 rounded-sm bg-indigo-600 border-4 border-white flex items-center justify-center text-[9px] font-black text-white shadow-xl">+{projectTasks.length - 4}</div>
                     )}
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectsView;
