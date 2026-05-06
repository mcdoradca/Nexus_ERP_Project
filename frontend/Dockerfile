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
RUN apk add --no-cache certbot certbot-nginx openssl dos2unix

# Kopiowanie skryptu startowego i szablonów konfiguracji
COPY entrypoint.sh /app/entrypoint.sh
COPY nginx-http.tpl /app/nginx-http.tpl
COPY nginx-https.tpl /app/nginx-https.tpl

# Uprawnienia do wykonania skryptu (i naprawa końcówek linii Windows -> Linux)
RUN dos2unix /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 80 443

CMD ["/app/entrypoint.sh"]
