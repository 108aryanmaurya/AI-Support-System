import {
  CLASSIFICATION_INTENTS,
  CLASSIFICATION_SENTIMENTS,
  isClassificationIntent,
  isClassificationSentiment,
} from './aiClassification.js';
import {
  CONVERSATION_PRIORITIES,
  isConversationAssignmentType,
  isConversationPriority,
} from './conversationWorkspace.js';
import { mergeWorkflowSchedule } from './workflowSchedule.js';

/** @typedef {'inbound_message' | 'sla_warning' | 'tag_added' | 'schedule'} WorkflowTrigger */

export const WORKFLOW_TRIGGERS = Object.freeze([
  'inbound_message',
  'sla_warning',
  'tag_added',
  'schedule',
]);

export const WORKFLOW_CONDITION_OPS = Object.freeze(['eq', 'ne', 'in', 'not_in', 'gte', 'lte']);

export const WORKFLOW_CONDITION_FIELDS = Object.freeze([
  'intent',
  'sentiment',
  'sentiment_score',
  'language',
  'priority',
  'channel_id',
  'ai_enabled',
  'status',
  'tag_id',
  'business_hours',
  'auto_tag',
]);

export const WORKFLOW_ACTION_TYPES = Object.freeze([
  'set_assignment',
  'set_priority',
  'add_tag',
  'notify',
  'assign_to_ai',
  'enqueue_phase6',
]);

