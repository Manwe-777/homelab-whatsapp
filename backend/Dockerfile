FROM node:20-bookworm-slim

# Install dependencies needed for Puppeteer's Chromium
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Let Puppeteer download its own compatible Chromium
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npm install --omit=dev

COPY . .

EXPOSE 3008
CMD ["npm", "start"]
