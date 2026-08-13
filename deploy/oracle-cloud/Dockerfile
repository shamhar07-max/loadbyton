# Single-container production image for Loadbyton.
# Builds the SPA, then runs the API which serves it — matches the
# one-process production model in docs/ARCHITECTURE.md.

FROM node:22-slim AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY --from=build /app/web/dist ./web/dist

# /data is where the persistent block-volume mount goes (see README.md) —
# DB_PATH must point inside it or every container restart loses the DB,
# same failure mode this deploy path exists to fix.
RUN mkdir -p /data
ENV DB_PATH=/data/loadbyton.db
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/index.js"]
