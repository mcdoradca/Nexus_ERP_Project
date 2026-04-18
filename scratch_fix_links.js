const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillSocialUrls() {
    console.log("Rozpoczynanie weryfikacji Brakujących Linków...");
    const missingLinkProfiles = await prisma.influencerProfile.findMany({
        where: { socialUrl: null }
    });

    console.log(`Znaleziono ${missingLinkProfiles.length} profili bez przypisanego URL do panelu.`);

    for (const profile of missingLinkProfiles) {
        let cleanHandle = profile.handle.replace(/[^a-zA-Z0-9_\.]/g, '');
        let newUrl = `https://www.instagram.com/${cleanHandle}/`;

        await prisma.influencerProfile.update({
            where: { id: profile.id },
            data: {
                socialUrl: newUrl
            }
        });
        console.log(`Zaktualizowano (Backfill URL): ${profile.name} -> ${newUrl}`);
    }
}

backfillSocialUrls()
    .then(() => {
        console.log("Gotowe. Proszę odświeżyć CRM.");
        process.exit(0);
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
