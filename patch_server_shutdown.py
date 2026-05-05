import os

fp = r'z:\Nexus_ERP_Project\src\server.js'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

graceful_shutdown = """
// Graceful Shutdown - Naprawa zombiaków EADDRINUSE na Windowsie
process.once('SIGUSR2', () => {
    console.log('[SHUTDOWN] Zatrzymywanie serwera dla Nodemon...');
    server.close(() => {
        process.kill(process.pid, 'SIGUSR2');
    });
});

process.on('SIGINT', () => {
    console.log('[SHUTDOWN] Zamykanie z SIGINT');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] Zamykanie z SIGTERM');
    server.close(() => {
        process.exit(0);
    });
});
"""

if "Graceful Shutdown - Naprawa zombiaków" not in content:
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content + graceful_shutdown)
    print("Graceful shutdown handlers added to server.js")
else:
    print("Handlers already present.")
