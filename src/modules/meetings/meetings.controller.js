const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EventBus = require('../../core/EventBus'); // Użycie EventBusa dla komunikacji z Kanbanem
const emailService = require('./meetings.email.service'); // Serwis mailowy

// ==========================================
// PUBLICZNE ENDPOINTY (Dla Rekruterów)
// ==========================================

// Oblicza dostępne sloty w podanym dniu
async function getAvailableSlots(req, res) {
    try {
        const { date } = req.query; // YYYY-MM-DD
        if (!date) return res.status(400).json({ error: 'Brak parametru daty' });

        const targetDate = new Date(date);
        const dayOfWeek = targetDate.getDay();

        // Pobierz reguły dla danego dnia tygodnia
        const availabilities = await prisma.meetingAvailability.findMany({
            where: { dayOfWeek, isActive: true }
        });

        if (availabilities.length === 0) {
            return res.status(200).json({ slots: [] }); // Brak dostepnosci w ten dzien
        }

        // Pobierz zarezerwowane juz spotkania na ten dzien
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const bookings = await prisma.meetingBooking.findMany({
            where: {
                meetingDate: { gte: startOfDay, lte: endOfDay },
                status: { in: ['CONFIRMED', 'PENDING'] }
            }
        });

        // W uproszczeniu: generujemy sloty co 30 min wg pierwszej napotkanej reguły 
        // i usuwamy te, ktore sa zarezerwowane
        const rule = availabilities[0]; 
        const [startHour, startMin] = rule.startTime.split(':').map(Number);
        const [endHour, endMin] = rule.endTime.split(':').map(Number);

        let current = startHour * 60 + startMin;
        const end = endHour * 60 + endMin;
        const duration = 30; // 30 min sloty
        const buffer = 30; // KRYTYCZNE: 30 min buforu przestrzeni

        let availableSlots = [];
        
        while (current + duration <= end) {
            const h = Math.floor(current / 60).toString().padStart(2, '0');
            const m = (current % 60).toString().padStart(2, '0');
            const slotStr = `${h}:${m}`;

            // Matematyczna weryfikacja kolizji przedziałów czasowych (wliczając bufor)
            const isBooked = bookings.some(b => {
                const [bh, bm] = b.startTime.split(':').map(Number);
                const bStart = bh * 60 + bm;
                const bEnd = bStart + (b.durationMinutes || 30) + buffer; // Zarezerwowany czas + bufor
                
                const newSlotStart = current;
                const newSlotEnd = current + duration + buffer; // Nowy slot też chronimy buforem
                
                // Prawda jeśli przedziały [bStart, bEnd] oraz [newSlotStart, newSlotEnd] się przecinają
                return Math.max(bStart, newSlotStart) < Math.min(bEnd, newSlotEnd);
            });

            if (!isBooked) {
                // Jesli dzisiaj to odrzuc sloty w przeszlosci z marginesem 1h
                const now = new Date();
                let isPast = false;
                if (now.toDateString() === targetDate.toDateString()) {
                    const nowMinutes = now.getHours() * 60 + now.getMinutes() + 60; // 1h bufor
                    if (current < nowMinutes) isPast = true;
                }
                
                if (!isPast) availableSlots.push(slotStr);
            }
            current += duration;
        }

        res.status(200).json({ slots: availableSlots });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd serwera podczas wyliczania dostępności' });
    }
}

