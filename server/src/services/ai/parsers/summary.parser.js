import { aiParseError, AI_ERROR_CODES } from '../ai.errors.js';

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * @param {unknown} events
 * @returns {Array<{ when: string, what: string }>}
 */
function parseTimelineEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const when =
        typeof e.when === 'string'
          ? e.when.trim()
          : typeof e.at === 'string'
            ? e.at.trim()
            : '';
      const what =
        typeof e.what === 'string'
          ? e.what.trim()
          : typeof e.event === 'string'
            ? e.event.trim()
            : '';
      if (!what) return null;
      return { when: when || 'unknown', what };
    })
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * @param {string} raw
 * @param {'short' | 'detailed' | 'timeline'} type
 */
export function parseSummarizeResponse(raw, type = 'detailed') {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw aiParseError('Summarize response was not valid JSON.', AI_ERROR_CODES.PARSE_FAILED);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw aiParseError('Summarize response must be a JSON object.', AI_ERROR_CODES.PARSE_FAILED);
  }

  const summary = parsed.summary;
  if (!summary || typeof summary !== 'object') {
    throw aiParseError('Summarize response missing summary object.', AI_ERROR_CODES.PARSE_FAILED);
  }

  if (type === 'timeline') {
    const events = parseTimelineEvents(summary.events ?? summary.timeline);
    if (events.length === 0) {
      throw aiParseError(
        'Timeline summary must include summary.events array.',
        AI_ERROR_CODES.PARSE_FAILED,
      );
    }
    return { summary: { events } };
  }

  const issue = typeof summary.issue === 'string' ? summary.issue.trim() : '';
  if (!issue) {
    throw aiParseError('Summary must include summary.issue.', AI_ERROR_CODES.PARSE_FAILED);
  }

  const currentStatus =
    typeof summary.current_status === 'string'
      ? summary.current_status.trim()
      : typeof summary.currentStatus === 'string'
        ? summary.currentStatus.trim()
        : '';

  if (type === 'short') {
    return {
      summary: {
        issue,
        current_status: currentStatus || 'unknown',
      },
    };
  }

  const actionsTaken = toStringArray(summary.actions_taken ?? summary.actionsTaken);

  return {
    summary: {
      issue,
      actions_taken: actionsTaken,
      current_status: currentStatus || 'unknown',
    },
  };
}
