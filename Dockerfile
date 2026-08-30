FROM node:22-bookworm-slim
WORKDIR /app

# Coolify's HTTP health checker may use curl or wget.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl wget gosu \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 ./docker-entrypoint.sh
USER root
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
