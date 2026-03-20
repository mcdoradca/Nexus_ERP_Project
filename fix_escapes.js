const fs = require('fs');
const files = [
  'frontend/src/views/KanbanView.jsx',
  'frontend/src/views/ProjectsView.jsx',
  'frontend/src/views/CampaignsView.jsx',
  'frontend/src/views/ProductsView.jsx',
  'frontend/src/views/AdminPanelView.jsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/\\`/g, '`');
    c = c.replace(/\\\$/g, '$');
    c = c.replace(/\\{/g, '{');
    c = c.replace(/\\}/g, '}');
    fs.writeFileSync(f, c);
  }
});
console.log('Fixed escapes successfully');
