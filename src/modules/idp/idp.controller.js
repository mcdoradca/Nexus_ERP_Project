const idpService = require('./idp.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function processInvoice(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Brak załączonego pliku faktury PDF.' });
        }
        
        // Zapis fizyczny pliku
        const uploadDir = path.join(__dirname, '../../../frontend/public/uploads/idp');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, req.file.buffer);
        
        const fileUrl = `/uploads/idp/${fileName}`;
        
        // Utworzenie rekordu w bazie
        const uploaderId = req.user?.userId || req.user?.id;
        
        if (uploaderId) {
            await prisma.invoiceDocument.create({
                data: {
                    fileName: req.file.originalname,
                    fileUrl: fileUrl,
                    uploaderId: uploaderId,
                    status: "PROCESSED"
                }
            });
        }
        
        // Logika przetwarzania faktury
        const result = await idpService.processInvoiceAndApplyCosts(req.file.buffer);
        res.status(200).json({ success: true, data: result, documentUrl: fileUrl });
    } catch (err) {
        console.error("IDP Controller Error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

async function getInvoices(req, res) {
    try {
        const invoices = await prisma.invoiceDocument.findMany({
            include: { uploader: { select: { name: true, department: true } } },
            orderBy: { uploadedAt: 'desc' }
        });
        res.status(200).json(invoices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    processInvoice,
    getInvoices
};
