import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMcpServerRegistration1751500000000 implements MigrationInterface {
  name = 'CreateMcpServerRegistration1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "mcp_server_registration" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shortName" varchar(100) NOT NULL,
        "url" varchar(2048) NOT NULL,
        "transport" varchar(20) NOT NULL DEFAULT 'streamable-http',
        "apiKey" text NOT NULL,
        "enabledTools" jsonb NOT NULL DEFAULT '[]',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mcp_server_registration" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mcp_server_registration_shortName" UNIQUE ("shortName")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mcp_server_registration"`);
  }
}
