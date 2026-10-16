/** A flat map of template variables (dotted keys are allowed, e.g. `clash.dns.port`). */
export type TemplateVars = Record<string, string>;

const INTERPOLATION = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Interpolate `{{ name }}` placeholders in a template body.
 *
 * This is a pragmatic subset of subconverter's template engine: variables come
 * from the `[template]` section of an external config (or the `template` config
 * block). Unknown variables resolve to an empty string, matching the engine's
 * "undefined variable" behavior.
 */
export function renderTemplate(content: string, vars: TemplateVars): string {
  return content.replace(INTERPOLATION, (_match, name: string) => vars[name] ?? "");
}

/** `true` when the content contains any `{{ ... }}` placeholder. */
export function hasTemplatePlaceholders(content: string): boolean {
  INTERPOLATION.lastIndex = 0;
  return INTERPOLATION.test(content);
}

/** Collect the variable names referenced by a template body. */
export function templateVariableNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(INTERPOLATION)) {
    names.add(match[1] as string);
  }
  return [...names];
}
