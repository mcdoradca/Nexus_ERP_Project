const fs = require('fs');

let products = fs.readFileSync('frontend/src/views/ProductsView.jsx', 'utf8');

// Replace props
products = products.replace(
    'setIsNewProductModalOpen,',
    'onOpenUnifiedPipeline,'
);
products = products.replace(
    'onEditProduct,',
    ''
);

// Replace "Nowe SKU" button action
products = products.replace(
    /onClick=\{\(\) => setIsNewProductModalOpen\(true\)\}/,
    "onClick={() => onOpenUnifiedPipeline(null)}"
);

// Replace Table Row Edit click
products = products.replace(
    /onClick=\{\(\) => isAdmin && onEditProduct && onEditProduct\(p\)\}/,
    "onClick={() => isAdmin && onOpenUnifiedPipeline && onOpenUnifiedPipeline(p.id)}"
);

// Remove "Generuj AEO" button
// The button is roughly: <button id={`aeo-btn-${p.id}`} ... > <CloudLightning className="w-3 h-3 mr-1" /> Generuj AEO </button>
// It's inside a div with flex-col. I will use regex to remove the whole button.
products = products.replace(
    /<button\s+id=\{`aeo-btn-\$\{p\.id\}`\}[\s\S]*?Generuj AEO\s*<\/button>/,
    ""
);

fs.writeFileSync('frontend/src/views/ProductsView.jsx', products);
console.log("ProductsView.jsx updated!");
