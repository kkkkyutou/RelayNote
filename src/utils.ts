import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function sanitizeSessionId(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}

export function defaultSessionId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return sanitizeSessionId(`${prefix}-${stamp}`);
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function truncate(text: string, max = 240): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 3)}...`;
}

export function resolveDataRoot(customRoot: string | undefined, cwd: string): string {
  return customRoot ? path.resolve(customRoot) : path.join(cwd, ".relaynote");
}

export function shellQuote(parts: string[]): string {
  return parts
    .map((part) => {
      if (/^[a-zA-Z0-9/_:.-]+$/.test(part)) {
        return part;
      }
      return `'${part.replace(/'/g, `'\\''`)}'`;
    })
    .join(" ");
}
