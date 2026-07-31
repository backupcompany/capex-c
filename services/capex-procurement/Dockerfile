# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-procurement/package*.json ./services/capex-procurement/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-procurement && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-procurement ./services/capex-procurement

WORKDIR /app/services/capex-procurement
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3010
EXPOSE 3010

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
