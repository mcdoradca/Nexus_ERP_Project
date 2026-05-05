const xlsx = require('xlsx');
const path = require('path');

try {
    const filePath = path.join(__dirname, 'src/modules/users/Data/Raport 1.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = 'Wg ofert - Top 100';
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log(`\nSheet '${sheetName}' first 10 rows:`);
    for (let i = 0; i < Math.min(10, data.length); i++) {
        console.log(`Row ${i}:`, data[i]);
    }
} catch (e) {
    console.error("Error reading xlsx:", e.message);
}
