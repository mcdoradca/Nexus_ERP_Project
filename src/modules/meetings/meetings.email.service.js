const nodemailer = require('nodemailer');

class MeetingsEmailService {
    constructor() {
        // Konfiguracja do środowisk developerskich lub produkcyjnych
        // Można podmienić pod SMTP Gmail, Amazon SES itp.
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.ethereal.email',
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    async sendConfirmation(booking, meetLink) {
        if (!process.env.SMTP_HOST && !process.env.SMTP_USER) {
            console.log('[MeetingsEmailService] ⚠️ Brak konfiguracji SMTP (.env). E-mail zostałby wysłany do:', booking.recruiterEmail);
            console.log('[MeetingsEmailService] DRAFT:', meetLink);
            return;
        }

        const dateStr = new Date(booking.meetingDate).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const htmlTemplate = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w-lg mx-auto bg-slate-50 p-8 rounded-2xl">
            <div style="background: #4f46e5; padding: 20px; border-radius: 10px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Potwierdzenie Spotkania</h1>
                <p style="color: #c7d2fe; margin-top: 5px; font-size: 14px;">Nexus Booking System</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Witaj, ${booking.recruiterName}!</h2>
                <p style="color: #475569; line-height: 1.6;">Twoje spotkanie zostało właśnie potwierdzone. Poniżej znajdują się wszystkie szczegóły nadchodzącej rozmowy.</p>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 25px 0;">
                    <p style="margin: 5px 0; color: #334155;"><strong>📅 Data:</strong> ${dateStr}</p>
                    <p style="margin: 5px 0; color: #334155;"><strong>⏰ Czas:</strong> ${booking.startTime} (${booking.timezone})</p>
                    <p style="margin: 5px 0; color: #334155;"><strong>⏳ Czas trwania:</strong> 30 minut</p>
                </div>

                <div style="text-align: center; margin: 35px 0;">
                    <a href="${meetLink}" style="background: #059669; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">
                        🎥 Dołącz do Google Meet
                    </a>
                </div>

                <p style="color: #64748b; font-size: 12px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    Jeśli chcesz zmienić termin lub odwołać spotkanie, odpowiedz na tę wiadomość.<br>
                    Wiadomość wygenerowana automatycznie przez Nexus ERP.
                </p>
            </div>
        </div>
        `;

        try {
            await this.transporter.sendMail({
                from: `"Nexus ERP" <${process.env.SMTP_USER || 'no-reply@nexus.local'}>`,
                to: booking.recruiterEmail,
                subject: `Potwierdzenie spotkania: ${dateStr} o ${booking.startTime}`,
                html: htmlTemplate
            });
            console.log(`[MeetingsEmailService] ✅ E-mail wysłany pomyślnie do ${booking.recruiterEmail}`);
        } catch (error) {
            console.error('[MeetingsEmailService] ❌ Błąd wysyłki e-mail:', error.message);
        }
    }
}

module.exports = new MeetingsEmailService();
