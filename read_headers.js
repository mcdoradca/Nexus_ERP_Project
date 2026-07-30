const fs = require('fs');

function extractHeaders(filename, max = 15) {
    console.log(`\n=== Headers from ${filename} ===`);
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n');
    let count = 0;
    
    // Zobaczymy jak wyglądają struktury, np. listy czy nagłówki ###
    for(let line of lines) {
        if(line.match(/^(#+|-|\*|\d+\.) /) || line.trim() !== '') {
            console.log(line);
            count++;
            if(count >= max) break;
        }
    }
}

extractHeaders('src/modules/offer-optimizer-v2/docs/RAG_SOT_06_Slownik_INCI_i_Mapowanie_AEO.md', 30);
extractHeaders('src/modules/offer-optimizer-v2/docs/RAG_SOT_10_Składniki Chemii Domowej i Przemysłowej.md', 30);
extractHeaders('src/modules/offer-optimizer-v2/docs/INCI_i_ich_dzialanie.md', 30);
