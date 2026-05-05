import os

fp = r'z:\Nexus_ERP_Project\frontend\src\views\ChatView.jsx'

if os.path.exists(fp):
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Message bubbles
    # Old isMe style: bg-indigo-600 text-white rounded-tr-none border-indigo-500 shadow-indigo-200/40
    # Old other style: bg-white text-slate-800 border-slate-300 rounded-tl-none shadow-slate-200/20
    content = content.replace(
        "isMe ? 'bg-indigo-600 text-white rounded-tr-none border-indigo-500 shadow-indigo-200/40' : 'bg-white text-slate-800 border-slate-300 rounded-tl-none shadow-slate-200/20'",
        "isMe ? 'bg-[#dcf8c6] text-slate-900 rounded-tr-none border border-[#25D366] shadow-[#25D366]/20' : 'bg-white text-slate-800 border border-slate-300 rounded-tl-none shadow-slate-200/20'"
    )
    
    # Input container
    # flex items-center space-x-4 bg-slate-100/50 p-3 rounded-[2.5rem] border border-slate-400
    content = content.replace(
        "bg-slate-100/50 p-3 rounded-[2.5rem] border border-slate-400 focus-within:ring-8 focus-within:ring-indigo-500/5",
        "bg-[#f0f2f5] p-3 rounded-[2.5rem] border-2 border-[#25D366]/50 focus-within:ring-8 focus-within:ring-[#25D366]/20 focus-within:border-[#25D366]"
    )
    
    # Send button
    # bg-slate-900 text-white hover:bg-indigo-600
    content = content.replace(
        "bg-slate-900 text-white hover:bg-indigo-600",
        "bg-[#25D366] text-white hover:bg-[#1ebd55]"
    )
    
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)
    print("WhatsApp ChatView styling applied")
else:
    print("ChatView.jsx not found")
