[![Maven Package](https://github.com/bcgov/nr-notify/actions/workflows/merge.yml/badge.svg)](https://github.com/bcgov/nr-notify/actions/workflows/merge.yml)
[![Analysis](https://github.com/bcgov/nr-notify/actions/workflows/analysis.yml/badge.svg)](https://github.com/bcgov/nr-notify/actions/workflows/analysis.yml)

# Notify API

A multi-tenant notification service for triggering and managing notifications across multiple
channels (email, SMS, webhooks) using the Kong API Gateway for tenant authentication and API key
management.

## Overview

Notify API provides a unified platform for:

- **Multi-tenant isolation**: Secure separation of tenant data and operations
- **Multiple channels**: Email, SMS, webhooks, and extensible notification types
- **API Gateway**: Kong-based tenant authentication and API key management
- **Scale-ready**: Designed for high-volume notification delivery with horizontal scaling

## Tech Stack

- **Backend**: NestJS (TypeScript)
- **Frontend**: React + Vite (TypeScript)
- **Database**: PostgreSQL with Flyway migrations
- **API Gateway**: Kong 3.7 with key-auth plugin
- **ORM**: TypeORM
- **Deployment**: OpenShift (Silver) with Helm charts
- **Monitoring**: Prometheus metrics, Winston logging

See [TECHNOLOGY_STACK.md](TECHNOLOGY_STACK.md) for complete technical details.

## Developer Guide

For local development setup, database connections, Kong setup, and running the application, see
[DEVELOPER_SETUP.md](DEVELOPER_SETUP.md).

## Architecture

- **Notify Admin API**: JWT-authenticated backend for managing tenants, API keys, and configuration
- **Notify API**: Key-auth authenticated externally-facing API for submitting notifications
- **Kong API Gateway**: Routes requests, validates API keys, handles rate limiting
- **Multi-schema design**: Each tenant's data is isolated via database schemas

See [notify_api_gateway_architecture_v2.md](notify_api_gateway_architecture_v2.md) for detailed
architecture documentation.

## Development Standards

This project follows specific development standards documented in:

- [BEST_PRACTICES.md](BEST_PRACTICES.md) - Code style, testing, documentation conventions
- [FLYWAY_BEST_PRACTICES.md](FLYWAY_BEST_PRACTICES.md) - Database migration standards

## Docker Compose Stack

The project includes a complete local development environment via Docker Compose:

```bash
# Start all services (database, backend, frontend, Kong)
docker-compose up -d

# Start with Kong services (includes API Gateway admin UI)
docker-compose --profile kong up -d
```

## Testing

```bash
# Backend tests
cd backend && npm test

# E2E tests
npm run test:e2e
```

## Contributing

1. Follow [Conventional Commits](BEST_PRACTICES.md#git-workflow--conventional-commits) for commit
   messages
2. Read through [BEST_PRACTICES.md](BEST_PRACTICES.md) for code standards
3. Ensure tests pass and coverage is maintained
4. Submit a pull request with a clear description

## License

Apache License 2.0 - See [LICENSE](LICENSE)
