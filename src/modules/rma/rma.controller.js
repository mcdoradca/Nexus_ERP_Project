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
            take: 100 
        });
        res.status(200).json(returns);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { getBlacklist, getReturns };
