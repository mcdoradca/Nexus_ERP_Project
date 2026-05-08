const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config({ path: 'z:/Nexus_ERP_Project/.env' });

async function getVoices() {
  try {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    console.log(response.data.voices.map(v => `${v.name}: ${v.voice_id}`));
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
getVoices();
