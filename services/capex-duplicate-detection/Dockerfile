# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-duplicate-detection/package*.json ./services/capex-duplicate-detection/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-duplicate-detection && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-duplicate-detection ./services/capex-duplicate-detection

WORKDIR /app/services/capex-duplicate-detection
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3008
EXPOSE 3008

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
