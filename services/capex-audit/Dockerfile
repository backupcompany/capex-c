# Build from monorepo root — needs capexbe auth + notifications sources
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-audit/package*.json ./services/capex-audit/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-audit && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-audit ./services/capex-audit

WORKDIR /app/services/capex-audit
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3003
EXPOSE 3003

# Uses monorepo capexbe for shared @nestjs + TS auth modules (see scripts/link-nest-deps.mjs)
CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
