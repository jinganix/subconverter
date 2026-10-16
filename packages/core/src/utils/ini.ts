export interface IniSection {
  name: string;
  items: Array<[string, string]>;
}

export interface IniDocument {
  sections: IniSection[];
  /** Items appearing before the first section header. */
  isolated: Array<[string, string]>;
}

export interface ParseIniOptions {
  /** Section name used to hold items that appear before the first header. */
  isolatedSection?: string;
  /** When false, empty-valued items are dropped. */
  keepEmptyValues?: boolean;
  /** Strip surrounding whitespace from keys and values. */
  trim?: boolean;
}

/**
 * Minimal INI reader mirroring the subset of `ini_reader` subconverter relies
 * on: case-preserving keys, duplicate sections, and isolated leading items.
 */
export function parseIni(content: string, options: ParseIniOptions = {}): IniDocument {
  const isolatedSection = options.isolatedSection ?? "";
  const keepEmptyValues = options.keepEmptyValues ?? false;
  const doTrim = options.trim ?? true;

  const sections: IniSection[] = [];
  const isolated: Array<[string, string]> = [];
  let current: IniSection | undefined;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine;
    if (doTrim) {
      line = line.trim();
    }
    if (line === "") {
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      const name = line.slice(1, -1).trim();
      current = { items: [], name };
      sections.push(current);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = doTrim ? line.slice(0, eq).trim() : line.slice(0, eq);
    const value = doTrim ? line.slice(eq + 1).trim() : line.slice(eq + 1);
    if (value === "" && !keepEmptyValues) {
      continue;
    }
    const pair: [string, string] = [key, value];
    if (current) {
      current.items.push(pair);
    } else {
      isolated.push(pair);
    }
  }

  if (isolated.length > 0 && isolatedSection !== "") {
    sections.unshift({ items: isolated, name: isolatedSection });
  }

  return { isolated, sections };
}

/** Return the first section with `name`, if any. */
export function findSection(doc: IniDocument, name: string): IniSection | undefined {
  return doc.sections.find((section) => section.name === name);
}

/** Return every item of every section named `name`, in document order. */
export function getSectionItems(doc: IniDocument, name: string): Array<[string, string]> {
  const items: Array<[string, string]> = [];
  for (const section of doc.sections) {
    if (section.name === name) {
      items.push(...section.items);
    }
  }
  return items;
}

/** A raw INI section: a header name and its untouched lines. */
export interface RawIniSection {
  name: string;
  lines: string[];
}

/** Split text into ordered raw sections, preserving line content. */
export function parseRawIni(content: string): RawIniSection[] {
  const sections: RawIniSection[] = [];
  let current: RawIniSection | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const header = /^\[(.*)\]$/.exec(line.trim());
    if (header) {
      current = { lines: [], name: (header[1] as string).trim() };
      sections.push(current);
      continue;
    }
    if (line.trim() === "") {
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

/** Render raw sections back into INI text with blank lines between sections. */
export function renderRawIni(sections: RawIniSection[]): string {
  const out: string[] = [];
  for (const section of sections) {
    out.push(`[${section.name}]`);
    out.push(...section.lines);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** Insert or replace a named raw section, keeping its position when present. */
export function setRawSection(sections: RawIniSection[], name: string, lines: string[]): void {
  const existing = sections.find((section) => section.name === name);
  if (existing) {
    existing.lines = lines;
    return;
  }
  sections.push({ lines, name });
}
