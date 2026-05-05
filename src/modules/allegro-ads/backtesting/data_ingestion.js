const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

class DataIngestion {
    constructor() {
        this.dataDir = path.join(__dirname, '../../users/Data');
    }

    loadHistoricalSales() {
        if (!fs.existsSync(this.dataDir)) return {};
        const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.csv'));
        const salesHistory = {}; 
        
        for (const file of files) {
            const filePath = path.join(this.dataDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            
            let currentOrderDate = null;
            
            for (const line of lines) {
                if (!line.trim() || line.startsWith('Type,OrderDate') || line.startsWith('Type,LineItemId')) continue;
                
                const parts = line.split(',');
                if (parts[0] === 'order') {
                    currentOrderDate = parts[1].split('T')[0];
                } else if (parts[0] === 'lineItem' && currentOrderDate) {
                    const name = parts[3].replace(/"/g, '');
                    const quantity = parseInt(parts[4]) || 1;
                    const price = parseFloat(parts[5]) || 0;
                    
                    if (!salesHistory[name]) {
                        salesHistory[name] = { totalSold: 0, dailySales: {} };
                    }
                    if (!salesHistory[name].dailySales[currentOrderDate]) {
                        salesHistory[name].dailySales[currentOrderDate] = { units: 0, revenue: 0 };
                    }
                    
                    salesHistory[name].dailySales[currentOrderDate].units += quantity;
                    salesHistory[name].dailySales[currentOrderDate].revenue += (quantity * price);
                    salesHistory[name].totalSold += quantity;
                }
            }
        }
        return salesHistory;
    }

    loadMarketAnalytics() {
        const filePath = path.join(this.dataDir, 'Raport 1.xlsx');
        if (!fs.existsSync(filePath)) return null;

        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets['Wg ofert - Top 100'];
        if (!sheet) return null;

        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const analytics = {};
        
        for (let i = 3; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length < 5) continue;
            
            const seller = row[0];
            const name = row[1];
            const transactions = row[6] || 0;
            const unitsSold = row[8] || 0;
            const avgPrice = row[10] || 0;
            
            if (!analytics[name]) analytics[name] = [];
            analytics[name].push({ seller, transactions, unitsSold, avgPrice });
        }
        
        return analytics;
    }
}

module.exports = new DataIngestion();
