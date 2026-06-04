import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { findOrCreateCustomer } from '../support.service.js';
import { linkVisitorToCustomer } from './widgetVisitor.service.js';
import { syntheticVisitorEmail } from '../../utils/widgetCrypto.js';

/**
 * Logged-in on the host site (identify / user JWT) — may view conversation history.
 * @param {object | null | undefined} customer
 */
export function isIdentifiedCustomer(customer) {
  const uid = customer?.user_id;
  return typeof uid === 'string' && uid.trim().length > 0;
}

/** Same browser/device visitor token + email captured (Intercom-style cookie continuity). */
export function visitorHasChatContinuity(visitor) {
  return Boolean(visitor?.customer_id);
}

/** May load prior threads: host-identified USER or lead with email on this device. */
export function canAccessConversationHistory({ customer, visitor }) {
  if (isIdentifiedCustomer(customer)) return true;
  if (visitorHasChatContinuity(visitor)) return true;
  return false;
}

async function loadCustomer(organizationId, customerId) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load customer.');
  if (!data) throw new HttpError(400, 'Linked customer not found.');
  return data;
}

/**
 * @param {object} visitor
 * @param {string} organizationId
 */
export async function getVisitorIdentificationState(organizationId, visitor) {
  if (!visitor?.customer_id) {
    return { isIdentified: false, customer: null };
  }
  const customer = await loadCustomer(organizationId, visitor.customer_id);
  return { isIdentified: isIdentifiedCustomer(customer), customer };
}

/**
 * Public visitor shape for widget API responses.
 * @param {object} visitor
 * @param {{ isIdentified?: boolean }} [opts]
 */
export function formatWidgetVisitor(visitor, { isIdentified = false } = {}) {
  return {
    id: visitor.id,
    email: visitor.email ?? null,
    name: visitor.name ?? null,
    customerId: visitor.customer_id ?? null,
    isIdentified: Boolean(isIdentified),
    /** Resume prior chat on this browser when visitor token + email exist. */
    canResumeChat: visitorHasChatContinuity(visitor),
  };
}

/**
 * Resolve customer for visitor — synthetic email for anonymous leads.
 * @param {object} params
 */
export async function ensureVisitorCustomer({
  organizationId,
  visitor,
  email = null,
  name = null,
  userId = null,
  customerType = 'LEAD',
}) {
  if (visitor.customer_id) {
    const customer = await loadCustomer(organizationId, visitor.customer_id);
    return { customerId: customer.id, customer, visitor };
  }

  const normalizedEmail =
    typeof email === 'string' && email.trim()
      ? email.trim().toLowerCase()
      : syntheticVisitorEmail(visitor.id);

  const { customer } = await findOrCreateCustomer({
    organizationId,
    email: normalizedEmail,
    name: name || null,
    userId: userId || null,
    customerType: userId ? 'USER' : customerType,
    metadata: { widget_visitor_id: visitor.id, synthetic_email: !email },
  });

  const updatedVisitor = await linkVisitorToCustomer(visitor.id, customer.id, {
    email: typeof email === 'string' ? email : null,
    name,
  });

  return { customerId: customer.id, customer, visitor: updatedVisitor };
}
