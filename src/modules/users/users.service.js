const bcrypt = require('bcrypt');
const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

async function getAllUsers() {
    return prisma.user.findMany({ 
        orderBy: { name: 'asc' }, 
        select: { id: true, name: true, group: true, department: true, color: true, activeTaskId: true, email: true, role: true, isActive: true, accessibleModules: true } 
    });
}

async function createUser(data, creatorId) {
    const { email, name, password, group, department, color, role, accessibleModules } = data;
    const passwordHash = await bcrypt.hash(password, 10);
    
    const newUser = await prisma.user.create({ 
        data: { 
          email, name, passwordHash, group, department, color, role,
          accessibleModules: accessibleModules || ["kanban", "campaigns", "projects", "products", "chat"]
        } 
    });

    EventBus.publish('UserCreated', { userId: newUser.id, creatorId, timestamp: new Date() });
    return newUser;
}

async function updateUser(id, data, editorId) {
    const { email, name, password, group, department, color, role, isActive, accessibleModules } = data;
    const updateData = { email, name, group, department, color, role, isActive };
    
    if (accessibleModules) {
        updateData.accessibleModules = accessibleModules;
    }

    if (password && password.trim() !== '') {
        updateData.passwordHash = await bcrypt.hash(password, 10);
    }
    
    const updatedUser = await prisma.user.update({ where: { id }, data: updateData });
    
    EventBus.publish('UserUpdated', { userId: id, editorId, timestamp: new Date() });
    return updatedUser;
}

module.exports = { getAllUsers, createUser, updateUser };