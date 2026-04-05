FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm ci --production

# Copy server
COPY server/ ./server/

# Copy pre-built mobile frontend
COPY mobile/dist/ ./mobile/dist/

EXPOSE 3000

CMD ["node", "server/index.js"]
