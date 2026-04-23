import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading1, Heading2, List, ListOrdered } from 'lucide-react';

const MenuBar = ({ editor }) => {
    if (!editor) return null;
    return (
        <div className="flex items-center space-x-1 border-b border-slate-200 bg-slate-50 p-2 rounded-t-2xl">
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-200'}`}>
                <Heading1 className="w-4 h-4" />
            </button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 rounded-lg transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-200'}`}>
                <Heading2 className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-slate-300 mx-2"></div>
            <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-200'}`}>
                <Bold className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-slate-300 mx-2"></div>
            <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-200'}`}>
                <List className="w-4 h-4" />
            </button>
            <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-2 rounded-lg transition-colors ${editor.isActive('orderedList') ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-200'}`}>
                <ListOrdered className="w-4 h-4" />
            </button>
            <div className="flex-1"></div>
            <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest px-4">Strict GEO Formatter</span>
        </div>
    );
};

export const StrictWysiwyg = ({ initialContent = "", onChange }) => {
    
    const sanitizeHtmlOnPaste = (dirtyHtml) => {
        if (!dirtyHtml) return "";
        let clean = dirtyHtml.replace(/<strong[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
        clean = clean.replace(/<em[^>]*>/gi, '<b>').replace(/<\/em>/gi, '</b>');
        clean = clean.replace(/<br\s*\/?>/gi, ' ');
        
        // Krytyczna Whitelista 7 tagów GEO Allegro
        const allowedTags = ['h1', 'h2', 'p', 'ul', 'ol', 'li', 'b'];
        const tagRegex = /<\/?([a-z0-9]+)[^>]*>/gi;
        
        clean = clean.replace(tagRegex, (match, tagName) => {
            const lowerTag = tagName.toLowerCase();
            if (allowedTags.includes(lowerTag)) {
                // Rekonstrukcja idealnie czystego tagu (bez absolutnie żadnych atrybutów jak href, class czy style)
                return match.startsWith('</') ? `</${lowerTag}>` : `<${lowerTag}>`;
            }
            // Zabij tag (np. <a>, <span>, <div>, <table>), ale wylej jego zawartość (tekst) na zewnątrz.
            return ''; 
        });
        
        return clean;
    };

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Wyłączamy wszystko poza H1, H2, P, UL, OL, LI, B
                heading: { levels: [1, 2] },
                bold: true,
                bulletList: true,
                orderedList: true,
                listItem: true,
                italic: false,
                strike: false,
                code: false,
                codeBlock: false,
                blockquote: false,
                horizontalRule: false,
            }),
        ],
        content: initialContent,
        editorProps: {
            attributes: {
                class: 'prose prose-sm xl:prose-base focus:outline-none min-h-[300px] border-none px-6 py-6 font-medium text-slate-800 leading-relaxed',
            },
            // ZAGROŻENIE KRYTYCZNE: Ograniczenie Paste. API padnie jeśli wejdzie tu div.
            handlePaste: (view, event) => {
                const html = event.clipboardData?.getData('text/html');
                
                if (html) {
                    event.preventDefault();
                    const sanitized = sanitizeHtmlOnPaste(html);
                    // Wstrzyknięcie zsanitaryzowanego stringa z wymuszonymi B, nie STRONG.
                    editor.commands.insertContent(sanitized);
                    return true;
                }
                
                // Zwykły tekst puszczamy bo StarterKit wyleje go jako <p>
                return false;
            }
        },
        onUpdate: ({ editor }) => {
            if(onChange) onChange(editor.getHTML());
        }
    });

    if (!editor) return null;
    return (
        <div className="w-full bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
            <MenuBar editor={editor} />
            <div className="flex-1 bg-white overflow-y-auto max-h-[500px]">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};
