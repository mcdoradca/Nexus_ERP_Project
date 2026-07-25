const fs = require('fs');

let app = fs.readFileSync('frontend/src/App.jsx', 'utf8');

const modalStartStr = '{/* Nowy Produkt (PIM) */}';
const modalStart = app.indexOf(modalStartStr);

const afterModalStr = "{activeTab === 'chat' && renderChatInterface()}";
const afterModalIndex = app.indexOf(afterModalStr, modalStart);

let beforeModal = app.substring(0, modalStart);
let afterModal = app.substring(afterModalIndex);

app = beforeModal + afterModal;

// 2. Change activeTab render logic
app = app.replace(
    /import ProductsView from '\.\/views\/ProductsView';/,
    "import ProductsView from './views/ProductsView';\nimport { UnifiedProductPipelineView } from './views/OfferOptimizer/UnifiedProductPipelineView';"
);

app = app.replace(
    /{activeTab === 'products' && <ProductsView[\s\S]*?\/>}/,
    `{activeTab === 'products' && <ProductsView 
              products={products} 
              currentUser={currentUser} 
              fetchAppGlobalData={fetchData}
              setIsNewBrandModalOpen={setIsNewBrandModalOpen} 
              onOpenUnifiedPipeline={(id) => {
                 setEditingProduct(id);
                 setActiveTab('unifiedHub');
              }}
            />}
            {activeTab === 'unifiedHub' && <UnifiedProductPipelineView
                socket={socket}
                currentUser={currentUser}
                token={token}
                editingProduct={editingProduct}
                setEditingProduct={setEditingProduct}
                fetchAppGlobalData={fetchData}
                onClose={() => setActiveTab('products')}
            />}
`
);

fs.writeFileSync('frontend/src/App.jsx', app);
console.log("App.jsx updated correctly!");
