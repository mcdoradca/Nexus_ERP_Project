const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getSuppliers(req, res) {
    try {
        const suppliers = await prisma.supplier.findMany({ 
            include: { 
                products: { 
                    select: { ean: true, name: true, stockErpUnits: true, leadTimeDays: true } 
                } 
            }
        });
        res.status(200).json(suppliers);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { getSuppliers };
