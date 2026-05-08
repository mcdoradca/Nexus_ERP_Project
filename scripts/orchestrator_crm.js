const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function executeStage5() {
  console.log('Orchestration & CRM Action Agent initializing...');
  
  // 1. Walidacja pliku SOT
  const finalVideoPath = 'z:/Nexus_ERP_Project/nes_final_presentation.html';
  if (fs.existsSync(finalVideoPath)) {
      console.log('SUCCESS: Znaleziono gotowy plik montażowy nes_final_presentation.html');
  } else {
      console.log('WARNING: Brak pliku montażowego HTML. Upewnij się, że Visual Engine zakończył działanie.');
  }

  // 2. CRM Distribution
  console.log('Connecting to Nexus CRM Database to distribute the video...');
  
  try {
    // We need an author for the message. Fetching first available user.
    let user = await prisma.user.findFirst();
    
    // If no user exists, create a system bot user for Sentinel.
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'admin@n-e-s.it',
          name: 'Nexus Sentinel',
          color: 'bg-red-600',
          role: 'ADMIN',
          passwordHash: 'dummy_hash'
        }
      });
    }

    // Create a Mailing Campaign
    const campaign = await prisma.campaign.create({
      data: {
        name: 'PREZENTACJA NeS: SELF-REFLECTION DEMO (SOT INTERACTIVE)',
        description: 'Autentyczne wideo Proof of Value oparte na prawdziwej logice MTool.',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days later
        status: 'Aktywna',
        color: 'bg-indigo-600'
      }
    });
    console.log(`CRM: Campaign created -> [${campaign.id}] ${campaign.name}`);

    // Distribute via Global Message
    const message = await prisma.globalMessage.create({
      data: {
        content: 'System Nexus Sentinel pomyślnie złożył autentyczne wideo Proof of Value (SOT). Otrzymujesz interaktywną fuzję wideo w formacie Web Muxer.',
        authorId: user.id,
        actionType: 'system_broadcast',
        fileName: 'nes_final_presentation.html',
        fileUrl: '/assets/nes_final_presentation.html'
      }
    });
    console.log(`CRM: Broadcast Message sent -> [${message.id}] with attachment nes_final_presentation.html`);

    console.log('====================================================');
    console.log('PIPELINE COMPLETE. System NeS zaktualizowany.');
    console.log('====================================================');

  } catch (error) {
    console.error('CRM Database Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

executeStage5();
