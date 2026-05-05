const chatService = require('./chat.service');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getMessages(req, res) {
    try {
        const { mode, id } = req.params;
        if (mode === 'global') {
            const msgs = await chatService.getGlobalMessages();
            return res.status(200).json(msgs);
        } else if (mode === 'direct') {
            if (!id) return res.status(400).json({ error: 'Wymagane ID uzytkownika' });
            const msgs = await chatService.getDirectMessagesAndMarkAsRead(req.user.id, id);
            return res.status(200).json(msgs);
        } else if (['task', 'campaign', 'project'].includes(mode)) {
            if (!id) return res.status(400).json({ error: 'Wymagane ID encji' });
            const msgs = await chatService.getEntityComments(mode, id);
            return res.status(200).json(msgs);
        }
        return res.status(400).json({ error: 'Nieznany tryb czatu' });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Błąd pobierania wiadomości' }); 
    }
}

async function uploadMessageFile(req, res) {
    try {
        const file = req.file; if (!file) return res.status(400).json({ error: 'Brak pliku' });
        const { mode, id } = req.params;
        const senderId = req.user.id;
        
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;
        const filePath = `chat-${mode}-${senderId}/${fileName}`;
        
        const { error } = await supabase.storage.from('nexus-files').upload(filePath, file.buffer, { contentType: file.mimetype });
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        
        const { data: { publicUrl } } = supabase.storage.from('nexus-files').getPublicUrl(filePath);
        const fileData = { publicUrl, fileName: file.originalname };
        
        let newMsg;
        if (mode === 'global') {
            newMsg = await chatService.saveGlobalMessage(senderId, `Przesłano plik: ${file.originalname}`, fileData);
        } else if (mode === 'direct') {
            newMsg = await chatService.saveDirectMessage(senderId, req.user.name, id, `Przesłano plik: ${file.originalname}`, fileData);
        } else if (['task', 'campaign', 'project'].includes(mode)) {
            newMsg = await chatService.saveEntityComment(mode, id, senderId, `Przesłano plik: ${file.originalname}`, fileData);
        } else {
            return res.status(400).json({ error: 'Nieznany tryb czatu' });
        }
        res.status(201).json(newMsg);
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Błąd serwera przy wrzucaniu pliku' }); 
    }
}

async function getUnreadDMs(req, res) {
    try {
        const data = await chatService.getUnreadDirectMessages(req.user.id);
        res.status(200).json(data);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania' }); }
}

async function generateTTS(req, res) {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Brak tekstu' });

        let apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'ELEVENLABS_API_KEY' } });
            if (tokenRecord) apiKey = tokenRecord.value;
        }

        if (!apiKey) return res.status(400).json({ error: 'Brak klucza API ElevenLabs' });

        const VOICE_ID = 'o2xdfKUpc1Bwq7RchZuW'; // Polski głos
        const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            text: text,
            model_id: 'eleven_multilingual_v2',
            output_format: 'mp3_44100_128'
        }, {
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        response.data.pipe(res);
    } catch (error) {
        console.error("Błąd ElevenLabs:", error.response?.data || error.message);
        res.status(500).json({ error: 'Błąd generowania TTS' });
    }
}

module.exports = { getMessages, uploadMessageFile, getUnreadDMs, generateTTS };