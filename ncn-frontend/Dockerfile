# NCN Frontend - React + Vite (Build only, no nginx)
# Usage: docker build -t ncn-frontend-build . && docker cp <container>:/app/dist ./dist
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build for production
RUN npm run build

# The dist/ output can be copied out to the host
CMD ["sh", "-c", "echo 'Build complete. Copy /app/dist to your server nginx root.' && sleep infinity"]
