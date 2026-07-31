# Build from monorepo root
FROM node:22-alpine

WORKDIR /app

COPY capexbe/package*.json ./capexbe/
COPY services/capex-user-admin/package*.json ./services/capex-user-admin/

RUN cd capexbe && npm ci --omit=dev \
  && cd ../services/capex-user-admin && npm ci --omit=dev

COPY capexbe/src ./capexbe/src
COPY capexbe/tsconfig*.json ./capexbe/
COPY capexbe/nest-cli.json ./capexbe/
COPY services/capex-user-admin ./services/capex-user-admin

WORKDIR /app/services/capex-user-admin
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3009
EXPOSE 3009

CMD ["node", "-r", "@swc-node/register", "dist/src/main.js"]
