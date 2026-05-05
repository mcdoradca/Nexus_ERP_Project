const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

async function getProjectsForUser(user) {
    // Prezes i Admin widzą Portfolio View (Wszystkie projekty, wskaźniki zdrowia)
    if (user.role === 'ADMIN' || user.department === 'PREZES') {
        return prisma.project.findMany({ 
            where: { isArchived: false },
            orderBy: { createdAt: 'desc' }, 
            include: { owner: true, pm: true } 
        });
    }
    // Reszta widzi projekty, w których uczestniczy
    return prisma.project.findMany({
        where: { 
            isArchived: false,
            tasks: { some: { OR: [{ assignees: { some: { id: user.id } } }, { creatorId: user.id }] } } 
        },
        orderBy: { createdAt: 'desc' },
        include: { owner: true, pm: true }
    });
}

async function getProjectById(id) {
    return prisma.project.findUnique({
        where: { id },
        include: {
            owner: { select: { id: true, name: true } }, pm: { select: { id: true, name: true } },
            tasks: { include: { assignees: { select: { id: true, name: true, color: true } }, owner: { select: { id: true, name: true } }, _count: { select: { comments: true } } }, orderBy: { createdAt: 'desc' } }
        }
    });
}

async function createProject(data, creatorId) {
    const { name, category, description, startDate, endDate, status, color, ownerId, pmId, department } = data;
    const safeData = { name, category, description, startDate, endDate, status, color, ownerId, pmId, department };
    // Usunięcie undefined
    Object.keys(safeData).forEach(key => safeData[key] === undefined && delete safeData[key]);

    const project = await prisma.project.create({ data: safeData });
    EventBus.publish('ProjectCreated', { projectId: project.id, creatorId });
    return project;
}

async function updateProject(id, data, editorId) {
    const { name, category, description, startDate, endDate, status, color, ownerId, pmId, department, isArchived } = data;
    const safeData = { name, category, description, startDate, endDate, status, color, ownerId, pmId, department, isArchived };
    
    // Zabezpieczenie na wzór kampanii: odcięcie nadmiarowych/rozłącznych Propsów
    Object.keys(safeData).forEach(key => safeData[key] === undefined && delete safeData[key]);
    if (safeData.ownerId === '') safeData.ownerId = null;
    if (safeData.pmId === '') safeData.pmId = null;

    const updated = await prisma.project.update({ where: { id }, data: safeData });
    return updated;
}

module.exports = { getProjectsForUser, getProjectById, createProject, updateProject };