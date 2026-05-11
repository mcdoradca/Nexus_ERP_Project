const crypto = require('crypto');

// Bardzo ważne: Klucz musi mieć dokładnie 32 bajty dla AES-256. 
// W produkcji używa się dedykowanej zmiennej środowiskowej ENCRYPTION_KEY.
// Jeśli jej brak, używamy zhashowanego JWT_SECRET.
const algorithm = 'aes-256-ctr';
let secretKey = process.env.ENCRYPTION_KEY;

if (!secretKey) {
    const jwtSecret = process.env.JWT_SECRET || 'nexus-default-super-secret-key-12345';
    secretKey = crypto.createHash('sha256').update(String(jwtSecret)).digest('base64').substring(0, 32);
}

class CryptoService {
    encrypt(text) {
        if (!text) return null;
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    decrypt(text) {
        if (!text) return null;
        try {
            const textParts = text.split(':');
            if (textParts.length !== 2) return null;
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (err) {
            console.error('[CryptoService] Błąd deszyfrowania:', err.message);
            return null;
        }
    }
}

module.exports = new CryptoService();
