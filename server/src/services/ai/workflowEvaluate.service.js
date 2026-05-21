import { isWorkflowTrigger } from '@ai-support/shared';

/**
 * @typedef {Record<string, unknown>} WorkflowEvalContext
 */

/**
 * Build evaluation context from conversation signals + trigger extras.
 *
 * @param {object} params
 * @param {import('./conversationAiSignals.service.js').getConversationAiSignals extends (...args: any) => Promise<infer R> ? R : never} params.signals
 * @param {string} params.trigger
 * @param {boolean} [params.isBusinessHours]
 * @param {string} [params.tagId]
 * @param {string} [params.status]
 */
export function buildWorkflowEvalContext({ signals, trigger, isBusinessHours = true, tagId, status }) {
  const classification = signals.classification ?? null;
  return {
    trigger,
    conversation_id: signals.conversationId,
    ai_enabled: signals.ai_enabled,
    priority: signals.priority ?? null,
    channel_id: signals.channel_id ?? null,
    status: status ?? null,
    tag_id: tagId ?? null,
    intent: classification?.intent ?? null,
    sentiment: classification?.sentiment ?? null,
    sentiment_score: classification?.sentiment_score ?? null,
    language: classification?.language ?? null,
    auto_tags: classification?.auto_tags ?? [],
    business_hours: Boolean(isBusinessHours),
  };
}

/**
 * @param {unknown} expected
 * @param {unknown} actual
 * @param {string} op
 */
function compareScalar(expected, actual, op) {
  if (op === 'eq') return actual === expected;
  if (op === 'ne') return actual !== expected;
  if (op === 'gte') return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
  if (op === 'lte') return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
  return false;
}

/**
 * @param {unknown} expected
 * @param {unknown} actual
 * @param {string} op
 */
function compareSet(expected, actual, op) {
  const list = Array.isArray(expected) ? expected : [expected];
  const hit = list.includes(actual);
  if (op === 'in') return hit;
  if (op === 'not_in') return !hit;
  return false;
}

/**
 * @param {object} leaf — { field, op, value }
 * @param {WorkflowEvalContext} ctx
 */
export function evaluateConditionLeaf(leaf, ctx) {
  const field = leaf.field;
  const op = leaf.op;
  const value = leaf.value;

  if (field === 'auto_tag') {
    const tags = Array.isArray(ctx.auto_tags) ? ctx.auto_tags : [];
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
    if (op === 'in' || op === 'not_in') {
      const list = Array.isArray(value) ? value.map((t) => String(t).trim().toLowerCase()) : [];
      const hit = list.some((t) => tags.includes(t));
      return op === 'in' ? hit : !hit;
    }
    const hasTag = tags.includes(normalized);
    if (op === 'eq') return hasTag;
    if (op === 'ne') return !hasTag;
    return false;
  }

  const actual = ctx[field];
  if (op === 'in' || op === 'not_in') {
    return compareSet(value, actual, op);
  }
  return compareScalar(value, actual, op);
}

/**
 * @param {object} node
 * @param {WorkflowEvalContext} ctx
 */
export function evaluateConditionTree(node, ctx) {
  if (!node || typeof node !== 'object') return false;

  if (node.op === 'all' || node.op === 'any') {
    const parts = Array.isArray(node.conditions) ? node.conditions : [];
    if (node.op === 'all') {
      return parts.every((child) => evaluateConditionTree(child, ctx));
    }
    return parts.some((child) => evaluateConditionTree(child, ctx));
  }

  return evaluateConditionLeaf(node, ctx);
}

/**
 * @param {object[]} rules — normalized rules from workflowRules.service
 * @param {string} trigger
 * @param {WorkflowEvalContext} ctx
 */
export function evaluateWorkflowRules(rules, trigger, ctx) {
  if (!isWorkflowTrigger(trigger)) return [];

  const enabled = (rules ?? []).filter((r) => r.enabled !== false && r.trigger === trigger);
  enabled.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  /** @type {Array<{ ruleId: string, name: string, trigger: string, actions: object[] }>} */
  const matched = [];

  for (const rule of enabled) {
    if (!evaluateConditionTree(rule.conditions, ctx)) continue;
    matched.push({
      ruleId: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      actions: rule.actions,
    });
  }

  return matched;
}
