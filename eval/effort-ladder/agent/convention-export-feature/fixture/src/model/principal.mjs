export function makePrincipal(id, tenant, permissions) {
  return { id, tenant, permissions: [...permissions] };
}
