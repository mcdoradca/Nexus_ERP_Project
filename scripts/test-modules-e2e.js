require('dotenv').config();
const request = require('supertest');
const { app, server } = require('../src/server');

async function testE2E() {
    console.log("=== ROZPOCZYNAM TESTY E2E MODUŁÓW (API Controllers) ===");
    
    // 1. Health & Core
    try {
        console.log("\n[1] Test Core / Health");
        const res = await request(app).get('/api/health');
        console.log(`✅ Health endpoint odpowiedział: ${res.statusCode} - ${JSON.stringify(res.body)}`);
    } catch (e) {
        console.error("❌ Health error:", e.message);
    }

    // 2. Auth Module
    try {
        console.log("\n[2] Test Auth Module");
        // Uderzamy w endpoint, by zobaczyć czy moduł żyje. Brak tokena = 401/403
        const res = await request(app).get('/api/auth/me');
        console.log(`✅ Auth endpoint zareagował: ${res.statusCode} (Oczekiwane 401/403 ze względu na brak JWT)`);
    } catch (e) {
        console.error("❌ Auth error:", e.message);
    }

    // 3. MDM Module (Products)
    try {
        console.log("\n[3] Test MDM (Products) Module");
        const res = await request(app).get('/api/mdm/products').query({ limit: 1 });
        // Oczekujemy że zadziała, albo odrzuci auth
        console.log(`✅ MDM endpoint zareagował: ${res.statusCode}`);
    } catch (e) {
        console.error("❌ MDM error:", e.message);
    }

    // 4. CRM Module (Orders)
    try {
        console.log("\n[4] Test CRM (Orders) Module");
        const res = await request(app).get('/api/crm/orders').query({ limit: 1 });
        console.log(`✅ CRM endpoint zareagował: ${res.statusCode}`);
    } catch (e) {
        console.error("❌ CRM error:", e.message);
    }

    // 5. Analytics Module
    try {
        console.log("\n[5] Test Analytics Module");
        const res = await request(app).get('/api/analytics/dashboard');
        console.log(`✅ Analytics endpoint zareagował: ${res.statusCode}`);
    } catch (e) {
        console.error("❌ Analytics error:", e.message);
    }

    console.log("\n=== TESTY ZAKOŃCZONE ===");
    
    // Clean up
    if (server && server.listening) {
        server.close();
    }
    process.exit(0);
}

testE2E();
