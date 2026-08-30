FROM node:22-bookworm-slim
WORKDIR /app

# Coolify's HTTP health checker uses curl when configured.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
