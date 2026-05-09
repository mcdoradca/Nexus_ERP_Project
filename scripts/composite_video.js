const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const assetsDir = path.join(__dirname, '../cv_assets');
const avatarVideo = path.join(assetsDir, 'avatar_raw.mp4');
const eanVideo = path.join(assetsDir, 'ean_process.mp4');
const sentinelVideo = path.join(assetsDir, 'sentinel_analytics.mp4');
const outputVideo = path.join(assetsDir, 'NES_CV_FINAL.mp4');

if (fs.existsSync(outputVideo)) {
    fs.unlinkSync(outputVideo);
}

console.log('Rozpoczynam ulepszoną postprodukcję FFmpeg...');

// Zwiększone czasy, aby UI było widoczne znacznie dłużej (awatar wideo ma ok 124s).
const t1 = 45; // 0-45s: Awatar na pełnym ekranie z rozmytym EAN w tle
const t2 = 75; // 45-75s: Awatar PiP, w tle czysty proces EAN (30 sekund!)
const t3 = 100; // 75-100s: Awatar PiP, w tle czysty proces Sentinel (25 sekund!)

// Usunięto drawtext, dodano stream_loop by tło się nie skończyło, poprawiono chromakey na bardziej agresywny.
const filterComplex = `
[0:v]chromakey=0x00FF00:0.25:0.1[ck];
[ck]split=4[av1][av2][av3][av4];

[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[ean_bg];
[2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[sent_bg];

[ean_bg]split=2[ean_bg1][ean_bg2];
[sent_bg]split=2[sent_bg1][sent_bg2];

[ean_bg1]colorchannelmixer=rr=0.7:gg=0.7:bb=0.7,setpts=PTS-STARTPTS[bg1];
[av1]trim=start=0:end=${t1},setpts=PTS-STARTPTS[av1_t];
[bg1][av1_t]overlay=shortest=1:x=(W-w)/2:y=(H-h)/2,setsar=1,fps=30[scene1];

[ean_bg2]setpts=PTS-STARTPTS[bg2];
[av2]trim=start=${t1}:end=${t2},setpts=PTS-STARTPTS,scale=640:-1[av2_t];
[bg2][av2_t]overlay=W-w-50:H-h-50:shortest=1,setsar=1,fps=30[scene2];

[sent_bg1]setpts=PTS-STARTPTS[bg3];
[av3]trim=start=${t2}:end=${t3},setpts=PTS-STARTPTS,scale=640:-1[av3_t];
[bg3][av3_t]overlay=W-w-50:H-h-50:shortest=1,setsar=1,fps=30[scene3];

[sent_bg2]colorchannelmixer=rr=0.7:gg=0.7:bb=0.7,setpts=PTS-STARTPTS[bg4];
[av4]trim=start=${t3},setpts=PTS-STARTPTS[av4_t];
[bg4][av4_t]overlay=shortest=1:x=(W-w)/2:y=(H-h)/2,setsar=1,fps=30[scene4];

[scene1][scene2][scene3][scene4]concat=n=4:v=1:a=0[outv]
`.replace(/\n/g, ' ').trim();

// Dodano -stream_loop -1 przed plikami tła, by nigdy nie zabrakło klatek, a długość dyktował awatar (shortest=1)
const ffmpegCmd = `"${ffmpegPath}" -y -i "${avatarVideo}" -stream_loop -1 -i "${eanVideo}" -stream_loop -1 -i "${sentinelVideo}" -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "${outputVideo}"`;

try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log('\\n\\n=== POSTPRODUKCJA ZAKOŃCZONA SUKCESEM ===');
    console.log('Plik końcowy:', outputVideo);
} catch (err) {
    console.error('Błąd FFmpeg:', err.message);
    process.exit(1);
}
