@echo off
title Studio E-commerce 2026 - Serwer AI

:: KRYTYCZNE: Wymuszenie uruchomienia w fizycznym folderze, w ktorym lezy ten plik (naprawia problem skrotow)
cd /d "%~dp0"

echo ===================================================
echo Inicjalizacja narzedzia Studio E-commerce 2026...
echo Ladowanie sieci neuronowych i matryc...
echo ===================================================
echo UWAGA: Nie zamykaj tego okna podczas pracy!
echo Pomyslne uruchomienie interfejsu w przegladarce nastapi za 3 sekundy...
echo.

:: Mechanizm asynchroniczny: odlicza 3 sekundy w tle i automatycznie otwiera Twoja domyslna przegladarke
start "" cmd /c "timeout /t 3 /nobreak > NUL & start http://127.0.0.1:5000"

:: Uruchomienie wlasciwego, potężnego serwera (ta komenda celowo blokuje to okno i utrzymuje serwer przy zyciu)
python -m waitress --listen=127.0.0.1:5000 app:app

:: Zabezpieczenie przed natychmiastowym zamknieciem okna w razie wystapienia bledu srodowiskowego
pause