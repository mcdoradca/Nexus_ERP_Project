const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getBlacklist(req, res) {
    try {
        const profiles = await prisma.customerRiskProfile.findMany({ 
            orderBy: { fraudScore: 'desc' } 
        });
        res.status(200).json(profiles);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function getReturns(req, res) {
    try {
        const returns = await prisma.returnRecord.findMany({ 
            orderBy: { createdAt: 'desc' }, 
            take: 200 
        });
        res.status(200).json(returns);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function banUser(req, res) {
    try {
        const { id } = req.params;
        await prisma.customerRiskProfile.update({
            where: { id },
            data: { isBlacklisted: true, reviewStatus: 'BANNED' }
        });
        res.status(200).json({ message: 'Zablokowano pomyślnie' });
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function dismissUser(req, res) {
    try {
        const { id } = req.params;
        await prisma.customerRiskProfile.update({
            where: { id },
            data: { reviewStatus: 'SAFE', fraudScore: 0 } // Resetowanie alarmu
        });
        res.status(200).json({ message: 'Odrzucono pomyślnie' });
    } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { getBlacklist, getReturns, banUser, dismissUser };
