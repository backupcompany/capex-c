# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-fs/package*.json ./services/capex-fs/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-fs && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-fs ./services/capex-fs

WORKDIR /app/services/capex-fs
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3011
EXPOSE 3011

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
