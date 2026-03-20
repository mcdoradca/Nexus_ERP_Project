const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

async function getProjectsForUser(user) {
    // Prezes i Admin widzą Portfolio View (Wszystkie projekty, wskaźniki zdrowia)
    if (user.role === 'ADMIN' || user.department === 'PREZES') {
        return prisma.project.findMany({ orderBy: { createdAt: 'desc' }, include: { owner: true, pm: true } });
    }
    // Reszta widzi projekty, w których uczestniczy
    return prisma.project.findMany({
        where: { tasks: { some: { OR: [{ assignees: { some: { id: user.id } } }, { creatorId: user.id }] } } },
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
    const project = await prisma.project.create({ data });
    EventBus.publish('ProjectCreated', { projectId: project.id, creatorId });
    return project;
}

async function updateProject(id, data, editorId) {
    const updated = await prisma.project.update({ where: { id }, data });
    return updated;
}

module.exports = { getProjectsForUser, getProjectById, createProject, updateProject };