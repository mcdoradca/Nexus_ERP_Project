const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');
const socketService = require('../../core/socket');

async function getTasksForUser(user) {
    let whereClause = { isArchived: false };
    if (user.role !== 'ADMIN' && user.department !== 'PREZES') {
        whereClause = {
            isArchived: false,
            OR: [
                { assignees: { some: { id: user.id } } }, 
                { ownerId: user.id }, 
                { creatorId: user.id },
                { assignedGroups: { hasSome: [user.department, user.group] } }
            ] 
        };
    }
    return prisma.task.findMany({
        where: whereClause,
        include: { 
            assignees: true, 
            owner: true, 
            blocker: true, 
            project: true, 
            campaign: true, 
            creator: true,
            parentTask: true,
            activeWorkers: true,
            subTasks: true,
            _count: { select: { comments: true } } 
        },
        orderBy: { createdAt: 'desc' }
    });
}

async function createTask(data, creatorId) {
    const { title, description, priority, projectId, campaignId, assigneeIds, assignedGroups, ownerId, parentTaskId, startDate, dueDate, estimatedHours } = data;
    const newTask = await prisma.task.create({
        data: {
            title, description, priority, 
            projectId: projectId || null, 
            campaignId: campaignId || null, 
            parentTaskId: parentTaskId || null, 
            ownerId: ownerId || null, 
            assignedGroups: assignedGroups || [],
            estimatedHours: parseFloat(estimatedHours) || 0,
            startDate: startDate ? new Date(startDate) : null,
            dueDate: dueDate ? new Date(dueDate) : null, 
            creatorId, 
            status: 'TODO',
            assignees: { connect: (assigneeIds || []).map(id => ({ id })) }
        },
        include: { assignees: true, project: true, subTasks: true }
    });
    
    // Notification to assignees
    if (assigneeIds && assigneeIds.length > 0) {
        await prisma.notification.createMany({
            data: assigneeIds.map(id => ({
                userId: id,
                title: 'Nowe Zadanie',
                message: `Przypisano Ci nowe zadanie: ${newTask.title}`,
                type: 'task_new',
                taskId: newTask.id
            }))
        });
    }

    EventBus.publish('TaskAssigned', { task: newTask, assigneeIds: assigneeIds || [], assignerId: creatorId });
    socketService.broadcast('task_updated');
    return newTask;
}

async function updateTaskDetails(taskId, data, userId) {
    const { title, description, priority, startDate, dueDate, assigneeIds, assignedGroups } = data;
    
    let updateData = { title, description, priority, assignedGroups };
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    
    if (assigneeIds) {
        updateData.assignees = { set: assigneeIds.map(id => ({ id })) };
    }

    const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: { assignees: true, activeWorkers: true, subTasks: true }
    });
    socketService.broadcast('task_updated');
    return updatedTask;
}

async function updateTaskStatus(taskId, status, userId) {
    const task = await prisma.task.update({ 
        where: { id: taskId }, 
        data: { status },
        include: { assignees: true, creator: true }
    });

    if (status === 'REVIEW') {
        const higherUps = await prisma.user.findMany({
            where: { OR: [{ department: 'PREZES' }, { role: 'ADMIN' }] }
        });
        await prisma.notification.createMany({
             data: higherUps.map(u => ({
                 userId: u.id,
                 title: 'Zadanie oczekuje na weryfikację',
                 message: `Zadanie ${task.taskId} zostało ukończone. Czeka na Twój ruch (Zamknij/Cofnij).`,
                 type: 'task_review',
                 taskId: task.id
             }))
        });
    } else if (status === 'DONE') {
        await prisma.notification.create({
            data: {
                userId: task.creatorId,
                title: 'Zadanie Zakończone',
                message: `Zadanie ${task.taskId} zostało oficjalnie zweryfikowane i zamknięte.`,
                type: 'info',
                taskId: task.id
            }
        });
    }
    
    socketService.broadcast('task_updated');
    return task;
}

async function toggleActiveWorker(taskId, isWorking, userId) {
    if (isWorking) {
        await prisma.task.update({ where: { id: taskId }, data: { activeWorkers: { connect: { id: userId } }, status: 'IN_PROGRESS' } });
        await prisma.user.update({ where: { id: userId }, data: { activeTaskId: taskId } });
    } else {
        await prisma.task.update({ where: { id: taskId }, data: { activeWorkers: { disconnect: { id: userId } } } });
        await prisma.user.update({ where: { id: userId }, data: { activeTaskId: null } });
    }
    socketService.broadcast('task_updated');
    socketService.broadcast('user_status_changed');
    return { success: true };
}

async function blockTask(taskId, blockReason, blockerId, requestorId) {
    const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: { isBlocked: true, blockReason, blockerId },
        include: { creator: true, owner: true, blocker: true }
    });
    
    if (blockerId && blockerId !== requestorId) {
        await prisma.notification.create({
            data: {
                userId: blockerId,
                title: 'Jesteś Wąskim Gardłem!',
                message: `Zespół czeka na Twoją decyzję w zadaniu ${updatedTask.taskId}. Powód blokady: ${blockReason}`,
                type: 'urgent_block',
                taskId: updatedTask.id
            }
        });
    }

    EventBus.publish('TaskBlocked', { task: updatedTask, blockReason, blockerId, requestorId });
    socketService.broadcast('task_updated');
    return updatedTask;
}

async function unblockTask(taskId) {
    const task = await prisma.task.update({ 
        where: { id: taskId }, 
        data: { isBlocked: false, blockReason: null, blockerId: null } 
    });
    socketService.broadcast('task_updated');
    return task;
}

async function addComment(taskId, authorId, content, fileData = null) {
    const data = { content, taskId, authorId, actionType: fileData ? 'file' : 'message' };
    if (fileData) { data.fileUrl = fileData.publicUrl; data.fileName = fileData.fileName; }
    
    const comment = await prisma.comment.create({ data, include: { author: { select: { name: true, color: true } } } });
    socketService.broadcast('comment_added', comment);
    return comment;
}

// --- ARCHIVE & DELETE SYSTEM ---
async function getArchivedTasks() {
    return prisma.task.findMany({
        where: { isArchived: true },
        include: { assignees: true, owner: true, project: true, campaign: true, creator: true, parentTask: true },
        orderBy: { updatedAt: 'desc' }
    });
}
async function archiveTask(id) {
    const task = await prisma.task.update({ where: { id }, data: { isArchived: true }, include: { assignees: true, creator: true } });
    socketService.broadcast('task_updated'); return task;
}
async function restoreArchivedTask(id) {
    const task = await prisma.task.update({ where: { id }, data: { isArchived: false }, include: { assignees: true, creator: true } });
    socketService.broadcast('task_updated'); return task;
}
async function deleteHardTask(id) {
    const deletedTask = await prisma.task.delete({ where: { id } });
    socketService.broadcast('task_updated'); return deletedTask;
}

module.exports = { 
    getTasksForUser, 
    createTask, 
    updateTaskDetails,
    updateTaskStatus,
    toggleActiveWorker,
    blockTask, 
    unblockTask,
    addComment,
    getArchivedTasks,
    archiveTask,
    restoreArchivedTask,
    deleteHardTask
};