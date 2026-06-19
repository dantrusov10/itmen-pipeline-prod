FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node server/seed.js 2>/dev/null; node server/index.js"]
