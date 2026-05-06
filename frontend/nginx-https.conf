server {
    listen 80;
    server_name n-e-s.it www.n-e-s.it localhost _;

    # Obsługa certbota (webroot) dla przyszłych odnowień
    location ~ /.well-known/acme-challenge {
        allow all;
        root /usr/share/nginx/html;
    }

    # Przekierowanie całego ruchu HTTP na HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name n-e-s.it www.n-e-s.it;

    ssl_certificate /etc/letsencrypt/live/n-e-s.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n-e-s.it/privkey.pem;

    # Optymalizacja SSL i bezpieczeństwo
    ssl_session_cache shared:le_nginx_SSL:10m;
    ssl_session_timeout 1440m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    root /usr/share/nginx/html;
    index index.html;

    # Proxy dla zapytań API do backendu
    location /api/ {
        proxy_pass http://backend:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy dla WebSocketów (Socket.IO)
    location /socket.io/ {
        proxy_pass http://backend:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Wszystkie zapytania kierujemy na index.html (konieczne dla SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Blokada dostępu do ukrytych plików
    location ~ /\. {
        deny all;
    }
}
