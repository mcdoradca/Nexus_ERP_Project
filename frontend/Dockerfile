# Etap Budowania
FROM node:22-alpine AS build-stage

WORKDIR /app

# Kopiowanie package.json i instalacja zaleznosci
COPY package*.json ./
RUN npm ci

# Kopiowanie reszty kodu i budowanie Vite (z produkcyjnymi flagami)
COPY . .
RUN npm run build

# Etap Produkcyjny (Serwowanie)
FROM nginx:alpine AS production-stage

# Kopiowanie zbudowanych statycznych plików do Nginx
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Instalacja Certbota do odnawiania i generowania certyfikatów
RUN apk add --no-cache certbot certbot-nginx openssl

# Kopiowanie skryptu startowego i szablonów konfiguracji
COPY entrypoint.sh /app/entrypoint.sh
COPY nginx-http.conf /etc/nginx/conf.d/nginx-http.conf
COPY nginx-https.conf /etc/nginx/conf.d/nginx-https.conf

# Uprawnienia do wykonania skryptu
RUN chmod +x /app/entrypoint.sh

EXPOSE 80 443

CMD ["/app/entrypoint.sh"]
