require('dotenv').config();
const agent = require('./src/modules/offer-optimizer-v2/baselinker.export.agent.js');

async function run() {
    const agentInput = {
        inventory_id: "307",
        product_id: "",
        category_id: 3,
        product_map: {},
        category_map: { "default": 3 },
        config: {
            limits: { name_max: 200 },
            channels: [
                {
                    alias: "ALLEGRO_WENECJA444",
                    type: "allegro",
                    suffix: "|pl|allegro_16402",
                    active: true,
                    limits: { name_max: 75 },
                    on_limit_exceeded: "block"
                }
            ],
            text_field_keys: [
                "name", "description", "description_extra1", "description_extra2", "description_extra3", "description_extra4", "features",
                "name|pl|allegro_16402", "description|pl|allegro_16402", "description_extra1|pl|allegro_16402", "description_extra2|pl|allegro_16402", "description_extra3|pl|allegro_16402", "description_extra4|pl|allegro_16402", "features|pl|allegro_16402"
            ]
        },
        warstwy: [{
            warstwa: "BASE (Katalog Główny)",
            tresci_bazowe: {
                tytul: "Testowy produkt długi tytuł przekraczający siedemdziesiąt pięć znaków blablabla",
                opis: ["sekcja1", "sekcja2", "sekcja3", "sekcja4", "sekcja5", "sekcja6"],
                parametry: { "Marka": "Test" }
            },
            tresci_kanalu: {
                "ALLEGRO_WENECJA444": {
                    tytul: "Testowy produkt długi tytuł przekraczający siedemdziesiąt pięć znaków blablabla",
                    opis: ["sekcja1", "sekcja2", "sekcja3", "sekcja4", "sekcja5", "sekcja6"],
                    parametry: { "Marka": "Test" }
                }
            }
        }]
    };
    try {
        const res = await agent.validateAndFormatExport(agentInput);
        console.log(JSON.stringify(res, null, 2));
    } catch(e) {
        console.error(e);
    }
}
run();
