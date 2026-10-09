# Pulled via mirror.gcr.io, Google's anonymous Docker Hub mirror. Anonymous
# pulls straight from docker.io are rate limited PER IP, and GitHub's runners
# share them, so builds failed with 429 Too Many Requests on whichever FROM
# happened to be unlucky. Same images, same digests, no credentials needed.
# Build
FROM mirror.gcr.io/library/node:24.18.0-slim AS build

# Copy, build static files; see .dockerignore for exclusions
WORKDIR /app
COPY . ./
RUN npm ci --ignore-scripts --no-update-notifier && npm run build

# Dependencies
FROM mirror.gcr.io/library/node:24.18.0-slim AS dependencies

# Copy, build static files; see .dockerignore for exclusions
WORKDIR /app
COPY . ./
RUN npm ci --ignore-scripts --no-update-notifier --omit=dev

# Deploy using minimal Distroless image
FROM gcr.io/distroless/nodejs22-debian12:nonroot
ENV NODE_ENV=production

# Copy app and dependencies
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Boilerplate, not used in OpenShift/Kubernetes
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/api

# Nonroot user. The heap limit is set per environment by the Helm chart (NODE_OPTIONS from
# backend.heapMb), not baked in here, so it can be raised without rebuilding the image.
USER nonroot
CMD ["/app/dist/main"]
