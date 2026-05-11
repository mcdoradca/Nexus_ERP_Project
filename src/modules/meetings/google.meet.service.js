class GoogleMeetService {
    constructor() {
        // Serwis korzysta z jednego, stałego pokoju rekrutacyjnego Google Meet.
        // Ochrona przed nakładaniem się kandydatów jest gwarantowana przez moduł kalendarza 
        // (restrykcyjna alokacja slotów czasowych).
        this.permanentLink = process.env.GOOGLE_MEET_PERMANENT_LINK || 'https://meet.google.com/uzupelnij-w-env';
    }

    /**
     * Zwraca stały link do pokoju Google Meet.
     */
    async createSpace() {
        // Skoro kalendarz eliminuje "Double Booking", system bezpiecznie zwraca 
        // ten sam adres pokoju dla każdego wyizolowanego spotkania.
        return this.permanentLink;
    }
}

module.exports = new GoogleMeetService();
