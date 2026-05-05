import os
import re

files_to_edit = [
    r'z:\Nexus_ERP_Project\frontend\src\App.jsx',
    r'z:\Nexus_ERP_Project\frontend\src\views\MToolView.jsx',
    r'z:\Nexus_ERP_Project\frontend\src\views\OfferOptimizer\OfferOptimizerView.jsx'
]

replacements = [
    # App.jsx specific header tweaks
    (r'h-20 bg-white border-b border-slate-200/50 flex items-center justify-between px-8', r'h-14 bg-white border-b border-slate-200/50 flex items-center justify-between px-4'),
    (r'pl-12 pr-6 py-2.5 bg-slate-50 border border-slate-100 rounded-\[1rem\] text-\[11px\] font-bold focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-300 w-56', r'pl-10 pr-4 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[11px] font-bold focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-300 w-48'),
    (r'ml-2 px-6 py-3 bg-indigo-600 text-white rounded-\[1.25rem\] text-\[10px\] font-black uppercase tracking-\[0.2em\] hover:bg-indigo-500 active:scale-95 transition-all shadow-\[0_8px_25px_rgba\(79,70,229,0\.3\)\] flex items-center', r'ml-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 active:scale-95 transition-all shadow-[0_4px_15px_rgba(79,70,229,0.3)] flex items-center'),
    
    # Generic paddings and radiuses mass replace
    (r'\bp-12\b', 'p-6'),
    (r'\bp-10\b', 'p-5'),
    (r'\bp-8\b', 'p-4'),
    (r'\brounded-\[3rem\]\b', 'rounded-2xl'),
    (r'\brounded-\[2\.5rem\]\b', 'rounded-2xl'),
    (r'\brounded-\[2rem\]\b', 'rounded-xl'),
    (r'\brounded-\[1\.5rem\]\b', 'rounded-xl'),
    (r'\bmb-12\b', 'mb-6'),
    (r'\bmb-10\b', 'mb-5'),
    (r'\bgap-12\b', 'gap-6'),
    (r'\bgap-10\b', 'gap-5'),
    (r'\bgap-8\b', 'gap-4'),
    (r'\bh-20\b', 'h-14'),
]

for fp in files_to_edit:
    if os.path.exists(fp):
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
            
        for pat, repl in replacements:
            content = re.sub(pat, repl, content)
            
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {fp}")
    else:
        print(f"Not found: {fp}")
