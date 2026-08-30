FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
USER node
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
