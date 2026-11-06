FROM node:22-alpine
ENV NODE_ENV=production PORT=3101
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
USER 1001
EXPOSE 3101
CMD ["node", "src/server.js"]
