import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultToolToTenantService1752000000000 implements MigrationInterface {
  name = 'AddDefaultToolToTenantService1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_service_subscription"
      ADD COLUMN "defaultToolName" varchar(200)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_service_subscription"
      DROP COLUMN "defaultToolName"
    `);
  }
}
