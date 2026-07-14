# =============================================================================
#  TDP Gestión — imagen construida POR COOLIFY en cada push (no inmutable).
#  Multi-stage: deps → build → runtime mínimo (standalone) con git + OpenTofu
#  (el runner de infraestructura clona tdp-tienda-infra y ejecuta plan/apply).
# =============================================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

# git (clonado del repo de infra) + tofu (alineado con el CI de tdp-tienda-infra)
ARG TOFU_VERSION=1.10.6
ARG TARGETARCH=amd64
# La descarga de tofu desde GitHub es el único paso del build que depende de un
# servicio externo; con reintentos para que un 5xx/429 puntual de GitHub no tumbe
# el deploy entero (era un wget a un solo intento).
RUN apk add --no-cache git ca-certificates wget unzip \
    && wget -q --tries=5 --waitretry=3 --timeout=30 --retry-connrefused \
         --retry-on-http-error=408,429,500,502,503,504 \
         "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/tofu.zip \
    && unzip -q /tmp/tofu.zip -d /usr/local/bin tofu \
    && chmod +x /usr/local/bin/tofu \
    && rm /tmp/tofu.zip \
    && tofu version

# Usuario sin privilegios + volumen de trabajo del runner de tofu
RUN addgroup -S tdp && adduser -S tdp -G tdp \
    && mkdir -p /data && chown tdp:tdp /data

COPY --from=build --chown=tdp:tdp /app/.next/standalone ./
COPY --from=build --chown=tdp:tdp /app/.next/static ./.next/static
COPY --from=build --chown=tdp:tdp /app/drizzle ./drizzle
COPY --from=build --chown=tdp:tdp /app/scripts/migrate.mjs ./scripts/migrate.mjs
# El build standalone de Next solo traza los ficheros de drizzle-orm que importa
# la app, y deja fuera el subpath del migrador (drizzle-orm/node-postgres/migrator)
# que usa scripts/migrate.mjs. Copiamos el paquete completo —no tiene dependencias
# propias— para que el migrador resuelva. (pg ya entra vía serverExternalPackages.)
COPY --from=build --chown=tdp:tdp /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=build --chown=tdp:tdp /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER tdp
EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=25s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
