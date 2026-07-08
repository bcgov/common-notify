import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryToMcpServer1752100000000 implements MigrationInterface {
  name = 'AddCategoryToMcpServer1752100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mcp_server_registration"
      ADD COLUMN "category" varchar(20) NOT NULL DEFAULT 'msgApp'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mcp_server_registration"
      DROP COLUMN "category"
    `);
  }
}
