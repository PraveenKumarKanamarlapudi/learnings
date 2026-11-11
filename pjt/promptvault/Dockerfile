# syntax=docker/dockerfile:1

# ---- build the UI ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    PV_DB=/data/promptvault.db \
    TRUST_PROXY=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
# Starts as root only to fix ownership of the mounted volume, then drops to the unprivileged "node" user.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node_modules/.bin/tsx", "server/index.ts"]
