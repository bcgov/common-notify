import type { FileAttachmentValue } from '../../../../interfaces';

export function isFileAttachment(v: unknown): v is FileAttachmentValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    'file' in v &&
    'filename' in v &&
    'sending_method' in v
  );
}

export function splitPersonalisation(
  personalisation: Record<string, string | FileAttachmentValue>,
): {
  strings: Record<string, string>;
  attachments: Array<{
    filename: string;
    content: Buffer;
    sendingMethod: 'attach' | 'link';
  }>;
} {
  const strings: Record<string, string> = {};
  const attachments: Array<{
    filename: string;
    content: Buffer;
    sendingMethod: 'attach' | 'link';
  }> = [];

  for (const [key, value] of Object.entries(personalisation)) {
    if (isFileAttachment(value)) {
      attachments.push({
        filename: value.filename,
        content: Buffer.from(value.file, 'base64'),
        sendingMethod: value.sending_method,
      });
    } else {
      strings[key] = value;
    }
  }
  return { strings, attachments };
}
