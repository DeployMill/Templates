FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Build stage exists only to resolve node_modules from the manifest + lockfile.
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod=false

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
# Copy app source straight from the build context (NOT --from=build): a runtime
# `COPY --from=build /app/src ./src` lets BuildKit reuse a CACHED layer and emit a
# byte-identical image even when src/ changed, turning a real edit into a silent
# deploy no-op. Copying from the context keys the layer on the source content.
COPY package.json ./package.json
COPY src ./src
COPY public ./public 
EXPOSE 3000
CMD ["node", "src/index.js"]
