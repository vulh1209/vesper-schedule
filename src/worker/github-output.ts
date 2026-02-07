import { type Result, ok, err, type JobId, type GitHubRepo } from '../core/types.js'

// --- GitHub API rate limit tracking ---

const RATE_LIMIT_MAX = 5000       // GitHub's hourly limit
const RATE_LIMIT_THRESHOLD = 4500 // Pause threshold
let ghApiCallCount = 0
let ghApiCallWindowStart = Date.now()

/** Track a GitHub API call. Returns error if rate limit exceeded. */
function trackGhApiCall(): Result<void> {
  const now = Date.now()
  // Reset counter every hour
  if (now - ghApiCallWindowStart > 60 * 60 * 1000) {
    ghApiCallCount = 0
    ghApiCallWindowStart = now
  }
  ghApiCallCount++
  if (ghApiCallCount >= RATE_LIMIT_THRESHOLD) {
    return err(`GitHub API rate limit approaching (${ghApiCallCount}/${RATE_LIMIT_MAX} calls this hour). Pausing operations.`)
  }
  return ok(undefined)
}

/** Get current rate limit usage */
export function getRateLimitStatus(): { calls: number; limit: number; remaining: number } {
  return {
    calls: ghApiCallCount,
    limit: RATE_LIMIT_MAX,
    remaining: RATE_LIMIT_MAX - ghApiCallCount,
  }
}

/**
 * Post a comment to a GitHub issue/PR with idempotency.
 * Embeds a hidden HTML marker <!--vesper-job:{jobId}--> to prevent duplicate posts.
 */
export async function postIfNotExists(
  repo: GitHubRepo,
  issueNumber: number,
  _jobId: JobId,
  body: string,
): Promise<Result<boolean>> {
  const marker = `<!--vesper-job:${_jobId}-->`

  const rateCheck = trackGhApiCall()
  if (!rateCheck.ok) return err(rateCheck.error)

  try {
    // Check if already posted
    const checkProc = Bun.spawn(
      ['gh', 'api', `repos/${repo}/issues/${issueNumber}/comments`, '--paginate', '--jq', '.[].body'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const checkOutput = await new Response(checkProc.stdout).text()
    await checkProc.exited

    if (checkOutput.includes(marker)) {
      return ok(false) // Already posted
    }

    // Post with marker prepended
    const fullBody = `${marker}\n${body}`
    const postProc = Bun.spawn(
      ['gh', 'api', `repos/${repo}/issues/${issueNumber}/comments`, '-f', `body=${fullBody}`],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const postStderr = await new Response(postProc.stderr).text()
    const exitCode = await postProc.exited

    if (exitCode !== 0) {
      return err(`gh api failed: ${postStderr.trim()}`)
    }

    return ok(true) // Posted successfully
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`GitHub posting failed: ${message}`)
  }
}

/**
 * Add labels to a GitHub issue.
 */
export async function addLabels(
  repo: GitHubRepo,
  issueNumber: number,
  labels: string[],
): Promise<Result<void>> {
  if (labels.length === 0) return ok(undefined)

  const rateCheck = trackGhApiCall()
  if (!rateCheck.ok) return err(rateCheck.error)

  try {
    const labelArgs = labels.flatMap(l => ['--add-label', l])
    const proc = Bun.spawn(
      ['gh', 'issue', 'edit', '--repo', repo, String(issueNumber), ...labelArgs],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      return err(`Failed to add labels: ${stderr.trim()}`)
    }

    return ok(undefined)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Label operation failed: ${message}`)
  }
}
