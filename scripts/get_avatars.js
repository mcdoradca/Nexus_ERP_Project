const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.HEYGEN_API_KEY;

axios.get('https://api.heygen.com/v2/avatars', {
  headers: { 'X-Api-Key': API_KEY }
})
.then(response => {
  const avatars = response.data.data.avatars || response.data.data;
  console.log("Dostępne awatary:");
  const maleAvatars = avatars.filter(a => (a.avatar_name || a.name).includes('Tyler') || (a.avatar_name || a.name).includes('Eric') || (a.avatar_name || a.name).includes('Wayne'));
  maleAvatars.slice(0, 10).forEach(a => {
    console.log(`- ${a.avatar_name || a.name}: ${a.avatar_id || a.id}`);
  });
})
.catch(error => {
  console.error("Error:", error.response ? error.response.data : error.message);
});
