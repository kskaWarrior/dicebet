# Web local: `nuxt generate` servido por nginx, no lugar do Worker Cloudflare
# (Fase M-A). Contexto de build: a RAIZ do monorepo (o Nuxt precisa do
# package-lock e dos workspaces), diferente do apps/api/Dockerfile, cujo
# contexto é apps/api. O .dockerignore da raiz deixa android/ e ios/ de fora.

FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# `npm ci` na raiz instala TODOS os workspaces, incluindo o @kskawarrior/rgs-core
# privado do apps/api (rollout RGS, docs/adr/0002-carteira-de-rgs.md) — mesmo
# segredo do apps/api/Dockerfile.
RUN echo '@kskawarrior:registry=https://npm.pkg.github.com' > .npmrc
RUN npm install -g npm@11
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
COPY apps/web apps/web
# Embutidas no bundle (ssr: false).
ARG NUXT_PUBLIC_API_BASE
ARG NUXT_PUBLIC_AUTH_URL
RUN npm run generate -w apps/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/.output/public /usr/share/nginx/html
