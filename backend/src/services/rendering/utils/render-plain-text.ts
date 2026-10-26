import Handlebars from 'handlebars'

/**
 * Renders a Handlebars template as plain text (e.g. an SMS body) with HTML escaping disabled.
 *
 * Plain text is never rendered as HTML, so escaping would only corrupt it: a value like
 * "O'Brien" would be sent as "O&#x27;Brien". Email bodies must keep the default escaping and
 * must not use this.
 */
export function renderPlainText(
  template: string,
  personalisation: Record<string, unknown>,
): string {
  return Handlebars.compile(template, { noEscape: true })(personalisation)
}
