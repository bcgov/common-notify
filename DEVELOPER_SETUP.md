# Developer Setup Guide

This guide covers setting up your local development environment for the Notify API project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
  - [Clone & Install Dependencies](#clone--install-dependencies)
  - [Environment Configuration](#environment-configuration)
- [Running the Stack](#running-the-stack)
  - [Docker Compose Services](#docker-compose-services)
  - [Starting Services](#starting-services)
  - [Accessing Services](#accessing-services)
- [Database Setup](#database-setup)
  - [Connection Details](#connection-details)
  - [Running Migrations](#running-migrations)
  - [Seeding Data](#seeding-data)
- [Kong API Gateway](#kong-api-gateway)
  - [Kong Architecture](#kong-architecture)
  - [Managing API Keys](#managing-api-keys)
  - [Testing API Endpoints](#testing-api-endpoints)
  - [Kong Admin UI (Konga)](#kong-admin-ui-konga)
- [Running the Application](#running-the-application)
  - [Backend](#backend)
  - [Frontend](#frontend)
  - [API Endpoints](#api-endpoints)
- [Testing](#testing)
  - [Unit Tests](#unit-tests)
  - [E2E Tests](#e2e-tests)
  - [Load Tests](#load-tests)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Git** - Version control
- **Docker & Docker Compose** - Container runtime (v1.29+)
- **Node.js** - v22+ (for running outside containers)
- **npm** - Package manager
- **curl** or **Postman** - API testing

## Initial Setup

### Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/bcgov/nr-notify.git
cd nr-notify

# Install dependencies
cd backend && npm install --legacy-peer-deps
cd ../frontend && npm install
```

### Environment Configuration

Create `.env` file in the root directory:

```bash
# Database Configuration
POSTGRES_HOST=database
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=default
POSTGRES_DATABASE=postgres
POSTGRES_SCHEMA=users

# Kong Configuration (for local mirror of production)
KONG_ADMIN_URL=http://localhost:8001

# Backend Configuration
NODE_ENV=development
LOG_LEVEL=debug
PORT=3001

# Frontend Configuration
VITE_API_URL=http://localhost:3000/api
```

## Running the Stack

### Docker Compose Services

The `docker-compose.yml` includes:

| Service         | Port      | Description                      |
| --------------- | --------- | -------------------------------- |
| database        | 5432      | PostgreSQL with PostGIS          |
| migrations      | -         | Flyway database migration runner |
| backend         | 3001      | NestJS API server                |
| frontend        | 3000      | React + Vite frontend            |
| kong-migrations | -         | Kong schema bootstrap (optional) |
| kong            | 8000/8001 | API Gateway (optional)           |
| konga           | 1337      | Kong admin UI (optional)         |

### Starting Services

```bash
# Start core services (database, backend, frontend)
docker-compose up -d

# Start with Kong services (includes API Gateway)
docker-compose --profile kong up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Accessing Services

Once running:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **Metrics**: http://localhost:3001/metrics
- **Kong Gateway**: http://localhost:8000
- **Kong Admin API**: http://localhost:8001
- **Konga UI**: http://localhost:1337

## Database Setup

### Connection Details

When running Docker Compose, the database is automatically available:

```
Host: localhost
Port: 5432
Database: postgres
Schema: users
Username: postgres
Password: default
```

### Running Migrations

Migrations run automatically when `docker-compose up` is executed via the migrations service. To run
manually:

```bash
# Using Docker
docker-compose run migrations

# Or connect directly with psql
psql -h localhost -U postgres -d postgres -c "SET search_path TO users; \dt"
```

### Seeding Data

Insert test data manually or via the API:

```bash
# Connect to database
psql -h localhost -U postgres -d postgres

# Switch to users schema
SET search_path TO users;

# View tables
\dt

# Sample insert
INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com');
```

## Kong API Gateway

### Kong Architecture

Kong acts as a reverse proxy and API gateway with these components:

```
┌─────────────────────────────────────────────────────────────┐
│ External Clients (with API Key)                              │
└──────────────────┬──────────────────────────────────────────┘
                    │
                    │ apikey: tenant-key-12345
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Kong Proxy (localhost:8000)                                  │
│   - Validates API key                                         │
│   - Routes to appropriate service                            │
│   - Rate limiting, logging                                   │
└──────────────────┬──────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Notify API Service    │
        │ (localhost:3001)      │
        └───────────────────────┘
          ├─ GET /health
          ├─ POST /notifications
          ├─ GET /notifications/:id
          └─ ...

Admin Control:
┌──────────────────────────────────┐
│ Kong Admin API (localhost:8001)  │
│ - Manage services                │
│ - Manage routes                  │
│ - Manage plugins                 │
│ - Manage consumers/API keys      │
└──────────────────────────────────┘
  or
┌──────────────────────────────────┐
│ Konga Web UI (localhost:1337)     │
│ - Visual management interface    │
│ - Easier than admin API          │
└──────────────────────────────────┘
```

### Managing API Keys

Kong uses "Consumers" and "API Keys" for tenant authentication:

**Create a Consumer (Tenant):**

```bash
curl -X POST http://localhost:8001/consumers \
  -d "username=my-tenant"
```

**Create API Key for Consumer:**

```bash
curl -X POST http://localhost:8001/consumers/my-tenant/key-auth \
  -d "key=my-api-key-12345"
```

**List Consumers:**

```bash
curl http://localhost:8001/consumers
```

**Delete Consumer:**

```bash
curl -X DELETE http://localhost:8001/consumers/my-tenant
```

### Testing API Endpoints

**Without Kong (direct backend):**

```bash
# Health check
curl http://localhost:3001/health

# Get all users
curl http://localhost:3001/users

# Create user
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

**Through Kong (with API key validation):**

```bash
# Request must include API key header
curl http://localhost:8000/api/health \
  -H "apikey: test-api-key-a-12345678901234567890"

# Create notification through Kong
curl -X POST http://localhost:8000/api/notifications \
  -H "Content-Type: application/json" \
  -H "apikey: test-api-key-a-12345678901234567890" \
  -d '{
    "to": "user@example.com",
    "subject": "Test",
    "body": "Test notification"
  }'
```

### Kong Admin UI (Konga)

Konga provides a web interface for Kong management:

1. **Access Konga**: http://localhost:1337
2. **Create New Connection**:
   - Connection Name: Local Kong
   - Kong Admin URL: http://kong:8001
   - Click Connect
3. **Manage**:
   - Services: Define upstream services
   - Routes: Define request routing rules
   - Consumers: Manage tenants/API keys
   - Plugins: Enable authentication, rate limiting, logging

Alternatively, use Kong Admin API directly:

```bash
# List all services
curl http://localhost:8001/services

# List all routes
curl http://localhost:8001/routes

# List all consumers
curl http://localhost:8001/consumers
```

## Running the Application

### Backend

**Development mode (with hot reload):**

```bash
cd backend
npm run start:dev
```

**Production mode:**

```bash
cd backend
npm run build
npm start
```

**Debug mode:**

```bash
cd backend
npm run start:debug
```

The backend runs on `http://localhost:3001`

**Available endpoints:**

- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `GET /users` - List all users
- `POST /users` - Create user
- `GET /users/:id` - Get user by ID
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Frontend

**Development mode:**

```bash
cd frontend
npm run dev
```

**Build for production:**

```bash
cd frontend
npm run build
```

**Preview production build:**

```bash
cd frontend
npm run preview
```

The frontend runs on `http://localhost:3000`

### API Endpoints

Full API documentation is available via Swagger:

```
http://localhost:3001/api/docs
```

## Testing

### Unit Tests

```bash
cd backend

# Run all tests
npm test

# Run specific test file
npm test src/users/users.service.spec.ts

# Run with coverage
npm run test:cov

# Watch mode
npm test -- --watch
```

### E2E Tests

```bash
cd backend

# Run E2E tests
npm run test:e2e

# Watch mode
npm run test:e2e -- --watch
```

### Load Tests

```bash
cd tests/load

# Install dependencies
npm install

# Run Kong load test
npm run test:load:kong

# Run frontend load test
npm run test:load:frontend
```

## Troubleshooting

### Database Connection Issues

**Symptom**: Connection refused to database

**Solution**:

```bash
# Check if database container is running
docker-compose ps

# Check database logs
docker-compose logs database

# Verify connection
psql -h localhost -U postgres -d postgres -c "SELECT 1"

# Restart database
docker-compose restart database
```

### Kong Not Running

**Symptom**: Cannot reach Kong at localhost:8000

**Solution**:

```bash
# Check if Kong is running with profile
docker-compose --profile kong ps

# Check Kong logs
docker-compose --profile kong logs kong

# Verify Kong Admin API
curl http://localhost:8001/status

# Restart Kong services
docker-compose --profile kong restart kong
```

### API Key Not Working

**Symptom**: 401 Unauthorized even with correct API key

**Solution**:

```bash
# Verify API key exists in Kong
curl http://localhost:8001/consumers/my-tenant/key-auth

# Check Kong plugin is enabled
curl http://localhost:8001/routes/api/plugins

# Re-seed Kong with test data
cd /path/to/kong-seed.sh
bash kong-seed.sh
```

### Backend Won't Start

**Symptom**: "Cannot find module" or port already in use

**Solution**:

```bash
# Clean install dependencies
rm -rf backend/node_modules
npm install --legacy-peer-deps

# Check port is free
lsof -i :3001

# Build and start
npm run build
npm start
```

### Docker Compose Volumes

**Symptom**: Stale data or permission issues

**Solution**:

```bash
# Remove all volumes and restart
docker-compose down -v
docker-compose up -d

# View volumes
docker-compose config | grep -A 10 volumes
```

## Next Steps

- Review [BEST_PRACTICES.md](../BEST_PRACTICES.md) for development standards
- Check [TECHNOLOGY_STACK.md](../TECHNOLOGY_STACK.md) for detailed tech info
- Read [notify_api_gateway_architecture_v2.md](../notify_api_gateway_architecture_v2.md) for
  architecture details
- Start by creating a feature branch and making your first change!
