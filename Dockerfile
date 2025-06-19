# Use Node.js 20 LTS
FROM node:20-alpine

# Install Git and other dependencies
RUN apk add --no-cache git curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create repos directory for git clones
RUN mkdir -p /app/repos

# Expose port
EXPOSE 3950

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3950/health || exit 1

# Start the application
CMD ["npm", "start"]