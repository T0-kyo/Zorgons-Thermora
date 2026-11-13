# Thermora frontend — same build for everyone.
#
#   Production (static build served by nginx on :8080):
#     docker build -t thermora-frontend .
#     docker run --rm -p 8080:80 thermora-frontend
#     # point at the real backend at build time:
#     docker build --build-arg VITE_API_URL=https://api.example.org -t thermora-frontend .
#
#   Development (hot reload on :5173), easiest via compose:
#     docker compose --profile dev up dev
#
# Pinned versions so every teammate gets identical Node/npm/nginx.

ARG NODE_VERSION=22.12-alpine
ARG NGINX_VERSION=1.27-alpine

# ---- deps: install exactly what package-lock.json says -------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- dev: vite dev server with hot reload ---------------------------------
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ---- build: type-check + production bundle --------------------------------
FROM deps AS build
# Empty = mock data (UI shows the sample-data badge). Set to the backend URL for real data.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
COPY . .
RUN npm run build

# ---- runtime: tiny nginx serving the static files -------------------------
FROM nginx:${NGINX_VERSION} AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
