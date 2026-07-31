# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-config/package*.json ./services/capex-config/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-config && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-config ./services/capex-config

WORKDIR /app/services/capex-config
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3005
EXPOSE 3005

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
