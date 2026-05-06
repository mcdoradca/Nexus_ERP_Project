#!/bin/sh

DOMAIN="n-e-s.it"
EMAIL="admin@n-e-s.it"

echo "[Nexus] Uruchamianie Entrypoint Nginx..."

# Kopiuj podstawowy HTTP, jeśli HTTPS jeszcze nie istnieje, żeby certbot zadziałał dla challenge'u HTTP-01
cp /etc/nginx/conf.d/nginx-http.conf /etc/nginx/conf.d/default.conf

# Sprawdź czy certyfikat już istnieje
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "[Nexus] Brak certyfikatu dla $DOMAIN. Rozpoczynam pobieranie..."
    
    # Ponieważ korzystamy z HTTP-01 z certbot --nginx lub certbot webroot
    # Musimy najpierw podnieść Nginxa w tle na starym configu
    nginx -g "daemon off;" &
    NGINX_PID=$!
    
    sleep 3
    
    echo "[Nexus] Wywoływanie Certbota (webroot)..."
    certbot certonly --webroot -w /usr/share/nginx/html -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m $EMAIL
    
    if [ $? -eq 0 ]; then
        echo "[Nexus] Sukces! Pomyślnie wygenerowano certyfikat."
        kill $NGINX_PID
        sleep 2
    else
        echo "[Nexus] BŁĄD GENEROWANIA CERTYFIKATU. Nginx pozostanie w trybie HTTP."
        # Pozostawiamy proces działający, aby aplikacja działała przynajmniej po HTTP
        wait $NGINX_PID
        exit 1
    fi
else
    echo "[Nexus] Znaleziono aktywny certyfikat SSL dla $DOMAIN."
fi

# Załadowanie docelowej konfiguracji HTTPS
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "[Nexus] Przełączanie Nginx na profil HTTPS..."
    cp /etc/nginx/conf.d/nginx-https.conf /etc/nginx/conf.d/default.conf
fi

# Uruchom demona crond dla autoodnawiania certyfikatów
(crond -b && echo "0 0,12 * * * root certbot renew --quiet --post-hook 'nginx -s reload'") &

echo "[Nexus] Zmiany zaaplikowane. Start serwera Nginx..."
exec nginx -g "daemon off;"
