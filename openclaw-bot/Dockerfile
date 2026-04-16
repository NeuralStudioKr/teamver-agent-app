FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --silent
COPY bot.mjs ./
COPY personas/ ./personas/
CMD ["node", "bot.mjs"]
