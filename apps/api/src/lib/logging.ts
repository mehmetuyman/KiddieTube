// Keep secrets in URLs out of the logs [review R3-3]: password links carry
// their token in the path (/api/auth/reset-password/<token>), and the pages
// they lead to carry tokens or invitation ids in the query string.

/** The URL as it may be logged. */
export function redactUrl(url: string): string {
  return url
    .replace(/(\/reset-password\/)[^/?#]+/, '$1[token]')
    .replace(/^(\/(?:join|accept|reset-password|api\/auth\/reset-password)[^?]*)\?.*$/, '$1?[redacted]')
}
