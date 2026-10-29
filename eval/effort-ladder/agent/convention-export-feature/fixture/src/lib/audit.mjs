export function record(audit, request, action) {
  audit.push({ tenant: request.tenant, actor: request.principal.id, action });
}
