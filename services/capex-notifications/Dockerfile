# Build from monorepo root — needs capexbe auth + notifications sources
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-notifications/package*.json ./services/capex-notifications/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-notifications && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-notifications ./services/capex-notifications

WORKDIR /app/services/capex-notifications
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# Uses monorepo capexbe for shared @nestjs + TS auth modules (see scripts/link-nest-deps.mjs)
CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
