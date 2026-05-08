const fs = require('fs');
const path = require('path');

async function renderVisuals() {
    console.log('Visual Engine Agent initializing...');
    
    // Używamy formatu Web-Based Muxer z powodu braku wbudowanej obsługi animowanego WebP
    // w podstawowym pakiecie ffmpeg-static dla Windows.
    const screenVideoPath = 'screen_recording.webp';
    const avatarVideoPath = 'nes_video_avatar.mp4';
    const outputFile = path.join(__dirname, '../nes_final_presentation.html');

    console.log('Rozpoczynam renderowanie fuzji (Smart Web Muxer)...');

    const htmlContent = `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <title>Nexus Sentinel - Proof of Value Presentation</title>
    <style>
        body { margin: 0; padding: 0; background-color: #0f172a; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; font-family: sans-serif; }
        .presentation-container { position: relative; width: 100%; max-width: 1280px; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .screen-recording { width: 100%; height: 100%; object-fit: cover; }
        .avatar-container { position: absolute; bottom: 30px; right: 30px; width: 320px; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.8); border: 2px solid rgba(255,255,255,0.1); z-index: 10; background: #1e293b; }
        .avatar-video { width: 100%; height: 100%; object-fit: cover; }
        .controls { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); display: flex; justify-content: center; z-index: 20; opacity: 0; transition: opacity 0.3s; }
        .presentation-container:hover .controls { opacity: 1; }
        button { background: #4f46e5; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-weight: bold; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; }
        button:hover { background: #4338ca; }
    </style>
</head>
<body>
    <div class="presentation-container">
        <!-- Main Screen Recording -->
        <img id="screenMedia" class="screen-recording" src="${screenVideoPath}" alt="Screen Recording">
        
        <!-- PiP Avatar Video with Audio -->
        <div class="avatar-container">
            <video id="avatarMedia" class="avatar-video" src="${avatarVideoPath}"></video>
        </div>
        
        <div class="controls">
            <button id="playBtn">Odtwórz Prezentację (SOT)</button>
        </div>
    </div>

    <script>
        const avatarVideo = document.getElementById('avatarMedia');
        const screenMedia = document.getElementById('screenMedia');
        const playBtn = document.getElementById('playBtn');

        // Reload WebP animation trick
        const webpSrc = screenMedia.src;
        
        playBtn.addEventListener('click', () => {
            // Re-trigger animated webp by resetting src
            screenMedia.src = webpSrc + '?t=' + new Date().getTime();
            avatarVideo.currentTime = 0;
            avatarVideo.play();
            playBtn.style.display = 'none';
        });

        avatarVideo.addEventListener('ended', () => {
            playBtn.style.display = 'block';
            playBtn.innerText = 'Odtwórz Ponownie';
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(outputFile, htmlContent);
    console.log(`SUCCESS: Plik ${outputFile} został wygenerowany pomyślnie.`);
}

renderVisuals().then(() => {
    console.log('Visual Engine Agent finished. Rurociąg fuzji zamknięty.');
}).catch(e => {
    console.error('Fatalny błąd montażu.', e);
});
