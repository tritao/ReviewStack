/** Resolve a public asset under Create React App's configured deployment root. */
export default function publicAssetURL(path: string, publicURL = process.env.PUBLIC_URL ?? ''): string {
  const base = publicURL.endsWith('/') ? publicURL.slice(0, -1) : publicURL;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
