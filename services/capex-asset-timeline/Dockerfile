# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-asset-timeline/package*.json ./services/capex-asset-timeline/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-asset-timeline && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-asset-timeline ./services/capex-asset-timeline

WORKDIR /app/services/capex-asset-timeline
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3007
EXPOSE 3007

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
