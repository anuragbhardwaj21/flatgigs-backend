FROM node:20-alpine AS builder

WORKDIR /app2

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN yarn install --frozen-lockfile
RUN yarn prisma:generate
RUN yarn build

FROM node:20-alpine AS runner

WORKDIR /app2

ENV NODE_ENV=production

RUN apk add --no-cache bash

COPY --from=builder /app2/package.json ./
COPY --from=builder /app2/node_modules ./node_modules
COPY --from=builder /app2/dist ./dist
COPY --from=builder /app2/prisma ./prisma
COPY scripts/docker ./scripts/docker

RUN chmod +x scripts/docker/*.sh

EXPOSE 4000

ENTRYPOINT ["scripts/docker/entrypoint.sh"]
CMD ["node", "dist/src/server.js"]
