const usersService = require('./users.service');

async function getUsers(req, res) {
    try {
        const users = await usersService.getAllUsers();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera przy pobieraniu użytkowników' });
    }
}

async function createUser(req, res) {
    try {
        const newUser = await usersService.createUser(req.body, req.user.id);
        res.status(201).json(newUser);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Błąd serwera przy tworzeniu użytkownika' });
    }
}

async function updateUser(req, res) {
    try {
        const updatedUser = await usersService.updateUser(req.params.id, req.body, req.user.id);
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Błąd serwera przy aktualizacji', details: error.message });
    }
}

module.exports = { getUsers, createUser, updateUser };