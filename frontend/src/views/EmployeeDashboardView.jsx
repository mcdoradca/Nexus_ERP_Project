import React from 'react';
import { Briefcase, Bell, CheckCircle, Clock, CheckSquare } from 'lucide-react';
import { getDepartmentColor, getInitials } from '../utils';

export default function EmployeeDashboardView({ currentUser, tasks, notifications, campaigns, API_URL, onSelectTask }) {
    // Filtrowanie zadań dla bieżącego użytkownika
    const myTasks = tasks.filter(t => t.assignees?.some(a => a.id === currentUser.id));
    const activeTasks = myTasks.filter(t => t.status !== 'DONE' && t.status !== 'QA_VERIFICATION');
    const myCampaigns = campaigns.filter(c => c.assignees?.some(a => a.id === currentUser.id) || c.assignedGroups?.includes(currentUser.group));

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50 min-h-0">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Powitanie */}
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -z-10"></div>
                    <div className="flex items-center space-x-6 z-10">
                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black text-slate-700 shadow-lg ${getDepartmentColor(currentUser.department)}`}>
                            {getInitials(currentUser.name)}
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Witaj, {currentUser.name}!</h2>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Twój operacyjny pulpit sterowania • {currentUser.department}</p>
                        </div>
                    </div>
                    <div className="text-right z-10 hidden md:block">
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">Oczekujące Zadania</div>
                        <div className="text-4xl font-black text-slate-800">{activeTasks.length}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Główna kolumna - Moje Zadania */}
                    <div className="xl:col-span-2 space-y-6">
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col h-[32rem]">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center">
                                    <CheckSquare className="w-5 h-5 mr-2 text-indigo-500" /> Moje Zadania w Tle
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                                {activeTasks.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                        <CheckCircle className="w-12 h-12 mb-4 opacity-20" />
                                        <span className="text-xs font-bold">Wszystko zrobione! Brak przypisanych zadań.</span>
                                    </div>
                                ) : activeTasks.map(t => (
                                    <div key={t.id} onClick={() => onSelectTask(t)} className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all bg-white group flex justify-between items-center">
                                        <div className="flex items-center space-x-4">
                                            <div className={`w-2 h-10 rounded-full ${t.priority === 'URGENT' ? 'bg-rose-500' : t.priority === 'HIGH' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{t.title}</div>
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center mt-1">
                                                    {t.status} • {t.campaign?.name || t.project?.name || 'Zadanie Ad-Hoc'}
                                                </div>
                                            </div>
                                        </div>
                                        {t.dueDate && (
                                            <div className="text-[10px] font-bold text-slate-400 flex items-center bg-slate-50 px-2 py-1 rounded-md">
                                                <Clock className="w-3 h-3 mr-1" />
                                                {new Date(t.dueDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Boczna kolumna - Notyfikacje & Kampanie */}
                    <div className="space-y-8">
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 max-h-[16rem] flex flex-col">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center mb-6">
                                <Bell className="w-5 h-5 mr-2 text-rose-500" /> Nieprzeczytane Notyfikacje
                            </h3>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                                {notifications.filter(n => !n.isRead).length === 0 ? (
                                    <div className="text-xs font-bold text-slate-400 text-center py-4">Skrzynka jest pusta.</div>
                                ) : notifications.filter(n => !n.isRead).slice(0, 5).map(n => (
                                    <div key={n.id} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl">
                                        <div className="text-xs font-bold text-slate-800">{n.title}</div>
                                        <div className="text-[10px] text-slate-600 mt-1 line-clamp-2">{n.message}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex-1">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center mb-6">
                                <Briefcase className="w-5 h-5 mr-2 text-emerald-500" /> Moje Aktywne Kampanie
                            </h3>
                            <div className="space-y-3">
                                {myCampaigns.length === 0 ? (
                                    <div className="text-xs font-bold text-slate-400 text-center py-4">Brak przypisanych kampanii.</div>
                                ) : myCampaigns.slice(0, 4).map(c => (
                                    <div key={c.id} className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50 rounded-xl">
                                        <span className="text-xs font-bold text-slate-700 truncate pr-4">{c.name}</span>
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${c.status === 'W Realizacji' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{c.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
