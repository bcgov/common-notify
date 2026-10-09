# Still pulled from Docker Hub, unlike the other Dockerfiles here. mirror.gcr.io
# only mirrors Docker Hub OFFICIAL images (library/*), and flyway/flyway is a
# vendor repo, so there is nothing to point at. This build only runs when
# migrations/ changes, and auto-retry.yml now re-runs on a 429, so the exposure
# to Docker Hub's anonymous per-IP rate limit is one pull on an infrequent build.
FROM flyway/flyway:12-alpine

# Copy migrations
COPY ./sql /flyway/sql
COPY ./assets /flyway/assets

# Non-root user
RUN adduser -D app
USER app

# Health check and startup
HEALTHCHECK CMD info
CMD ["info", "migrate"] 
