# ---- Dev/Build stage: full node image so vite works in dev compose ----
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# ---- Production build ----
FROM builder AS build-stage
RUN npm run build

# ---- Serve with nginx ----
FROM nginx:alpine AS runtime
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
