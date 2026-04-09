import { NotifyModule } from './notify.module'

/**
 * NotifyModule Structure Tests
 *
 * Tests the module structure and exports. Full module bootstrapping would require
 * mocking complex dependencies (TypeORM, Database). Integration testing with the
 * full dependency tree happens at application bootstrap in e2e tests.
 */
describe('NotifyModule', () => {
  it('should be defined', () => {
    expect(NotifyModule).toBeDefined()
  })

  it('should have correct name', () => {
    expect(NotifyModule.name).toBe('NotifyModule')
  })

  it('should be importable by other modules', () => {
    // The module declaration works if we can access it without errors
    const moduleName = NotifyModule.name
    expect(moduleName).toBeTruthy()
  })
})
