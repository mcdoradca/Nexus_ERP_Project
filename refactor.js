const fs = require('fs');
let lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

// Zabezpieczamy indeksowanie od dołu, żeby nie przesuwać linijek górnych!
const ranges = [
  [797, 905], // renderKanban (798-906 index +1)
  [680, 796], // renderProducts (681-797)
  [550, 637], // renderAdminPanel (551-638)
  [304, 491], // renderCampaigns (305-492)
  [240, 303]  // renderProjectsView (241-304)
];

for (let [start, end] of ranges) {
  lines.splice(start, end - start + 1);
}

let code = lines.join('\n');

if (!code.includes('import KanbanView')) {
  code = code.replace("import UniversalChat from './components/UniversalChat';", 
    "import UniversalChat from './components/UniversalChat';\nimport KanbanView from './views/KanbanView';\nimport ProjectsView from './views/ProjectsView';\nimport CampaignsView from './views/CampaignsView';\nimport ProductsView from './views/ProductsView';\nimport AdminPanelView from './views/AdminPanelView';");
}

code = code.replace("{activeTab === 'kanban' && renderKanban()}", "{activeTab === 'kanban' && <KanbanView tasks={tasks} projects={projects} campaigns={campaigns} selectedFilterId={selectedFilterId} setSelectedFilterId={setSelectedFilterId} setIsNewTaskModalOpen={setIsNewTaskModalOpen} setSelectedTask={setSelectedTask} devMode={devMode} />}");
code = code.replace("{activeTab === 'projects' && renderProjectsView()}", "{activeTab === 'projects' && <ProjectsView projects={projects} tasks={tasks} currentUser={currentUser} setIsNewProjectModalOpen={setIsNewProjectModalOpen} setSelectedProject={setSelectedProject} devMode={devMode} />}");
code = code.replace("{activeTab === 'campaigns' && renderCampaigns()}", "{activeTab === 'campaigns' && <CampaignsView campaigns={campaigns} brands={brands} timelineRange={timelineRange} setTimelineRange={setTimelineRange} setSelectedCampaign={setSelectedCampaign} devMode={devMode} />}");
code = code.replace("{activeTab === 'products' && renderProducts()}", "{activeTab === 'products' && <ProductsView products={products} currentUser={currentUser} setIsNewBrandModalOpen={setIsNewBrandModalOpen} setIsNewProductModalOpen={setIsNewProductModalOpen} />}");
code = code.replace("{activeTab === 'admin' && renderAdminPanel()}", "{activeTab === 'admin' && <AdminPanelView users={users} setIsNewUserModalOpen={setIsNewUserModalOpen} setEditingUser={setEditingUser} setIsUserEditModalOpen={setIsUserEditModalOpen} />}");

fs.writeFileSync('frontend/src/App.jsx', code);
console.log('App.jsx successfully modularized.');
