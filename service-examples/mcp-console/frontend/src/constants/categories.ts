export const SERVICE_CATEGORIES = [
  { value: 'msgApp', label: '3rd party messaging apps' },
  { value: 'subscription', label: 'Subscription services' },
  { value: 'template', label: 'Template services' },
  { value: 'attachment', label: 'Attachment services' },
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]['value'];

export function categoryLabel(value: string): string {
  return SERVICE_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}
