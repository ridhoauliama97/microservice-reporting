/**
 * Runs `task` every `intervalMs` until the returned function is called.
 *
 * Pulled out of the worker so the schedule can be tested without waiting hours
 * for it: the interval here is milliseconds, and the worker converts its
 * hour-based setting into one. The first run is the caller's job — this only
 * handles the repeats.
 *
 * A task that throws or rejects does not stop the schedule, and is not allowed
 * to surface as an unhandled rejection either. The task is responsible for its
 * own logging: silently swallowing the error here would hide a failing sweep.
 */
export function repeatEvery(
  intervalMs: number,
  task: () => void | Promise<void>,
): () => void {
  const timer = setInterval(() => {
    void Promise.resolve()
      .then(task)
      .catch(() => {})
  }, intervalMs)
  return () => clearInterval(timer)
}
