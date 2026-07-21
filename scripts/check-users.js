const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany().then(users => {
    console.log(users.map(u => u.email + ' - ' + u.name + ' - ' + u.group));
    process.exit(0);
});
