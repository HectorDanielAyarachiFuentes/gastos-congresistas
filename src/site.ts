const rawBase = import.meta.env.BASE_URL || '/';

function normalizeBasePath(base: string) {
  if (!base || base === '/') return '/';
  const withLeadingSlash = base.startsWith('/') ? base : `/${base}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export const BASE_PATH = normalizeBasePath(rawBase);

export function withBasePath(path: string) {
  if (!path) return BASE_PATH;
  if (/^(?:https?:)?\/\//.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${BASE_PATH}${normalizedPath}`;
}

export function toAbsoluteSiteUrl(path: string) {
  if (typeof window !== 'undefined') {
    return new URL(withBasePath(path), window.location.origin).toString();
  }

  return withBasePath(path);
}
