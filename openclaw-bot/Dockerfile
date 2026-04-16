FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --silent
COPY bot.mjs ./
CMD ["node", "bot.mjs"]
