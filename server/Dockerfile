# Build stage — compile better-sqlite3 native bindings
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.js ./

# Runtime stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY index.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3001

CMD ["node", "index.js"]
