import { TemplateRendererRegistry } from '../../../../src/adapters/implementations/template/renderer-registry'
import type { ITemplateRenderer } from '../../../../src/adapters/interfaces'

describe('TemplateRendererRegistry', () => {
  const mockRenderer: ITemplateRenderer = {
    name: 'handlebars',
    renderEmail: vi.fn().mockResolvedValue({ subject: 's', body: 'b' }),
    renderSms: vi.fn().mockResolvedValue({ body: 'b' }),
  }

  it('getRenderer returns renderer for registered engine', () => {
    const registry = new TemplateRendererRegistry(
      [{ engine: 'handlebars', instance: mockRenderer }],
      'handlebars',
    )

    const result = registry.getRenderer('handlebars')
    expect(result).toBe(mockRenderer)
  })

  it('getRenderer throws for unknown engine', () => {
    const registry = new TemplateRendererRegistry(
      [{ engine: 'handlebars', instance: mockRenderer }],
      'handlebars',
    )

    expect(() => registry.getRenderer('jinja2')).toThrow('Unknown template engine: jinja2')
  })

  it('hasEngine returns true for registered engine', () => {
    const registry = new TemplateRendererRegistry(
      [{ engine: 'handlebars', instance: mockRenderer }],
      'handlebars',
    )

    expect(registry.hasEngine('handlebars')).toBe(true)
  })

  it('hasEngine returns false for unregistered engine', () => {
    const registry = new TemplateRendererRegistry(
      [{ engine: 'handlebars', instance: mockRenderer }],
      'handlebars',
    )

    expect(registry.hasEngine('jinja2')).toBe(false)
  })

  it('getDefaultEngine returns configured default', () => {
    const registry = new TemplateRendererRegistry(
      [{ engine: 'handlebars', instance: mockRenderer }],
      'jinja2',
    )

    expect(registry.getDefaultEngine()).toBe('jinja2')
  })
})
