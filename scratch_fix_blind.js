const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function attachAvatarsAndEmailsToLegacyProfiles() {
    console.log("Rozpoczynanie weryfikacji Ślepych Profili...");
    const blindProfiles = await prisma.influencerProfile.findMany({
        where: { avatarUrl: null }
    });

    console.log(`Znaleziono ${blindProfiles.length} starych profili bez zdjęć.`);

    for (const profile of blindProfiles) {
        let collab = profile.followers < 15000 ? "BARTER" : "PAID";
        let cost = collab === "PAID" ? Math.floor(profile.followers * 0.015) : 0;
        let cleanHandle = profile.handle.replace(/[^a-zA-Z]/g, '');

        await prisma.influencerProfile.update({
            where: { id: profile.id },
            data: {
                avatarUrl: `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.handle}&backgroundColor=b6e3f4`,
                email: `${cleanHandle}@example.agency.com`,
                minRate: cost,
                maxRate: cost * 1.5,
                preferredCollab: collab
            }
        });
        console.log(`Profil ${profile.handle} został zrekonstruowany (działania naprawcze).`);
    }
}

attachAvatarsAndEmailsToLegacyProfiles()
    .then(() => {
        console.log("Aktualizacja bazy gotowa.");
        process.exit(0);
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
