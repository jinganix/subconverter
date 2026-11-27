/** A flat map of template variables (dotted keys are allowed, e.g. `clash.dns.port`). */
export type TemplateVars = Record<string, string>;

const INTERPOLATION = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Cap for rendered template output; bounds `{{ var }}` expansion blowup. */
const MAX_TEMPLATE_OUTPUT_CHARS = 5000000;

function throwBadRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Interpolate `{{ name }}` placeholders in a template body.
 *
 * This is a pragmatic subset of subconverter's template engine: variables come
 * from the `[template]` section of an external config (or the `template` config
 * block). Unknown variables resolve to an empty string, matching the engine's
 * "undefined variable" behavior.
 */
export function renderTemplate(content: string, vars: TemplateVars): string {
  // Build incrementally with a length cap: a naive `replace` would allocate
  // the full expansion (e.g. 100k `{{x}}` x 100k chars = 10GB) before we
  // could reject it. Abort past 5MB so the throw happens after ~50 vars.
  INTERPOLATION.lastIndex = 0;
  let output = "";
  let lastIndex = 0;
  for (;;) {
    const match = INTERPOLATION.exec(content);
    if (match === null) {
      break;
    }
    const key = match[1] as string;
    const replacement = Object.hasOwn(vars, key) ? (vars[key] ?? "") : "";
    if (
      output.length + (match.index - lastIndex) + replacement.length >
      MAX_TEMPLATE_OUTPUT_CHARS
    ) {
      INTERPOLATION.lastIndex = 0;
      throwBadRequest(
        `Template output exceeds size limit (max ${String(MAX_TEMPLATE_OUTPUT_CHARS)} chars).`,
      );
    }
    output += content.slice(lastIndex, match.index) + replacement;
    lastIndex = match.index + match[0].length;
  }
  if (output.length + (content.length - lastIndex) > MAX_TEMPLATE_OUTPUT_CHARS) {
    INTERPOLATION.lastIndex = 0;
    throwBadRequest(
      `Template output exceeds size limit (max ${String(MAX_TEMPLATE_OUTPUT_CHARS)} chars).`,
    );
  }
  INTERPOLATION.lastIndex = 0;
  return output + content.slice(lastIndex);
}

/** `true` when the content contains any `{{ ... }}` placeholder. */
export function hasTemplatePlaceholders(content: string): boolean {
  INTERPOLATION.lastIndex = 0;
  const found = INTERPOLATION.test(content);
  INTERPOLATION.lastIndex = 0;
  return found;
}

/** Collect the variable names referenced by a template body. */
export function templateVariableNames(content: string): string[] {
  const names = new Set<string>();
  // `matchAll` starts from the shared regex's `lastIndex`, which a prior
  // `hasTemplatePlaceholders` call may have advanced; reset it first.
  INTERPOLATION.lastIndex = 0;
  for (const match of content.matchAll(INTERPOLATION)) {
    names.add(match[1] as string);
  }
  return [...names];
}
