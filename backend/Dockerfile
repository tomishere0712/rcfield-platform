FROM node:22-alpine AS build

# Force development during build so npm installs devDependencies (TypeScript, etc.)
# even if the build platform injects NODE_ENV=production.
ENV NODE_ENV=development

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
