require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');
const googleMeetService = require('../src/modules/meetings/google.meet.service');
const nodemailer = require('nodemailer');

const prisma = new PrismaClient();

async function runTests() {
    console.log("=== ROZPOCZYNAM TESTY INTEGRACJI API ===");

    // 1. Prisma & DB Connection
    try {
        console.log("\n[1] Test bazy danych (Prisma)");
        const result = await prisma.$queryRaw`SELECT 1 as result`;
        console.log("✅ Prisma połączona poprawnie:", result);
    } catch (err) {
        console.error("❌ Prisma Error:", err.message);
    }

    // 2. Supabase
    try {
        console.log("\n[2] Test Supabase API");
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
        // Sprawdźmy autoryzację / role
        const { data, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;
        console.log("✅ Supabase połączone poprawnie. Znaleziono użytkowników:", data.users.length);
    } catch (err) {
        console.error("❌ Supabase Error:", err.message);
    }

    // 3. Gemini
    try {
        console.log("\n[3] Test Gemini API");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Odpowiedz tylko jednym słowem: OK");
        console.log("✅ Gemini połączone. Odpowiedź:", result.response.text().trim());
    } catch (err) {
        console.error("❌ Gemini Error:", err.message);
    }

    // 4. Allegro API
    try {
        console.log("\n[4] Test Allegro OAuth");
        const authString = Buffer.from(`${process.env.ALLEGRO_CLIENT_ID}:${process.env.ALLEGRO_CLIENT_SECRET}`).toString('base64');
        const tokenRes = await axios.post('https://allegro.pl/auth/oauth/token?grant_type=client_credentials', null, {
            headers: {
                'Authorization': `Basic ${authString}`
            }
        });
        console.log("✅ Allegro połączone. Token pobrany pomyślnie.");
    } catch (err) {
        console.error("❌ Allegro Error:", err.response?.data || err.message);
    }

    // 5. Claid API
    try {
        console.log("\n[5] Test Claid API (Upload)");
        const imgRes = await axios.get("https://picsum.photos/50/50.jpg", { responseType: 'arraybuffer' });
        const buffer = Buffer.from(imgRes.data, 'binary');
        const form = new FormData();
        form.append('file', buffer, { filename: 'upload.jpg', contentType: 'image/jpeg' });
        form.append('data', JSON.stringify({}));
        
        const uploadRes = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
            headers: {
                'Authorization': `Bearer ${process.env.CLAID_API_KEY}`,
                ...form.getHeaders()
            }
        });
        console.log("✅ Claid API połączone. Upload powiódł się.");
    } catch (err) {
        console.error("❌ Claid Error:", err.response?.data || err.message);
    }

    // 6. Google Meet / Calendar
    try {
        console.log("\n[6] Test Google Meet API");
        const booking = {
            id: 'test-api-keys-' + Date.now(),
            startTime: '14:30',
            meetingDate: new Date().toISOString(),
            durationMinutes: 15,
            recruiterName: 'Test Api',
            recruiterEmail: 'test@example.com',
            timezone: 'Europe/Warsaw'
        };
        const link = await googleMeetService.createSpace(booking);
        console.log('✅ Google Meet połączone. Utworzono przestrzeń/link:', link);
    } catch (err) {
        console.error("❌ Google Meet Error:", err.message);
    }

    // 7. SMTP / Email
    try {
        console.log("\n[7] Test serwera SMTP (Email)");
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        await transporter.verify();
        console.log("✅ Serwer SMTP połączony poprawnie.");
    } catch (err) {
        console.error("❌ SMTP Error:", err.message);
    }

    console.log("\n=== TESTY ZAKOŃCZONE ===");
    await prisma.$disconnect();
    process.exit(0);
}

runTests();
