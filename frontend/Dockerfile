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

# Kopiowanie konfiguracji routingu (aby zapobiec 404 przy odświeżaniu w React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
