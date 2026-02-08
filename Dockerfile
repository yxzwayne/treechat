# syntax=docker/dockerfile:1

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS client-deps
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci

FROM client-deps AS client-build
COPY client/ ./
RUN npm run build

FROM node:${NODE_VERSION} AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

FROM server-deps AS server-build
COPY server/ ./
RUN npm run build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist ./public

ENV PORT=8787
ENV SERVE_CLIENT=1
EXPOSE 8787

CMD ["node", "dist/index.js"]
