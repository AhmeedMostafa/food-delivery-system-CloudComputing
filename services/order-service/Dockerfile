# ---- Stage 1: dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
ARG NODE_ENV=production
RUN if [ "$NODE_ENV" = "development" ]; then npm install; else npm install --omit=dev; fi

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PATH /app/node_modules/.bin:$PATH
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
EXPOSE 3003
USER node
CMD ["node", "src/index.js"]
