const projectsService = require('./projects.service');

async function getAll(req, res) {
    try {
        const projects = await projectsService.getProjectsForUser(req.user);
        res.status(200).json(projects);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania projektów' }); }
}

async function getOne(req, res) {
    try {
        const project = await projectsService.getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Projekt nie istnieje' });
        res.status(200).json(project);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania projektu' }); }
}

async function create(req, res) {
    // Sprawdzanie roli usunięte - powinno być obsługiwane przez middleware w routerze
    try {
        const { name, description, color, startDate, endDate, budget, ownerId, pmId } = req.body;
        const project = await projectsService.createProject({ name, description, color: color || 'bg-gray-500', startDate: startDate ? new Date(startDate) : null, endDate: endDate ? new Date(endDate) : null, budget: parseFloat(budget) || 0.0, ownerId, pmId }, req.user.id);
        res.status(201).json(project);
    } catch (error) {
        console.error('[ProjectsController] Błąd podczas tworzenia projektu:', error);
        res.status(500).json({ error: 'Błąd serwera podczas tworzenia projektu' });
    }
}

async function update(req, res) {
    try {
        const updated = await projectsService.updateProject(req.params.id, req.body, req.user.id);
        res.status(200).json(updated);
    } catch (error) {
        console.error('[ProjectsController] Błąd podczas aktualizacji projektu:', error);
        res.status(500).json({ error: 'Błąd aktualizacji' });
    }
}
module.exports = { getAll, getOne, create, update };