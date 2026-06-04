import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signWidgetUserJwt,
  verifyWidgetUserJwt,
  claimsToIdentifyFields,
  WIDGET_USER_JWT_TYP,
} from './widgetUserJwt.js';

const SECRET = 'test-widget-secret-for-jwt';

describe('widgetUserJwt', () => {
  it('signs and verifies a user JWT', () => {
    const token = signWidgetUserJwt(
      { userId: 'u1', email: 'a@b.com', name: 'Ada' },
      SECRET,
      3600,
    );
    const claims = verifyWidgetUserJwt(token, SECRET, { maxTtlSec: 86400 });
    assert.ok(claims);
    assert.equal(claims.typ, WIDGET_USER_JWT_TYP);
    assert.equal(claims.sub, 'u1');
    assert.equal(claims.email, 'a@b.com');
    assert.equal(claims.name, 'Ada');
  });

  it('rejects tampered token', () => {
    const token = signWidgetUserJwt({ userId: 'u1', email: 'a@b.com' }, SECRET, 3600);
    const bad = `${token.slice(0, -1)}x`;
    assert.equal(verifyWidgetUserJwt(bad, SECRET), null);
  });

  it('rejects wrong secret', () => {
    const token = signWidgetUserJwt({ userId: 'u1' }, SECRET, 3600);
    assert.equal(verifyWidgetUserJwt(token, 'other-secret'), null);
  });

  it('maps claims to identify fields', () => {
    const fields = claimsToIdentifyFields({
      sub: 'u9',
      email: 'x@y.z',
      name: 'Bo',
      attributes: { plan: 'pro' },
    });
    assert.equal(fields.userId, 'u9');
    assert.equal(fields.email, 'x@y.z');
    assert.equal(fields.name, 'Bo');
    assert.deepEqual(fields.attributes, { plan: 'pro' });
  });
});
