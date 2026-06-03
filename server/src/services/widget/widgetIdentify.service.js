import { mergeWidgetSettings } from '@ai-support/shared';
import { widgetConfig } from '../../config/widget.config.js';
import { HttpError } from '../../utils/httpError.js';
import { computeIdentifyHmac, verifyIdentifyHmac } from '../../utils/widgetCrypto.js';
import { findOrCreateCustomer } from '../support.service.js';
import { verifyInstallationSecret } from './widgetInstallation.service.js';
import { linkVisitorToCustomer } from './widgetVisitor.service.js';
import { decryptSecret } from '../../utils/secretsCrypto.js';

export async function identifyWidgetVisitor({
  installation,
  visitor,
  userId,
  email,
  name,
  hash,
  plaintextSecret = null,
}) {
  const settings = mergeWidgetSettings(installation.settings);
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedUserId) throw new HttpError(400, 'userId is required.');
  if (!normalizedEmail) throw new HttpError(400, 'email is required.');

  const requireHmac =
    settings.identifyRequireHmac === true ||
    (!widgetConfig.devAllowInsecureIdentify && !settings.identifyAllowInsecure);

  if (requireHmac) {
    if (!hash || typeof hash !== 'string') {
      throw new HttpError(401, 'hash is required for identify.');
    }
    let signingSecret = plaintextSecret;
    if (!signingSecret && installation.secret_encrypted) {
      try {
        signingSecret = decryptSecret(installation.secret_encrypted);
      } catch {
        signingSecret = null;
      }
    }
    if (!signingSecret) {
      throw new HttpError(
        503,
        'Identify verification is not configured. Set SECRETS_ENCRYPTION_KEY and recreate the installation, or enable insecure identify in dev.',
      );
    }
    const expected = computeIdentifyHmac(signingSecret, normalizedUserId, normalizedEmail);
    if (!verifyIdentifyHmac(hash, expected)) {
      throw new HttpError(401, 'Invalid identify hash.');
    }
  }

  const { customer } = await findOrCreateCustomer({
    organizationId: installation.organization_id,
    email: normalizedEmail,
    name: name || null,
    userId: normalizedUserId,
    customerType: 'USER',
    metadata: { widget_visitor_id: visitor.id },
  });

  const updatedVisitor = await linkVisitorToCustomer(visitor.id, customer.id, {
    email: normalizedEmail,
    name,
  });

  return { customer, visitor: updatedVisitor };
}

/**
 * Verify HMAC when client sends hash only (secret not in browser).
 * Host backend must compute hash; widget API verifies with stored hash.
 */

export async function identifyWithBodySecret({
  installation,
  visitor,
  userId,
  email,
  name,
  hash,
  secret,
}) {
  if (!verifyInstallationSecret(installation, secret)) {
    throw new HttpError(401, 'Invalid widget secret.');
  }
  return identifyWidgetVisitor({
    installation,
    visitor,
    userId,
    email,
    name,
    hash: hash || computeIdentifyHmac(secret, userId, email),
    plaintextSecret: secret,
  });
}
