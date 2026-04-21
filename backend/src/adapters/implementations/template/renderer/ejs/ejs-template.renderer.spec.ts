import { Test, TestingModule } from '@nestjs/testing';
import { EjsTemplateRenderer } from '../../../../../../src/adapters/implementations/template/renderer/ejs/ejs-template.renderer';
import type { TemplateDefinition } from '../../../../../../src/adapters/interfaces';

describe('EjsTemplateRenderer', () => {
  let renderer: EjsTemplateRenderer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EjsTemplateRenderer],
    }).compile();
    renderer = module.get(EjsTemplateRenderer);
  });

  it('exposes name as ejs', () => {
    expect(renderer.name).toBe('ejs');
  });

  it('renderEmail returns subject and body with EJS syntax', async () => {
    const template: TemplateDefinition = {
      id: 't1',
      name: 'Welcome',
      type: 'email',
      subject: 'Hello <%= name %>',
      body: 'Welcome, <%= name %>. Your code is <%= code %>.',
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
      body: 'Hi <%= name %>, your code: <%= code %>',
      active: true,
    };

    const result = await renderer.renderSms({
      template,
      personalisation: { name: 'Bob', code: '456' },
    });

    expect(result.body).toBe('Hi Bob, your code: 456');
  });
});
