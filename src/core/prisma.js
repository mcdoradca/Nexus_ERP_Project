const { PrismaClient } = require('@prisma/client');

/**
 * Singleton dla Prisma Client.
 * Zapobiega tworzeniu setek połączeń do bazy danych przy każdym restarcie pliku w środowisku deweloperskim.
 */
const prisma = new PrismaClient();

module.exports = prisma;