const { google } = require('googleapis');

class GoogleMeetService {
    constructor() {
        // OAuth 2.0 Credentials (z pliku .env)
        this.clientId = process.env.GOOGLE_CLIENT_ID;
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
        
        this.isConfigured = !!(this.clientId && this.clientSecret && this.refreshToken);

        if (this.isConfigured) {
            this.oauth2Client = new google.auth.OAuth2(
                this.clientId,
                this.clientSecret,
                'urn:ietf:wg:oauth:2.0:oob' // Redirect URI nieistotny przy Refresh Token
            );
            
            // Ustawiamy Refresh Token - auth-library zajmie się resztą w tle
            this.oauth2Client.setCredentials({
                refresh_token: this.refreshToken
            });

            this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            console.log('[Google Meet Service] Załadowano biblioteki autoryzacji Calendar API (OAuth 2.0).');
        } else {
            console.warn('[Google Meet Service] Brak kluczy OAuth w .env. Użyje Tarczy Fallback.');
        }
    }

    /**
     * Zwraca autentyczny wirtualny pokój z API Kalendarza Google
     * @param {Object} booking Obiekt rezerwacji z bazy danych
     */
    async createSpace(booking) {
        if (!this.isConfigured) {
            throw new Error('Google Meet API nie jest skonfigurowane (brak kluczy w .env).');
        }

        try {
            // Przygotowanie daty rozpoczęcia i zakończenia z booking
            const [hours, minutes] = booking.startTime.split(':');
            const startDateTime = new Date(booking.meetingDate);
            startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + (booking.durationMinutes || 30));

            const event = {
                summary: `Spotkanie rekrutacyjne: ${booking.recruiterName || 'Nexus'}`,
                description: `Zarezerwowane przez CRM Nexus ERP. Kandydat: ${booking.recruiterEmail}`,
                start: {
                    dateTime: startDateTime.toISOString(),
                    timeZone: booking.timezone || 'Europe/Warsaw',
                },
                end: {
                    dateTime: endDateTime.toISOString(),
                    timeZone: booking.timezone || 'Europe/Warsaw',
                },
                conferenceData: {
                    createRequest: {
                        requestId: booking.id, // Unikalne ID zabezpieczające przed dublowaniem
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet'
                        }
                    }
                }
            };

            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                conferenceDataVersion: 1 // Krytyczny parametr wymagany do stworzenia linku!
            });

            const meetLink = response.data.hangoutLink;
            if (!meetLink) {
                throw new Error('Google zwróciło odpowiedź, ale bez linku hangoutLink.');
            }

            return meetLink; // Zwraca oficjalny link, np. https://meet.google.com/abc-defg-hij
            
        } catch (error) {
            console.error('[Google Meet Service] API Google Calendar odrzuciło żądanie. Szczegóły:', error.message);
            throw new Error('Nie udało się wygenerować pokoju Google Meet: ' + error.message);
        }
    }


}

module.exports = new GoogleMeetService();
