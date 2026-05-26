import { apiFetch } from './api.js'

export function orgEmailSettingsUrl(organizationId) {
  return `/api/org/${encodeURIComponent(organizationId)}/settings/email`
}

export function fetchOrgEmailSettings(organizationId) {
  return apiFetch(orgEmailSettingsUrl(organizationId))
}

export function postOrgEmailForwarding(organizationId, displaySupportEmail) {
  return apiFetch(`${orgEmailSettingsUrl(organizationId)}/forwarding`, {
    method: 'POST',
    body: JSON.stringify({ displaySupportEmail: displaySupportEmail || null }),
  })
}

export function postOrgEmailForwardingConfirm(organizationId) {
  return apiFetch(`${orgEmailSettingsUrl(organizationId)}/forwarding/confirm`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function postOrgEmailSendingDomain(organizationId, subdomain) {
  return apiFetch(`${orgEmailSettingsUrl(organizationId)}/sending-domain`, {
    method: 'POST',
    body: JSON.stringify({ subdomain }),
  })
}

/** Full DNS mode (send + receive on customer subdomain). */
export function postOrgEmailDomainDns(organizationId, subdomain) {
  return apiFetch(`${orgEmailSettingsUrl(organizationId)}/domain`, {
    method: 'POST',
    body: JSON.stringify({ subdomain, setupMode: 'dns' }),
  })
}

export function postOrgEmailDomainVerify(organizationId) {
  return apiFetch(`${orgEmailSettingsUrl(organizationId)}/domain/verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function patchOrgEmailAddresses(organizationId, body) {
  return apiFetch(`${orgEmailSettingsUrl(organizationId)}/addresses`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteOrgEmailSettings(organizationId) {
  return apiFetch(orgEmailSettingsUrl(organizationId), { method: 'DELETE' })
}
