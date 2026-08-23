# Sole API image for Siloam/prod monolith (capex-api).
# Build from capexbe/ (compose context) or:
#   docker build -f capexbe/Dockerfile -t capex-api ./capexbe

FROM node:22-alpine AS build
WORKDIR /w

# Explicit paths only (sonar docker:S6470 — no COPY . .)
COPY package.json package-lock.json ./

# Lockfile + ci (docker:S8543); no lifecycle scripts (docker:S6505)
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY src ./src
COPY nest-cli.json tsconfig.json tsconfig.build.json tsconfig.shared.json .swcrc ./
COPY scripts ./scripts

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /w/package.json /w/package-lock.json ./
COPY --from=build /w/node_modules ./node_modules
COPY --from=build /w/dist ./dist

RUN chown -R node:node /app

EXPOSE 3001

USER node
CMD ["node", "dist/src/main.js"]
