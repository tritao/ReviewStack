export function parseReviewTarget(value: string): string | null {
  const input = value.trim();
  const urlMatch = input.match(
    /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/pull\/|#)(\d+)\/?$/i,
  );
  if (urlMatch != null) {
    return `/${urlMatch[1]}/${urlMatch[2]}/pull/${urlMatch[3]}`;
  }
  const repoMatch = input.match(
    /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i,
  );
  return repoMatch == null ? null : `/${repoMatch[1]}/${repoMatch[2]}/pulls`;
}
