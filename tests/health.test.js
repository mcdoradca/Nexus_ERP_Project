const request = require('supertest');
const { app, server } = require('../src/server');

describe('API Health Check', () => {
    afterAll(async () => {
        try {
            if (server && server.listening) server.close();
        } catch (e) {}
    });

    it('should return 200 OK for /api/health', async () => {
        const response = await request(app).get('/api/health');
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body).toHaveProperty('dbConnected');
    });
});
