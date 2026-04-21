import { Test, TestingModule } from '@nestjs/testing';
import { HandlebarsTemplateRenderer } from '../../../../../../src/adapters/implementations/template/renderer/handlebars/handlebars-template.renderer';
import type { TemplateDefinition } from '../../../../../../src/adapters/interfaces';

describe('HandlebarsTemplateRenderer', () => {
  let renderer: HandlebarsTemplateRenderer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HandlebarsTemplateRenderer],
    }).compile();
    renderer = module.get(HandlebarsTemplateRenderer);
  });

  it('exposes name as handlebars', () => {
    expect(renderer.name).toBe('handlebars');
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

  it('renderEmail uses default subject when template has none', async () => {
    const template: TemplateDefinition = {
      id: 't1',
      name: 'No Subject',
      type: 'email',
      body: 'Body only',
      active: true,
    };

    const result = await renderer.renderEmail({
      template,
      personalisation: {},
    });

    expect(result.subject).toBe('Notification');
    expect(result.body).toBe('Body only');
  });

  it('renderEmail includes attachments from file personalisation', async () => {
    const template: TemplateDefinition = {
      id: 't1',
      name: 'With attachment',
      type: 'email',
      subject: 'S',
      body: 'B',
      active: true,
    };
    const base64Content = Buffer.from('file content').toString('base64');

    const result = await renderer.renderEmail({
      template,
      personalisation: {
        name: 'Alice',
        document: {
          file: base64Content,
          filename: 'doc.pdf',
          sending_method: 'attach' as const,
        },
      },
    });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments?.[0].filename).toBe('doc.pdf');
    expect(result.attachments?.[0].content).toEqual(
      Buffer.from('file content'),
    );
    expect(result.attachments?.[0].sendingMethod).toBe('attach');
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
