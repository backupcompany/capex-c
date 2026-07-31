# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-mom-daily-summary/package*.json ./services/capex-mom-daily-summary/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-mom-daily-summary && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-mom-daily-summary ./services/capex-mom-daily-summary

WORKDIR /app/services/capex-mom-daily-summary
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3006
EXPOSE 3006

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
