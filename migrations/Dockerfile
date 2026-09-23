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
