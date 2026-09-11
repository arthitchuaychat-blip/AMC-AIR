// Sensitive actions are separate from editable menus. Keep in sync with the
// database action guards; hiding a button is not an authorization boundary.
export const isManagement = (role) => role === "exec" || role === "admin";
export const canManagePermissions = (role) => role === "exec";
export const canApprovePayroll = isManagement;
export const canSetPayRates = isManagement;
export const canPay = (role) => isManagement(role) || role === "finance";
export const canViewAllTeams = (role) => isManagement(role) || role === "lead_tech";
export const canManageHr = (role) => isManagement(role) || role === "hr";
export const canApproveOwnRequest = isManagement;

// Permission settings may narrow a role or enable another business menu, but
// must not silently restore HR's old sales inheritance or employee access to HR.
export const HR_MODULES = new Set(["teamchat", "tasks", "attendance", "handbook", "hr", "expenses", "paycenter"]);
export function roleCeiling(role, module) {
  if (module === "permissions") return canManagePermissions(role) ? "edit" : "none";
  if (isManagement(role)) return "edit";
  if (role === "hr" && !HR_MODULES.has(module)) return "none";
  if (module === "hr" && role !== "hr") return "none";
  return "edit";
}
