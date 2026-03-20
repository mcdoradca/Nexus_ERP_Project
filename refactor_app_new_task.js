const fs = require('fs');

const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

const importReplacement = "import NewTaskModal from './views/NewTaskModal';\n";
if (!code.includes('NewTaskModal')) {
    const importIndex = code.indexOf('import KanbanView');
    if (importIndex !== -1) {
        code = code.substring(0, importIndex) + importReplacement + code.substring(importIndex);
    }
}

const startMarker = '{/* Nowe Zadanie */}';
const endMarker = '{/* Nowa Marka (PIM) */}';

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = `{/* Nowe Zadanie */}
        <NewTaskModal 
          isOpen={isNewTaskModalOpen} 
          onClose={() => setIsNewTaskModalOpen(false)} 
          projects={projects} 
          campaigns={campaigns} 
          users={users} 
          fetchData={fetchData} 
          token={token} 
          API_URL={API_URL} 
        />

        `;
    
    code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
    fs.writeFileSync(path, code);
    console.log('App.jsx modified successfully!');
} else {
    console.error('Markers not found!');
}
