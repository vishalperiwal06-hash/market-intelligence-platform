FROM node:22-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache ca-certificates curl wget

# Copy package requirements
COPY package.json package-lock.json* ./

# Install both dependencies and devDependencies (necessary for next build tailwind css compile)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Run build step at Docker build time
RUN npm run build

# Copy public and static assets to standalone directory (Next.js standalone standard)
RUN cp -r public .next/standalone/ || true
RUN cp -r .next/static .next/standalone/.next/ || true

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start Next.js standalone server
CMD ["node", ".next/standalone/server.js"]