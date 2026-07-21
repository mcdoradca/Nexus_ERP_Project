server {
    listen 80;
    server_name n-e-s.it www.n-e-s.it localhost _;

    root /usr/share/nginx/html;
    index index.html;

    # Obsługa certbota (webroot)
    location ~ /.well-known/acme-challenge {
        allow all;
        root /usr/share/nginx/html;
    }

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
        
        # Ochrona przed 504 Gateway Timeout dla długo trwających zapytań AI (Gemini)
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Proxy dla WebSocketów (Socket.IO)
    location /api/socket.io/ {
        proxy_pass http://backend:3001/api/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /socket.io/ {
        proxy_pass http://backend:3001/api/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
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
