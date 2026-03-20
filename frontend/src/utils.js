export const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

export const getDepartmentColor = (department) => {
  const d = department?.toUpperCase() || '';
  if (d.includes('ZARZ') || d.includes('PREZES') || d.includes('OWNER') || d.includes('CEO')) return 'bg-slate-900 border-slate-700 text-white shadow-md';
  if (d.includes('ADMIN') || d.includes('SYSTEM')) return 'bg-slate-800 border-slate-700 text-white shadow-md';
  if (d.includes('BIUR') || d.includes('OFFICE')) return 'bg-cyan-600 border-cyan-500 text-white shadow-md';
  if (d.includes('MARKETING')) return 'bg-pink-600 border-pink-500 text-white shadow-md';
  if (d.includes('ECOMMERCE') || d.includes('E-COMMERCE')) return 'bg-blue-600 border-blue-500 text-white shadow-md';
  if (d.includes('B2B')) return 'bg-emerald-600 border-emerald-500 text-white shadow-md';
  if (d.includes('B2C')) return 'bg-teal-600 border-teal-500 text-white shadow-md';
  if (d.includes('MAGAZYN')) return 'bg-amber-600 border-amber-500 text-white shadow-md';
  if (d.includes('LOGISTYKA')) return 'bg-orange-600 border-orange-500 text-white shadow-md';
  if (d.includes('IT') || d.includes('TECH')) return 'bg-indigo-600 border-indigo-500 text-white shadow-md';
  if (d.includes('KADRY') || d.includes('HR')) return 'bg-rose-600 border-rose-500 text-white shadow-md';
  if (d.includes('AGENC')) return 'bg-purple-600 border-purple-500 text-white shadow-md';
  if (d.includes('GOŚĆ') || d.includes('GOSC') || d.includes('GUEST')) return 'bg-slate-400 border-slate-300 text-white shadow-md';
  return 'bg-slate-500 border-slate-400 text-white shadow-sm';
};
