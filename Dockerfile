# Container image for the checkout-only Streamable HTTP entry point.
# Build dist on the host first (npm run build): the image copies dist/ as-is.
#
# node:22-slim (Debian, glibc) is required: engines pin Node >=22 <23, and the
# better-sqlite3 prebuilt binaries are glibc-only, so Alpine (musl) would fall
# back to a node-gyp source compile.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist ./dist
COPY data ./data

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/src/http.js"]
