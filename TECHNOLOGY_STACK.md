# Notify API - Technology Stack

The Notify API is a modern, cloud-native notification service built for the BC Government to provide
standardized communication capabilities across the organization.

## Overview

Notify is deployed as a common service on BC Government infrastructure, providing a unified API
gateway approach for sending notifications across multiple channels.

---

## Core Infrastructure

### Container Orchestration & Deployment

- **OpenShift (Silver Cluster)**: Target deployment platform for BC Government
- **Docker**: Container runtime with Docker Compose for local development
- **Kubernetes/Helm**: Package management and orchestration
- **Zero-downtime deployment**: Rolling updates with pod disruption budgets

### API Gateway

- **Kong API Gateway**: Central API management and routing
- **Caddy Server**: Frontend reverse proxy with WAF support
  - Coraza WAF integration for web application firewall protection
  - TLS termination and security headers
  - SSL/TLS certificate management

---

## Backend Stack

### Runtime & Framework

- **TypeScript 5.x**: Strongly typed JavaScript for reliable backend code
- **Node.js**: JavaScript runtime
- **NestJS 11.x**: Enterprise-grade Node.js framework with:
  - Modular architecture
  - Dependency injection container
  - Decorators for clean, expressive code
  - Built-in swagger/OpenAPI support
  - Health checks and liveness/readiness probes

### Data Access & ORM

- **TypeORM 0.3.x**: Enterprise ORM with:
  - Type-safe database queries with TypeScript entities
  - Decorators and metadata for seamless database mapping
  - Query builder for complex queries
  - Relation management and lazy loading
  - Support for multiple database engines
- **PostgreSQL (Crunchy)**: Enterprise PostgreSQL with:
  - PostGIS support for geospatial data
  - Automated backups and high availability
  - ACID compliance

### Database Migrations

- **Flyway**: SQL-based database versioning and migration tool
  - Version control for database schema
  - Non-destructive migrations
  - Audit trail of all changes

### Data Caching (TBD)

- **Redis**: In-memory data store for:
  - Session caching
  - Rate limiting
  - Temporary data storage
  - Performance optimization

### Testing & Quality

- **Vitest 4.x**: Unit test framework
  - ESM native support
  - Snapshot testing
  - UI mode for debugging
  - Coverage reporting with c8
- **Supertest**: HTTP assertion library for testing API endpoints
- **ESLint + Prettier**: Code quality and formatting
  - Enforced consistent code style
  - Automated fixes available

### Monitoring & Observability

- **Prometheus**: Metrics collection and monitoring
  - Application metrics export via prom-client
  - System resource monitoring
  - Custom business metrics
- **Winston**: Structured logging
  - Structured JSON logs
  - Multiple transport targets
  - Log levels and rotation
- **Swagger/OpenAPI**: API documentation
  - Auto-generated from source code decorators
  - Interactive API testing in browser

### Security

- **Helmet**: Secure HTTP headers
  - HSTS, CSP, X-Frame-Options, etc.
- **.env configuration**: Environment-based configuration
  - 12-factor app compliance
  - Secrets management

---

## Frontend Stack

### UI Framework & Development

- **React 19.x**: Component-based UI library
  - Functional components and hooks
  - Virtual DOM for performance
  - React Router for client-side routing

### Build Tool & Bundler

- **Vite 7.x**: Modern frontend build tool with:
  - Lightning-fast dev server
  - Optimized production builds
  - Native ESM support
  - HMR (Hot Module Replacement)

### Styling

- **SCSS/SASS**: CSS preprocessor for scalable stylesheets
  - Variables, mixins, nesting
  - Imported from BC Government design system
- **Bootstrap 5.x**: Responsive CSS framework
- **Bootstrap Icons**: Icon library for UI

### State Management & Routing

- **TanStack React Router**: Type-safe client routing with:
  - Server-centric routing
  - Route splitting and prefetching
  - Loose coupling architecture
- **Redux** (when needed): Centralized state management with:
  - Predictable state updates
  - Time-travel debugging
  - DevTools integration

### HTTP Client

- **Axios**: HTTP client library with:
  - Request/response interceptors
  - Promise-based API
  - Request cancellation

### Testing & Quality

- **Vitest 4.x**: Unit test framework with:
  - Component testing support
  - JSDOM for DOM simulation
  - Coverage reporting
- **Playwright 1.x**: E2E testing framework with:
  - Multi-browser support (Chrome, Firefox, Safari)
  - Visual regression testing
  - Trace debugging
