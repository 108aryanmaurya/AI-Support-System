/** Non-retryable automation job failure (marks job `dead`). */
export class WorkflowFatalError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'WorkflowFatalError';
    this.fatal = true;
  }
}
