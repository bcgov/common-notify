/**
 * Supported template rendering engines
 */
export enum TemplateEngine {
  /**
   * Legacy GC Notify format with ((placeholder)) and ((var??conditional)) syntax
   */
  LEGACY_GC_NOTIFY = 'legacy_gc_notify',

  /**
   * Handlebars template engine with full logic support (if, each, etc.)
   */
  HANDLEBARS = 'handlebars',

  /**
   * Mustache template engine with logic-less syntax
   */
  MUSTACHE = 'mustache',

  /**
   * EJS template engine with full JavaScript support
   */
  EJS = 'ejs',
}
