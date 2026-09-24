# Build stage
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
# @kskawarrior/rgs-core vem do GitHub Packages (rollout RGS, docs/adr/0002-carteira-de-rgs.md).
# O contexto de build é apps/api, que não enxerga o .npmrc da raiz, então o mapeamento de
# escopo é declarado aqui; só o TOKEN entra como segredo do BuildKit (nunca como camada
# da imagem) — o .npmrc de projeto, e não `npm config set`, porque o segredo monta sobre
# /root/.npmrc.
RUN echo '@kskawarrior:registry=https://npm.pkg.github.com' > .npmrc
RUN npm install -g npm@11
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Cloud Run injects PORT; the app reads it (defaults to 8080)
EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
