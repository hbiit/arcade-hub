FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN cd shared && npm install && npm run build --if-present
RUN cd server && npm install && npm run build
RUN cd client && npm install && npm run build
EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production
ENV USE_MOCK_PLATFORM=true
CMD ["node", "server/dist/server/src/index.js"]