- **@testing-library/react**: Component testing utilities
- **MSW (Mock Service Worker)**: API mocking for tests
- **ESLint + Prettier**: Code quality and formatting

### UI Library & Design System

- **@bcgov/design-system-react-components**: BC Government design system component library
- **@bcgov/bc-sans**: BC Government branded font

### Development Utilities

- **vite-tsconfig-paths**: TypeScript path resolution in Vite

---

## Shared Infrastructure & Tools

### Version Control & Collaboration

- **Git**: Version control system
- **GitHub**: Repository hosting with:
  - Pull request reviews
  - GitHub Actions for CI/CD
  - Issue tracking and project management

### Code Quality & Linting

- **ESLint 9.x**: JavaScript/TypeScript linting
  - Shared configuration across frontend and backend
  - Prettier integration for formatting conflicts
- **Prettier 3.x**: Code formatter
  - Consistent formatting across projects
  - Configuration-driven style rules

### Package Management

- **npm**: Node.js package manager
  - Monorepo-friendly lockfile
  - Dependency management and updates

### CI/CD

- **GitHub Actions**: Workflow automation
  - Build, test, and deployment pipelines
  - Security scanning and static analysis
  - Automated dependency updates via Renovate

### Database Tooling

- **SchemaSpY**: Visual database schema documentation
  - Automatic ER diagrams
  - HTML-based documentation

---

## Environment Targets

### Development

- **Local machine**: Docker Compose for running full stack
- **Dev namespace**: Shared OpenShift development environment

### Testing

- **TEST namespace**: Pre-production environment on OpenShift
- **Automated testing**: GitHub Actions workflows with full test coverage

### Production

- **PROD namespace**: Production environment on OpenShift Silver cluster
- **High availability**: Multiple replicas, auto-scaling, pod disruption budgets

---

## API Architecture

### Request Flow

1. **External Request** → Kong API Gateway
2. **Internal API** → Caddy Reverse Proxy (frontend)
3. **Frontend** → Backend API via proxied `/api/*` routes
4. **Backend API** → External integrations via dedicated route

### Communication Patterns

- **REST API**: Standard HTTP/HTTPS endpoints
- **JSON**: Request and response format
- **Error handling**: Standardized error responses with codes
- **Rate limiting**: Kong API Gateway rate limiting policies

---

## Data Flow

### Database

- **Schema**: TypeORM entities define schema with TypeScript decorators
- **Migrations**: Flyway-managed SQL migrations (schema versioning)
- **Caching**: Redis for session and temporary data

### Logging

- **Structured logging**: JSON format via Winston
- **Log aggregation**: Centralized log collection (TBD)

### Monitoring

- **Metrics**: Prometheus format metrics exported by applications
- **Application insights**: Health checks and APM integration (TBD)

---

## Security Stack

### Network & Transport

- **TLS/SSL**: HTTPS encryption via Caddy and OpenShift
- **WAF**: Coraza WAF on Caddy for web application firewall protection
- **CORS**: Cross-Origin Resource Sharing policies

### Application Security

- **Helmet**: HTTP headers for security
- **Input validation**: NestJS decorators and TypeORM entity validation
- **Authentication**: JWT or similar (implementation-specific)
- **Authorization**: Role-based access control (RBAC)

### Secret Management

- **OpenShift Secrets**: Kubernetes-native secret storage
- **Environment variables**: Configuration via `.env` files (not in repo)
- **No hardcoded secrets**: Enforced through `.gitignore` and reviews

---

## Development Workflow Tools

### Local Development

- **Docker Compose**: Multi-container environment setup
- **npm scripts**: Standardized task runners
- **Watch mode**: Auto-reload on file changes

### Code Editors

- **VS Code**: Recommended IDE with extensions for TypeScript, ESLint, Prettier

### Documentation

- **Markdown**: Standard documentation format
- **Wiki**: Shared team documentation space
- **OpenAPI/Swagger**: Auto-generated API documentation

---

## Compliance & Standards

- **Apache 2.0 License**: Open source license
- **BC Government Standards**: Architecture and security guidelines
- **Cloud Native**: 12-factor app methodology
- **Container Security**: Regular vulnerability scanning
- **Accessibility**: WCAG compliance via BC design system

---

## Version Management

All versions specified are current as of project initialization. Regular updates via Renovate ensure
dependencies stay current with security patches and feature updates.
