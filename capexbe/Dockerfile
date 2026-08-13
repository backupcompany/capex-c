# Build from monorepo root (required — @capex/auth-core is file:../packages/...):
#   docker build -f capexbe/Dockerfile -t capex-api .
#
# Context MUST be repo root, not capexbe/ alone.

FROM node:22-alpine AS build
WORKDIR /w

COPY packages/capex-auth-core ./packages/capex-auth-core
COPY capexbe/package.json capexbe/package-lock.json ./capexbe/

WORKDIR /w/capexbe
RUN npm ci

COPY capexbe/ ./

# Monolith imports local ./auth-core.module — package is only needed for npm file: install.
# Ensure package main resolves without a fragile cross-repo tsc path.
RUN mkdir -p ../packages/capex-auth-core/dist \
  && if [ ! -f ../packages/capex-auth-core/dist/index.js ]; then \
       printf '%s\n' '"use strict"; Object.defineProperty(exports,"__esModule",{value:true});' \
         > ../packages/capex-auth-core/dist/index.js; \
     fi \
  && npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /w/capexbe/package.json /w/capexbe/package-lock.json ./
COPY --from=build /w/capexbe/node_modules ./node_modules
COPY --from=build /w/capexbe/dist ./dist
COPY --from=build /w/packages/capex-auth-core /packages/capex-auth-core

RUN rm -rf node_modules/@capex/auth-core \
  && ln -s /packages/capex-auth-core node_modules/@capex/auth-core \
  && chown -R node:node /app /packages

EXPOSE 3001

USER node
CMD ["node", "dist/src/main.js"]
