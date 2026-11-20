FROM node:22-alpine
ENV NODE_ENV=production PORT=3101
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
USER 1001
EXPOSE 3101
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node src/healthcheck.js
CMD ["node", "src/server.js"]
