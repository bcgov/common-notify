import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateToolDefaultsAndTenantServices1751900000000 implements MigrationInterface {
  name = 'CreateToolDefaultsAndTenantServices1751900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tool_parameter_default" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "serverId" uuid NOT NULL,
        "toolName" varchar(200) NOT NULL,
        "parameterName" varchar(200) NOT NULL,
        "tenantName" varchar(200) NOT NULL DEFAULT '',
        "value" jsonb NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tool_parameter_default" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tool_parameter_default_unique"
      ON "tool_parameter_default" ("serverId", "toolName", "parameterName", "tenantName")
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_service_subscription" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantName" varchar(200) NOT NULL,
        "serverId" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_service_subscription" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenant_service_subscription_unique"
      ON "tenant_service_subscription" ("tenantName", "serverId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_service_subscription"`);
    await queryRunner.query(`DROP TABLE "tool_parameter_default"`);
  }
}
