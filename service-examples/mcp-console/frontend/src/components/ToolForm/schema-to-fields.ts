import type { JsonSchema } from '@/api/mcpConsole.api';

export type FieldKind = 'select' | 'url' | 'text' | 'number' | 'boolean' | 'json';

export interface FieldSpec {
  name: string;
  label: string;
  description?: string;
  required: boolean;
  kind: FieldKind;
  enumOptions?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  /** Raw JSON Schema "type", used only to seed/validate the 'json' fallback kind (array vs object). */
  rawType?: string;
}

function kindOf(schema: JsonSchema): FieldKind {
  if (schema.type === 'string' && schema.enum) return 'select';
  if (schema.type === 'string' && schema.format === 'uri') return 'url';
  if (schema.type === 'string') return 'text';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  // arrays, objects, and any other unrecognized shape fall back to a raw-JSON textarea —
  // matches the two recurring compound fields (mentions/metadata) plus anything unforeseen.
  return 'json';
}

/** The one field name pulled out of "optional" and rendered above the Test button instead. */
const PREVIEW_FIELD_NAME = 'preview';

/**
 * Partitions a tool's JSON Schema into required-first, then optional field specs. The
 * "preview" field (if the tool has one) is split out separately — it controls whether the
 * call actually delivers or just validates, so it's rendered next to the Test button rather
 * than mixed in with the tool's own parameters.
 */
export function schemaToFields(schema: JsonSchema): {
  required: FieldSpec[];
  optional: FieldSpec[];
  previewField?: FieldSpec;
} {
  const properties = schema.properties ?? {};
  const requiredNames = new Set(schema.required ?? []);

  const required: FieldSpec[] = [];
  const optional: FieldSpec[] = [];
  let previewField: FieldSpec | undefined;

  for (const [name, propSchema] of Object.entries(properties)) {
    const spec: FieldSpec = {
      name,
      label: propSchema.title ?? name,
      description: propSchema.description,
      required: requiredNames.has(name),
      kind: kindOf(propSchema),
      enumOptions: propSchema.enum,
      minLength: propSchema.minLength,
      maxLength: propSchema.maxLength,
      minimum: propSchema.minimum,
      maximum: propSchema.maximum,
      rawType: propSchema.type,
    };

    if (name === PREVIEW_FIELD_NAME && !spec.required) {
      previewField = spec;
      continue;
    }
    (spec.required ? required : optional).push(spec);
  }

  return { required, optional, previewField };
}
