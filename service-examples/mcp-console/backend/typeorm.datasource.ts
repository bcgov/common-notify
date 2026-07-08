import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { McpServerRegistration } from './src/mcp-servers/entities/mcp-server.entity';
import { TenantServiceSubscription } from './src/tenant-services/entities/tenant-service-subscription.entity';
import { ToolParameterDefault } from './src/tool-defaults/entities/tool-parameter-default.entity';

/** Used only by the TypeORM CLI (migration:generate / migration:run), not by the running app. */
export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  username: process.env.POSTGRES_USER || 'mcp_console',
  password: process.env.POSTGRES_PASSWORD || 'mcp_console',
  database: process.env.POSTGRES_DATABASE || 'mcp_console',
  entities: [McpServerRegistration, ToolParameterDefault, TenantServiceSubscription],
  migrations: ['migrations/*.ts'],
});
