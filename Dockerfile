FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm install

# Copy server
COPY server/ ./server/

# Install and build mobile frontend
COPY mobile/package*.json ./mobile/
RUN cd mobile && npm install

COPY mobile/ ./mobile/
RUN cd mobile && npm run build

EXPOSE 3000

CMD ["node", "server/index.js"]
