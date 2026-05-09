const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.ELEVENLABS_API_KEY;

axios.get('https://api.elevenlabs.io/v1/voices', {
  headers: {
    'xi-api-key': apiKey
  }
})
.then(response => {
  const voices = response.data.voices;
  console.log("Dostępne głosy:");
  voices.forEach(v => {
    console.log(`- ${v.name} (${v.voice_id}) [${v.labels?.gender || ''}, ${v.labels?.accent || ''}]`);
  });
})
.catch(error => {
  console.error("Error:", error.response ? error.response.data : error.message);
});
