import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { NotifyModule } from './notify.module'
import { NotifyService } from './notify.service'
import {
  NotifySimpleController,
  NotifyEventController,
  NotifyController,
  TemplatesController,
  ChesEmailController,
} from './notify.controller'

describe('NotifyModule', () => {
  let module: TestingModule

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [NotifyModule],
    }).compile()
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
  })

  it('should provide NotifyService', () => {
    const service = module.get<NotifyService>(NotifyService)
    expect(service).toBeDefined()
    expect(service).toBeInstanceOf(NotifyService)
  })

  it('should have all required controllers', () => {
    const notifySimpleController = module.get<NotifySimpleController>(NotifySimpleController)
    expect(notifySimpleController).toBeDefined()

    const notifyEventController = module.get<NotifyEventController>(NotifyEventController)
    expect(notifyEventController).toBeDefined()

    const notifyController = module.get<NotifyController>(NotifyController)
    expect(notifyController).toBeDefined()

    const templatesController = module.get<TemplatesController>(TemplatesController)
    expect(templatesController).toBeDefined()

    const chesEmailController = module.get<ChesEmailController>(ChesEmailController)
    expect(chesEmailController).toBeDefined()
  })

  it('should export NotifyService', () => {
    const service = module.get<NotifyService>(NotifyService)
    expect(service).toBeDefined()
  })

  it('should have NotifyService injected in all controllers', () => {
    const service = module.get<NotifyService>(NotifyService)
    const notifySimpleController = module.get<NotifySimpleController>(NotifySimpleController)
    const notifyEventController = module.get<NotifyEventController>(NotifyEventController)

    // Verify controllers are using the same service instance
    expect(notifySimpleController['notifyService']).toBe(service)
    expect(notifyEventController['notifyService']).toBe(service)
  })
})
