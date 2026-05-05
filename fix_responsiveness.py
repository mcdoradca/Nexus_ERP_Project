import os

fp = r'z:\Nexus_ERP_Project\frontend\src\App.jsx'
if os.path.exists(fp):
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Right section spacing
    content = content.replace('className="flex items-center space-x-5"', 'className="flex items-center space-x-2 xl:space-x-5"')
    
    # 2. Logo container margin
    content = content.replace('className="flex items-center cursor-pointer mr-12 group relative"', 'className="flex items-center cursor-pointer mr-4 xl:mr-12 group relative shrink-0"')
    
    # 3. Nav buttons padding and shrink
    content = content.replace('px-5 py-2 rounded-sm', 'px-3 xl:px-5 py-2 rounded-sm shrink-0')
    
    # 4. Hide user text on smaller screens to save space
    content = content.replace('className="hidden lg:block ml-4"', 'className="hidden 2xl:block ml-4"')

    # 5. Nav container scroll
    content = content.replace('className="hidden lg:flex items-center space-x-1 bg-slate-50/80 p-1.5 rounded-sm border border-slate-100 backdrop-blur-sm"', 'className="hidden lg:flex items-center space-x-1 bg-slate-50/80 p-1.5 rounded-sm border border-slate-100 backdrop-blur-sm overflow-x-auto custom-scrollbar flex-nowrap max-w-full"')

    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done")
