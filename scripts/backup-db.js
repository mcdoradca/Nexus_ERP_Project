const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../prisma/dev.db');
const BACKUPS_DIR = path.join(__dirname, '../prisma/backups');

if (!fs.existsSync(DB_PATH)) {
    console.log('[Backup] No database file found to backup.');
    process.exit(0);
}

if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Keep only the last 10 backups to save space
const existingBackups = fs.readdirSync(BACKUPS_DIR).filter(file => file.endsWith('.db'));
if (existingBackups.length >= 10) {
    existingBackups.sort();
    const oldestBackup = existingBackups[0];
    fs.unlinkSync(path.join(BACKUPS_DIR, oldestBackup));
    console.log(`[Backup] Deleted oldest backup: ${oldestBackup}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUPS_DIR, `dev_${timestamp}.db`);

fs.copyFileSync(DB_PATH, backupPath);
console.log(`[Backup] Successfully backed up database to: ${backupPath}`);
