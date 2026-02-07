/** Strip GitHub tokens from output to prevent accidental exposure in logs */
export function sanitizeOutput(output: string): string {
  return output
    .replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_***REDACTED***')
    .replace(/gho_[a-zA-Z0-9]{36}/g, 'gho_***REDACTED***')
    .replace(/github_pat_[a-zA-Z0-9_]{82}/g, 'github_pat_***REDACTED***')
}
