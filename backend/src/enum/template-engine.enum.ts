/**
 * Supported template rendering engines
 */
export enum TemplateEngine {
  /**
   * Legacy GC Notify format with ((placeholder)) and ((var??conditional)) syntax
   */
  LEGACY_GC_NOTIFY = 'legacy_gc_notify',

  /**
   * GC Notify's own placeholder and markdown semantics. Selected only by the GC Notify
   * compatibility routes, which force it regardless of the stored template engine; it is not
   * offered as a `renderer` option on the ordinary notify API.
   */
  GC_NOTIFY_NATIVE = 'gc_notify_native',

  /**
   * Handlebars template engine with full logic support (if, each, etc.)
   */
  HANDLEBARS = 'handlebars',

  /**
   * Mustache template engine with logic-less syntax
   */
  MUSTACHE = 'mustache',

  /**
   * MJML template engine for responsive email markup
   */
  MJML = 'mjml',
}
