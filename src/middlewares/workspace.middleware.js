const prisma = require('../core/prisma');
const workspaceService = require('../services/workspace.service');

/**
 * Odczytuje identyfikator klienta (X-Workspace-Id / query.workspaceId / body.workspaceId),
 * weryfikuje jego aktywność w PostgreSQL i osadza `req.workspaceId` + `req.workspace`.
 * Przy braku nagłówka używa domyślnego Workspace (kompatybilność wsteczna).
 */
async function resolveWorkspaceContext(req, res, next) {
    try {
        const rawRequested = req.headers['x-workspace-id']
            || req.query?.workspaceId
            || (req.body && typeof req.body === 'object' ? req.body.workspaceId : null)
            || null;

        const ws = await workspaceService.resolveWorkspace(prisma, rawRequested);
        if (!ws) {
            return res.status(500).json({ error: 'Brak aktywnego klienta (Workspace) w systemie.' });
        }

        req.workspaceId = ws.id;
        req.workspace = ws;
        return next();
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            error: err.message || 'Błąd weryfikacji kontekstu klienta.',
            code: err.code || 'WORKSPACE_CONTEXT_ERROR'
        });
    }
}

module.exports = { resolveWorkspaceContext };
