const XLSX = require('xlsx');

try {
  const filePath = 'z:\\Nexus_ERP_Project\\Skin Care Korea Polska social media.xlsx';
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const cleaned = json.filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''));
  
  console.log(`Nagłówki i próbka danych z ARKUSZA '${sheetName}':`);
  cleaned.slice(0, 15).forEach((row, i) => {
    console.log(`Wiersz ${i}:`, JSON.stringify(row));
  });
} catch (error) {
  console.error("Error:", error.message);
}
