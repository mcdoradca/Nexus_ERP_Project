import os
import glob

files = glob.glob(r'z:\Nexus_ERP_Project\frontend\src\**\*.jsx', recursive=True)

for fp in files:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # 1. Borders
    content = content.replace('border-slate-100', 'border-slate-300')
    content = content.replace('border-slate-200', 'border-slate-400')
    
    # 2. Text colors
    content = content.replace('text-slate-400', 'text-slate-600')
    
    # 3. Gradients on some panels
    content = content.replace('bg-[#f8fafc]', 'bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0]')
    
    if content != original:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {fp}")
print("Finished styling")