// Rezerwacja nowego spotkania
async function bookMeeting(req, res) {
    try {
        const { recruiterName, recruiterEmail, companyName, jobDescription, meetingDate, startTime, timezone } = req.body;

        if (!recruiterName || !recruiterEmail || !meetingDate || !startTime) {
            return res.status(400).json({ error: 'Brak wymaganych danych' });
        }

        const dateObj = new Date(meetingDate);

        // KRYTYCZNE ZABEZPIECZENIE: Zapobiega nadpisywaniu (Double Booking)
        const startOfDay = new Date(dateObj); startOfDay.setHours(0,0,0,0);
        const endOfDay = new Date(dateObj); endOfDay.setHours(23,59,59,999);
        
        const existing = await prisma.meetingBooking.findFirst({
            where: {
                meetingDate: { gte: startOfDay, lte: endOfDay },
                startTime: startTime,
                status: { in: ['CONFIRMED', 'PENDING'] }
            }
        });

        if (existing) {
            return res.status(409).json({ error: 'Ten termin jest już zajęty. Proszę wybrać inny.' });
        }

        const booking = await prisma.meetingBooking.create({
            data: {
                recruiterName, recruiterEmail, companyName, jobDescription,
                meetingDate: dateObj, startTime, timezone, status: 'PENDING'
            }
        });

        // Wrzucamy Event na Kanban - informacja ze mamy nowe request spotkanie!
        EventBus.emit('CREATE_SYSTEM_TASK', {
            title: `Nowa rezerwacja rozmowy: ${recruiterName} (${companyName || 'Brak Firmy'})`,
            description: `**Data:** ${dateObj.toLocaleDateString()} **Czas:** ${startTime}\n**Email:** ${recruiterEmail}\n**Wiadomość / JD:**\n${jobDescription || 'Brak dodatkowych informacji.'}\n\n[Oczekuje na akceptację]`,
            priority: 'HIGH',
            category: 'REKRUTACJA'
        });

        // Natychmiastowa notyfikacja w UI (Socket.IO) jeśli aplikacja działa
        try {
            const { getIO } = require('../../server');
            const io = getIO();
            io.emit('nexus-notification', { 
                type: 'MEETING_BOOKED', 
                message: `Nowe spotkanie od: ${recruiterName} (${startTime})`, 
                priority: 'HIGH' 
            });
        } catch (socketErr) {
            console.error('[Meetings] Brak aktywnego Socket.IO, pomijam Toast.');
        }

        res.status(201).json({ success: true, bookingId: booking.id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd systemu zapisu spotkań' });
    }
}

// ==========================================
// PRYWATNE ENDPOINTY (Dla Administratora ERP)
// ==========================================

async function getAdminBookings(req, res) {
    try {
        const bookings = await prisma.meetingBooking.findMany({
            orderBy: { meetingDate: 'asc' }
        });
        res.status(200).json(bookings);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function updateBookingStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const bookingData = await prisma.meetingBooking.findUnique({ where: { id } });
        if (!bookingData) return res.status(404).json({ error: 'Nie znaleziono' });

        const booking = await prisma.meetingBooking.update({
            where: { id },
            data: { status }
        });

        // Wysłanie eleganckiego e-maila po potwierdzeniu przez administratora!
        if (status === 'CONFIRMED' && bookingData.status !== 'CONFIRMED') {
            // Generujemy wirtualny link Google Meet - można go zamienić na API Google w przyszłości
            const meetLink = `https://meet.google.com/nex-us${booking.id.substring(0,4)}-erp`;
            await emailService.sendConfirmation(booking, meetLink, req.user); // Przekazanie aktywnego usera
        }

        res.status(200).json(booking);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function editBooking(req, res) {
    try {
        const { id } = req.params;
        const { meetingDate, startTime, recruiterName, recruiterEmail } = req.body;
        
        const dateObj = new Date(meetingDate);

        const booking = await prisma.meetingBooking.update({
            where: { id },
            data: { 
                meetingDate: dateObj,
                startTime,
                recruiterName,
                recruiterEmail
            }
        });
        res.status(200).json({ success: true, booking });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd podczas edycji spotkania.' });
    }
}

async function getAvailabilities(req, res) {
    try {
        const av = await prisma.meetingAvailability.findMany({ orderBy: { dayOfWeek: 'asc' } });
        res.status(200).json(av);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function setAvailability(req, res) {
    try {
        const { rules } = req.body; // Array obiektow: { dayOfWeek, startTime, endTime, isActive }
        // Najprosciej: wyczyscic obecne i zapisac nowe
        await prisma.meetingAvailability.deleteMany({});
        await prisma.meetingAvailability.createMany({ data: rules });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = {
    getAvailableSlots, bookMeeting, getAdminBookings, updateBookingStatus, getAvailabilities, setAvailability, editBooking
};
