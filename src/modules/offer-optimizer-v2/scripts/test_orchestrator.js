require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { Orchestrator } = require('../orchestrator');

const pimData = {
    ean: "8000137015436",
    product_name: "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
    brand: "Equilibra",
    line: "Carbone Attivo",
    country_of_origin: "Włochy",
    logistics: {
        dimensions_cm: "15.0/5.0/3.5",
        weight_kg: 0.09
    },
    raw_ingredients_inci: "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid."
};

async function run() {
    console.log("Uruchamianie Orchestratora dla 8000137015436");
    const orchestrator = new Orchestrator('8000137015436');
    await orchestrator.run(pimData);
    console.log("Koniec. Zobacz logs/");
}

run();
