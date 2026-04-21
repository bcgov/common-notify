import { Test, TestingModule } from '@nestjs/testing';
import { MustacheTemplateRenderer } from '../../../../../../src/adapters/implementations/template/renderer/mustache/mustache-template.renderer';
import type { TemplateDefinition } from '../../../../../../src/adapters/interfaces';

describe('MustacheTemplateRenderer', () => {
  let renderer: MustacheTemplateRenderer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MustacheTemplateRenderer],
    }).compile();
    renderer = module.get(MustacheTemplateRenderer);
  });

  it('exposes name as mustache', () => {
    expect(renderer.name).toBe('mustache');
  });

  it('renderEmail returns subject and body with personalisation interpolated', async () => {
    const template: TemplateDefinition = {
      id: 't1',
      name: 'Welcome',
      type: 'email',
      subject: 'Hello {{name}}',
      body: 'Welcome, {{name}}. Your code is {{code}}.',
      active: true,
    };

    const result = await renderer.renderEmail({
      template,
      personalisation: { name: 'Alice', code: '123' },
    });

    expect(result.subject).toBe('Hello Alice');
    expect(result.body).toBe('Welcome, Alice. Your code is 123.');
  });

  it('renderSms returns body with personalisation interpolated', async () => {
    const template: TemplateDefinition = {
      id: 't1',
      name: 'SMS',
      type: 'sms',
      body: 'Hi {{name}}, your code: {{code}}',
      active: true,
    };

    const result = await renderer.renderSms({
      template,
      personalisation: { name: 'Bob', code: '456' },
    });

    expect(result.body).toBe('Hi Bob, your code: 456');
  });
});
