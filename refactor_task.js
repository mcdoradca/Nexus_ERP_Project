const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'frontend/src/App.jsx');
let content = fs.readFileSync(appPath, 'utf8');
let lines = content.split('\n');

// 1. Insert Import
const importIndex = lines.findIndex(l => l.includes("import KanbanView from"));
if (importIndex !== -1) {
  lines.splice(importIndex, 0, "import TaskDetailsDrawer from './views/TaskDetailsDrawer';");
}

// 2. Remove renderTaskDetails
const startIdx = lines.findIndex(l => l.includes('const renderTaskDetails = () => {'));
if (startIdx !== -1) {
    let bracketCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < lines.length; i++) {
        const opened = (lines[i].match(/\{/g) || []).length;
        const closed = (lines[i].match(/\}/g) || []).length;
        bracketCount += opened - closed;
        if (i > startIdx && bracketCount === 0) {
            endIdx = i;
            break;
        }
    }
    if (endIdx !== -1) {
        lines.splice(startIdx, endIdx - startIdx + 1);
        console.log(`Deleted lines from ${startIdx} to ${endIdx}`);
    }
} else {
    console.log("renderTaskDetails NOT FOUND");
}

// 3. Replace {renderTaskDetails()}
const usageIdx = lines.findIndex(l => l.includes('{renderTaskDetails()}'));
if (usageIdx !== -1) {
    lines[usageIdx] = lines[usageIdx].replace(
        '{renderTaskDetails()}',
        `{selectedTask && <TaskDetailsDrawer task={selectedTask} onClose={() => setSelectedTask(null)} currentUser={currentUser} users={users} tasks={tasks} socket={socket} fetchData={fetchData} token={token} API_URL={API_URL} />}`
    );
     console.log(`Replaced {renderTaskDetails()} at line ${usageIdx}`);
}

fs.writeFileSync(appPath, lines.join('\n'));
console.log('App.jsx refactored successfully.');
