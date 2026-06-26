# QueueStorm Investigator — lightweight production image.
# node:20-slim keeps the image well under the 500MB recommendation. No GPU,
# no baked model weights, no secrets. Secrets are passed at runtime via env vars.
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# App source.
COPY src ./src
COPY SUST_Preli_Sample_Cases.json ./SUST_Preli_Sample_Cases.json

# The service binds 0.0.0.0:$PORT (default 8000).
ENV PORT=8000
EXPOSE 8000

# Lightweight container healthcheck against the readiness endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
