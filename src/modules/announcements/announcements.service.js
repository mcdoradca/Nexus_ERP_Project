const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');
const socketService = require('../../core/socket');

async function getUnreadMandatory(userId) {
    // Zwraca tylko te wymagane ogłoszenia, których dany pracownik jeszcze nie odznaczył
    return prisma.announcement.findMany({
        where: {
            isRequired: true,
            reads: { none: { userId } } // Sprawdza brak rekordu w logach odczytu
        },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { name: true, role: true, department: true } } }
    });
}

async function getAllAnnouncements(userId) {
    return prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            author: { select: { name: true, color: true } },
            reads: { where: { userId }, select: { readAt: true } }, // Info, czy zalogowany czytał
            _count: { select: { reads: true } } // Ilość wszystkich odczytów w firmie
        }
    });
}

async function createAnnouncement(data, authorId) {
    const { title, content, priority, isRequired } = data;
    const announcement = await prisma.announcement.create({
        data: { title, content, priority: priority || 'NORMAL', isRequired: isRequired !== false, authorId },
        include: { author: { select: { name: true, color: true } } }
    });
    
    socketService.broadcast('new_announcement', announcement); // Wymuszenie reakcji frontendu na żywo
    return announcement;
}

async function markAsRead(announcementId, userId) {
    return prisma.announcementRead.create({ data: { announcementId, userId } });
}

module.exports = { getUnreadMandatory, getAllAnnouncements, createAnnouncement, markAsRead };