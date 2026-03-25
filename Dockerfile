FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 may need native build tooling depending on the target
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY commands ./commands
COPY dashboard ./dashboard
COPY events ./events
COPY handlers ./handlers
COPY utils ./utils
COPY data ./data
COPY index.js ./index.js
COPY shard.js ./shard.js
COPY deploy-commands.js ./deploy-commands.js

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080

CMD ["npm", "start"]
