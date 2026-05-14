require('dotenv').config();
const googleMeetService = require('./src/modules/meetings/google.meet.service');

async function test() {
    try {
        const booking = {
            id: 'test-booking-id-' + Date.now(),
            startTime: '14:30',
            meetingDate: new Date().toISOString(),
            durationMinutes: 30,
            recruiterName: 'Test Recruiter',
            recruiterEmail: 'test@example.com',
            timezone: 'Europe/Warsaw'
        };
        const link = await googleMeetService.createSpace(booking);
        console.log('Got link:', link);
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
