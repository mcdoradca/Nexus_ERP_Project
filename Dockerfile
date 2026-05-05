FROM node:22-alpine

WORKDIR /app

# Kopiujemy konfiguracje pakietów
COPY package*.json ./
COPY prisma ./prisma/

# Instalujemy zależności (oraz PM2 globalnie do zarządzania procesem)
RUN npm ci
RUN npm install -g pm2

# Generujemy klienta Prisma (Wymagane do połączenia z bazą)
RUN npx prisma generate

# Kopiujemy resztę kodu
COPY . .

# Wystawiamy port backendu
EXPOSE 3001

# Start przez PM2 (tryb bez demona, by kontener działał)
CMD ["pm2-runtime", "src/server.js"]
