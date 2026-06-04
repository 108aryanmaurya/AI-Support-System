import { mergeWidgetSettings } from '@ai-support/shared';
import { widgetConfig } from '../../config/widget.config.js';
import { HttpError } from '../../utils/httpError.js';
import { computeIdentifyHmac, verifyIdentifyHmac } from '../../utils/widgetCrypto.js';
import { verifyInstallationSecret } from './widgetInstallation.service.js';
import { linkVisitorToCustomer } from './widgetVisitor.service.js';
import { resolveUserCustomerForIdentify } from './widgetCustomerMerge.service.js';
import { decryptSecret } from '../../utils/secretsCrypto.js';
import {
  verifyWidgetUserJwt,
  claimsToIdentifyFields,
} from '../../utils/widgetUserJwt.js';

/**
 * @param {object} installation
 * @returns {string | null}
 */
export function getInstallationSigningSecret(installation) {
  if (!installation?.secret_encrypted) return null;
  try {
    return decryptSecret(installation.secret_encrypted);
  } catch {
    return null;
  }
}

/**
 * @param {string} userJwt
 * @param {object} installation
 */
export function parseWidgetUserJwt(userJwt, installation) {
  const secret = getInstallationSigningSecret(installation);
  if (!secret) {
    throw new HttpError(
      503,
      'User JWT verification is not configured. Set SECRETS_ENCRYPTION_KEY and recreate the installation.',
    );
  }
  const claims = verifyWidgetUserJwt(userJwt, secret, {
    maxTtlSec: widgetConfig.userJwtMaxTtlSec,
  });
  if (!claims) {
    throw new HttpError(401, 'Invalid or expired user JWT.');
  }
  return claimsToIdentifyFields(claims);
}

async function linkVisitorToUserCustomer({
  installation,
  visitor,
  userId,
  email,
  name,
  attributes,
}) {
  const metadata = {
    widget_visitor_id: visitor.id,
    ...(attributes && typeof attributes === 'object' ? { widget_attributes: attributes } : {}),
  };

  const { customer, merged, upgradedInPlace } = await resolveUserCustomerForIdentify({
    organizationId: installation.organization_id,
    visitor,
    userId,
    email,
    name,
    metadata,
  });

  const normalizedEmail =
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : customer.email;

  const updatedVisitor = await linkVisitorToCustomer(visitor.id, customer.id, {
    email: normalizedEmail,
    name: name || customer.name,
  });

  return { customer, visitor: updatedVisitor, merged, upgradedInPlace };
}

export async function identifyWidgetVisitor({
  installation,
  visitor,
  userId,
  email,
  name,
  hash,
  userJwt,
  plaintextSecret = null,
}) {
  let attributes = null;

  if (userJwt && typeof userJwt === 'string' && userJwt.trim()) {
    const parsed = parseWidgetUserJwt(userJwt.trim(), installation);
    userId = parsed.userId;
    email = parsed.email ?? email;
    name = parsed.name ?? name;
    attributes = parsed.attributes;
  } else {
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
        throw new HttpError(401, 'hash is required for identify (or pass userJwt).');
      }
      let signingSecret = plaintextSecret;
      if (!signingSecret) {
        signingSecret = getInstallationSigningSecret(installation);
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

    userId = normalizedUserId;
    email = normalizedEmail;
  }

  return linkVisitorToUserCustomer({
    installation,
    visitor,
    userId,
    email,
    name,
    attributes,
  });
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
