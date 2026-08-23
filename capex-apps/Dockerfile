# Sole web image for Siloam/prod monolith (capex-web). Pair with capexbe/Dockerfile only.
# Build from capex-apps/:
#   docker build -f Dockerfile -t capex-web \
#     --build-arg NEXT_PUBLIC_CAPEXBE_URL=http://capex-api:3001 \
#     --build-arg NEXT_PUBLIC_CAPEX_AUTH_MODE=sso \
#     .

FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_CAPEXBE_URL=http://capex-api:3001
ARG NEXT_PUBLIC_USE_BACKEND_SESSION=true
ARG NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=false
ARG NEXT_PUBLIC_CAPEX_AUTH_MODE=sso

ENV NEXT_PUBLIC_CAPEXBE_URL=$NEXT_PUBLIC_CAPEXBE_URL
ENV NEXT_PUBLIC_USE_BACKEND_SESSION=$NEXT_PUBLIC_USE_BACKEND_SESSION
ENV NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK=$NEXT_PUBLIC_ALLOW_SUPABASE_FALLBACK
ENV NEXT_PUBLIC_CAPEX_AUTH_MODE=$NEXT_PUBLIC_CAPEX_AUTH_MODE
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --ignore-scripts

# Explicit paths only (sonar docker:S6470 — no COPY . .)
# next-env.d.ts is gitignored (Next generates it) — do not COPY from context.
COPY app ./app
COPY src ./src
COPY public ./public
COPY middleware.ts next.config.ts tsconfig.json postcss.config.mjs ./

RUN npm run build:secure

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime only (not baked): JWT_ACCESS_SECRET must match API
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/middleware.ts ./middleware.ts

RUN chown -R node:node /app

EXPOSE 3000

USER node
CMD ["npm", "start"]
