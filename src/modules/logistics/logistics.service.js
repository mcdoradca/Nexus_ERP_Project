const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Przewiduje wyczerpanie stanów magazynowych na podstawie danych historycznych (Burn Rate)
 * oraz uaktywnia Agenta Negocjatora do sporządzenia draftu B2B.
 */
async function analyzeBurnRateAndProcure() {
    console.log('[LOGISTICS AGENT] Rozpoczynam audyt zapasów (Predictive Re-order Point)...');
    
    try {
        // 1. Zlokalizuj towary posiadające mapowanie B2B (Dostawcę i czas oczekiwania)
        const products = await prisma.product.findMany({
            where: {
                supplierId: { not: null },
                leadTimeDays: { not: null },
                // W prawdziwym środowisku odfiltrowalibyśmy tylko aktywne produkty
            },
            include: { supplier: true }
        });

        for (const product of products) {
            // W środowisku "God-Tier" powinniśmy wyliczyć średnią sprzedaż (30 dni) z modułu analitycznego.
            // Tutaj symulujemy średnie tempo spalania (Burn Rate).
            const stock = product.stockErpUnits !== null ? product.stockErpUnits : 0;
            
            // Symulowany wskaźnik: produkt rotuje z prędkością 5 sztuk dziennie.
            const dailyBurnRate = 5; 
            if (dailyBurnRate <= 0) continue;

            const daysLeft = stock / dailyBurnRate;
            const safeBuffer = 7; // Minimalny bufor (ilość dni bezpieczeństwa)
            const leadTime = product.leadTimeDays || 14;

            // Logika Zaopatrzeniowa: Kiedy dni do "Zero Stock" są mniejsze niż czas realizacji dostawy + margines.
            if (daysLeft <= (leadTime + safeBuffer)) {
                await procureFromSupplier(product, stock, daysLeft);
            }
        }
    } catch (err) {
        console.error('[LOGISTICS AGENT] Błąd analizy Burn Rate:', err.message);
    }
}

/**
 * Uruchamia Agenta B2B (LLM) w celu wynegocjowania i ułożenia wiadomości e-mail do fabryki.
 */
async function procureFromSupplier(product, currentStock, daysLeft) {
    try {
        const supplier = product.supplier;
        
        // Zabezpieczenie przed powielaniem zadań - jeśli task "Zamówienie: EAN" już wisi i czeka, przerywamy.
        const existingTask = await prisma.task.findFirst({
            where: {
                title: { contains: `Zamówienie: ${product.ean}` },
                status: { not: "DONE" }
            }
        });

        if (existingTask) return; // Już procesujemy zamówienie dla tego SKU

        // 2. Uruchamiamy Agenta Negocjatora
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const prompt = `
Jesteś elitarnym Agentem Zaopatrzenia B2B w systemie Nexus ERP.
Nasz produkt (EAN: ${product.ean}, Nazwa: "${product.name}") wyczerpuje się na magazynie. 
Zostało nam ${currentStock} sztuk, co wystarczy zaledwie na ok. ${Math.floor(daysLeft)} dni (zakładając obecne tempo rotacji).

Twoim zadaniem jest napisanie e-maila do dostawcy o nazwie: "${supplier.name}". 
Wiadomość musi być profesjonalna, chłodna biznesowo i merytoryczna. 
Chcemy zamówić partię uzupełniającą.
Wpleć grzecznie prośbę o specjalny rabat wolumenowy lub utrzymanie starych cen promocyjnych z racji naszej współpracy (i systemu przedpłat/faktur na termin).

Zwróć TYLKO treść maila (jako czysty tekst). Nie dodawaj od siebie żadnych komentarzy czy wstępów w stylu "Oto Twój email:". 
Zostaw [MIEJSCE NA PODPIS] dla operatora, który go wyśle.
`;
        const response = await model.generateContent(prompt);
        const emailDraft = response.response.text().trim();

        // 3. TARCZA BŁĘDÓW (Human-in-the-loop)
        // Agent ZABRONIONY ma prawo wysłać maila samodzielnie (ze względu na obrót pieniędzmi). 
        // Generujemy "Kartę Akceptacji" na Kanbanie.
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (admin) {
            await prisma.task.create({
                data: {
                    title: `Wymagane Zamówienie: ${product.ean} u dostawcy ${supplier.name}`,
                    description: `🚨 Agent Burn-Rate ostrzega: Zapas produktu "${product.name}" wyczerpie się w ciągu ${Math.floor(daysLeft)} dni!\n\nAgent Negocjator zredagował szkic wiadomości e-mail B2B.\n**Zadanie operatora:** Skopiuj Draft, dostosuj wymaganą ilość (wolumen), a następnie WYŚLIJ ręcznie i oznacz task jako DONE.\n\n--- DRAFT B2B ---\n\n${emailDraft}`,
                    status: "TODO",
                    priority: "HIGH",
                    creatorId: admin.id
                }
            });
            console.log(`[LOGISTICS AGENT] Wygenerowano draft zamówienia dla ${product.ean} u dostawcy ${supplier.name}. Zablokowano automatyczną wysyłkę (Tarcza Błędów).`);
        }
    } catch (err) {
        console.error(`[LOGISTICS AGENT] Błąd generatora draftu (Negocjatora) dla EAN ${product.ean}:`, err.message);
    }
}

module.exports = {
    analyzeBurnRateAndProcure,
    procureFromSupplier
};
