# La app web de Pico Criollo: Expo exporta archivos estáticos y nginx los sirve. La dirección de la API se fija al construir (EXPO_PUBLIC_*
# se incrusta en el JavaScript), así que cambiarla exige reconstruir la imagen.
FROM node:22-alpine AS construir
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
RUN test -n "$EXPO_PUBLIC_API_URL" || (echo "Falta --build-arg EXPO_PUBLIC_API_URL (la dirección pública de la API)" >&2 && exit 1)
RUN npx expo export --platform web --output-dir /salida

FROM nginxinc/nginx-unprivileged:1.27-alpine AS servir
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construir /salida /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/salud || exit 1
