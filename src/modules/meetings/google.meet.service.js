const { SpacesServiceClient } = require('@google-apps/meet').v2;
const { GoogleAuth } = require('google-auth-library');

class GoogleMeetService {
    constructor() {
        try {
            // Inicjalizacja Autoryzacji.
            // Aplikacja oczekuje poprawnego pliku w GOOGLE_APPLICATION_CREDENTIALS.
            // Wymaga utworzonego Service Account z prawami Domain-Wide Delegation
            // (w celu podszywania się pod autoryzowanego użytkownika z domeny Google Workspace),
            // LUB musi zostać wywołana z podaniem poprawnego OAuth Bearer token z UI.
            const auth = new GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/meetings.space.created']
            });
            this.meetClient = new SpacesServiceClient({ auth });
            this.isConfigured = true;
            console.log('[Google Meet Service] Załadowano biblioteki autoryzacji.');
        } catch(e) {
            console.error('[Google Meet Service] Błąd konfiguracji w konstruktorze:', e.message);
            this.isConfigured = false;
        }
    }

    /**
     * Zwraca autentyczny wirtualny pokój z API Google
     */
    async createSpace() {
        if (!this.isConfigured) {
            console.warn('[Google Meet Service] Próba utworzenia pokoju bez wgranej konfiguracji! Zwracam fallback.');
            return this.generateFallbackLink();
        }

        try {
            const request = {};
            // Zgodnie z oficjalną dokumentacją:
            // "The input space can be empty. Later on the input space can be non-empty when space configuration is introduced."
            let response = await this.meetClient.createSpace(request);
            
            let space = Array.isArray(response) ? response[0] : response;
            return space.meetingUri; // Zwraca np. "https://meet.google.com/abc-defg-hij"
            
        } catch (error) {
            console.error('[Google Meet Service] API Google odrzuciło żądanie. Szczegóły:', error.message);
            console.warn('[Google Meet Service] Wdrażam Fallback z uwagi na awarię autoryzacji.');
            return this.generateFallbackLink();
        }
    }

    generateFallbackLink() {
        // Tarcza Fallback na czas braku autoryzacji Google Cloud w pliku .env
        // (W przeciwnym wypadku wysypie cały proces akceptacji)
        // Zwraca otwarty pokój Jitsi (zgodnie z wzorcem awaryjnym), który NIE ZGŁASZA błędów braku rejestracji,
        // dopóki Google Admin nie wgra pliku credentials.json.
        const fallbackCode = Math.random().toString(36).substring(2, 10);
        return `https://meet.jit.si/Nexus-ERP-Fallback-${fallbackCode}`;
    }
}

module.exports = new GoogleMeetService();
