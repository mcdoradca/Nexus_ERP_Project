require('dotenv').config();
const { startEmailListener } = require('./src/modules/email/imap.listener');
startEmailListener();