export const WORKFLOW_RULES_LIMITS = Object.freeze({
  maxRules: 50,
  maxActionsPerRule: 10,
  maxConditionDepth: 6,
  maxNameLength: 120,
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {unknown} v */
export function isWorkflowTrigger(v) {
  return typeof v === 'string' && WORKFLOW_TRIGGERS.includes(v);
}

/** @param {unknown} v */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {unknown} raw
 */
export function mergeOrgWorkflowSettings(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const rules = Array.isArray(src.rules) ? src.rules : [];
  const schema_version =
    typeof src.schema_version === 'number' && src.schema_version >= 1
      ? Math.floor(src.schema_version)
      : 1;
  const updated_at = typeof src.updated_at === 'string' ? src.updated_at : null;
  const schedule = mergeWorkflowSchedule(src.schedule);
  return { rules, schema_version, updated_at, schedule };
}

/**
 * @param {unknown} node
 * @param {number} depth
 * @param {string} path
 */
function validateConditionNode(node, depth, path) {
  if (depth > WORKFLOW_RULES_LIMITS.maxConditionDepth) {
    throw new Error(`${path}: condition tree too deep`);
  }
  if (!isPlainObject(node)) {
    throw new Error(`${path}: condition must be an object`);
  }

  const combiner = node.op;
  if (combiner === 'all' || combiner === 'any') {
    if (!Array.isArray(node.conditions) || node.conditions.length === 0) {
      throw new Error(`${path}: ${combiner} requires a non-empty conditions array`);
    }
    if (node.conditions.length > 32) {
      throw new Error(`${path}: too many nested conditions (max 32)`);
    }
    const conditions = node.conditions.map((child, i) =>
      validateConditionNode(child, depth + 1, `${path}.conditions[${i}]`),
    );
    return { op: combiner, conditions };
  }

  const field = typeof node.field === 'string' ? node.field.trim() : '';
  if (!WORKFLOW_CONDITION_FIELDS.includes(field)) {
    throw new Error(`${path}: unknown condition field "${field}"`);
  }

  const op = typeof node.op === 'string' ? node.op : '';
  if (!WORKFLOW_CONDITION_OPS.includes(op)) {
    throw new Error(`${path}: invalid condition op "${op}"`);
  }

  const value = node.value;
  if (field === 'intent') {
    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0 || value.some((v) => !isClassificationIntent(v))) {
        throw new Error(`${path}: intent ${op} requires intent enum array`);
      }
    } else if (!isClassificationIntent(value)) {
      throw new Error(`${path}: intent value must be a classification intent`);
    }
  } else if (field === 'sentiment') {
    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0 || value.some((v) => !isClassificationSentiment(v))) {
        throw new Error(`${path}: sentiment ${op} requires sentiment enum array`);
      }
    } else if (!isClassificationSentiment(value)) {
      throw new Error(`${path}: sentiment value must be a classification sentiment`);
    }
  } else if (field === 'sentiment_score') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${path}: sentiment_score value must be a number`);
    }
  } else if (field === 'priority') {
    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0 || value.some((v) => !isConversationPriority(v))) {
        throw new Error(`${path}: priority ${op} requires priority enum array`);
      }
    } else if (!isConversationPriority(value)) {
      throw new Error(`${path}: priority value must be low|medium|high|urgent`);
    }
  } else if (field === 'channel_id' || field === 'tag_id') {
    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string' || !UUID_REGEX.test(v))) {
        throw new Error(`${path}: ${field} ${op} requires UUID array`);
      }
    } else if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      throw new Error(`${path}: ${field} value must be a UUID`);
    }
  } else if (field === 'language' || field === 'auto_tag') {
    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string' || !v.trim())) {
        throw new Error(`${path}: ${field} ${op} requires non-empty string array`);
      }
    } else if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${path}: ${field} value must be a non-empty string`);
    }
  } else if (field === 'ai_enabled' || field === 'business_hours') {
    if (typeof value !== 'boolean') {
      throw new Error(`${path}: ${field} value must be boolean`);
    }
  } else if (field === 'status') {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${path}: status value must be a string`);
    }
  }

  return { field, op, value };
}

/**
 * @param {unknown} raw
 */
function validateAction(raw, path) {
  if (!isPlainObject(raw)) {
    throw new Error(`${path}: action must be an object`);
  }
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!WORKFLOW_ACTION_TYPES.includes(type)) {
    throw new Error(`${path}: unknown action type "${type}"`);
  }

  if (type === 'set_priority') {
    if (!isConversationPriority(raw.priority)) {
      throw new Error(`${path}: set_priority requires priority`);
    }
    return { type, priority: raw.priority };
  }

  if (type === 'set_assignment') {
    const assignmentType =
      typeof raw.assignmentType === 'string'
        ? raw.assignmentType.trim()
        : typeof raw.assignment_type === 'string'
          ? raw.assignment_type.trim()
          : '';
    if (!isConversationAssignmentType(assignmentType)) {
      throw new Error(`${path}: set_assignment requires valid assignmentType`);
    }
    const memberId =
      typeof raw.assignedToMemberId === 'string'
        ? raw.assignedToMemberId.trim()
        : typeof raw.assigned_to_member_id === 'string'
          ? raw.assigned_to_member_id.trim()
          : null;
    if (assignmentType === 'assigned_to_agent' && (!memberId || !UUID_REGEX.test(memberId))) {
      throw new Error(`${path}: assigned_to_agent requires assignedToMemberId UUID`);
    }
    if (memberId && !UUID_REGEX.test(memberId)) {
      throw new Error(`${path}: assignedToMemberId must be a UUID`);
    }
    return {
      type,
      assignmentType,
      ...(memberId ? { assignedToMemberId: memberId } : {}),
    };
  }

  if (type === 'add_tag') {
    const tagName =
      typeof raw.tagName === 'string'
        ? raw.tagName.trim()
        : typeof raw.tag_name === 'string'
          ? raw.tag_name.trim()
          : '';
    const tagId =
      typeof raw.tagId === 'string'
        ? raw.tagId.trim()
        : typeof raw.tag_id === 'string'
          ? raw.tag_id.trim()
          : '';
    if (!tagName && !tagId) {
      throw new Error(`${path}: add_tag requires tagName or tagId`);
    }
    if (tagId && !UUID_REGEX.test(tagId)) {
      throw new Error(`${path}: tagId must be a UUID`);
    }
    return {
      type,
      ...(tagName ? { tagName: tagName.slice(0, 64) } : {}),
      ...(tagId ? { tagId } : {}),
    };
  }

  if (type === 'notify') {
    const channel = typeof raw.channel === 'string' ? raw.channel.trim() : 'staff';
    if (!['staff', 'assignee'].includes(channel)) {
      throw new Error(`${path}: notify channel must be staff or assignee`);
    }
    return { type, channel };
  }

  return { type };
}

/**
 * @param {unknown} raw
 * @param {number} index
 */
export function validateWorkflowRule(raw, index = 0) {
  const path = `rules[${index}]`;
  if (!isPlainObject(raw)) {
    throw new Error(`${path}: rule must be an object`);
  }

  const id = typeof raw.id === 'string' && UUID_REGEX.test(raw.id.trim()) ? raw.id.trim() : null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, WORKFLOW_RULES_LIMITS.maxNameLength) : '';
  if (!name) {
    throw new Error(`${path}: name is required`);
  }

  const trigger = typeof raw.trigger === 'string' ? raw.trigger.trim() : '';
  if (!isWorkflowTrigger(trigger)) {
    throw new Error(`${path}: invalid trigger "${trigger}"`);
  }

  const enabled = raw.enabled !== false;

  const conditions = validateConditionNode(
    raw.conditions ?? { op: 'all', conditions: [] },
    0,
    `${path}.conditions`,
  );
  if (conditions.op === 'all' && conditions.conditions?.length === 0) {
    throw new Error(`${path}: at least one condition is required`);
  }

  if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
    throw new Error(`${path}: at least one action is required`);
  }
  if (raw.actions.length > WORKFLOW_RULES_LIMITS.maxActionsPerRule) {
    throw new Error(`${path}: too many actions (max ${WORKFLOW_RULES_LIMITS.maxActionsPerRule})`);
  }

  const actions = raw.actions.map((a, i) => validateAction(a, `${path}.actions[${i}]`));

  const sortOrder = Number.isFinite(Number(raw.sortOrder))
    ? Math.max(0, Math.min(9999, Math.floor(Number(raw.sortOrder))))
    : Number.isFinite(Number(raw.sort_order))
      ? Math.max(0, Math.min(9999, Math.floor(Number(raw.sort_order))))
      : index;

  return {
    id,
    name,
    enabled,
    trigger,
    conditions,
    actions,
    sortOrder,
  };
}

/**
 * @param {unknown} rawRules
 * @returns {object[]}
 */
export function validateWorkflowRules(rawRules) {
  if (!Array.isArray(rawRules)) {
    throw new Error('rules must be an array');
  }
  if (rawRules.length > WORKFLOW_RULES_LIMITS.maxRules) {
    throw new Error(`too many rules (max ${WORKFLOW_RULES_LIMITS.maxRules})`);
  }
  return rawRules.map((r, i) => validateWorkflowRule(r, i));
}

export { CLASSIFICATION_INTENTS, CLASSIFICATION_SENTIMENTS };
