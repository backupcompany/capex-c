# Build from monorepo root — needs capexbe auth + notifications sources
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-backup/package*.json ./services/capex-backup/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-backup && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-backup ./services/capex-backup

WORKDIR /app/services/capex-backup
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3004
EXPOSE 3004

# Uses monorepo capexbe for shared @nestjs + TS auth modules (see scripts/link-nest-deps.mjs)
CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
