import type { Role } from "../domain/enums";
import { PRIVILEGED_ROLES } from "../domain/enums";
import { forbidden } from "../lib/errors";
import { securityEvent } from "../lib/logger";

/**
 * Permission model.
 *
 * Roles are coarse; permissions are fine. Code asks for a *permission*, never for
 * a role — so widening what SUPPORT can do is one table edit, not a grep for
 * `role === "SUPPORT"` scattered through the app.
 *
 * Ownership (this producer, this order, this store) is NOT expressed here. That
 * is an attribute check done in the data layer against the row itself, because a
 * permission can never answer "is this *my* order".
 */

export type Permission =
  // catalogue + content
  | "catalog.read"
  | "catalog.write"
  | "content.moderate"
  // customer self-service
  | "self.profile.write"
  | "self.order.read"
  | "self.design.write"
  // production side
  | "producer.apply"
  | "producer.job.browse"
  | "producer.job.accept"
  | "producer.job.update"
  | "producer.payout.read"
  // creator economy
  | "creator.store.manage"
  | "creator.product.publish"
  // wholesale
  | "seller.wholesale.purchase"
  // jobs board
  | "jobs.post"
  | "jobs.apply"
  | "jobs.moderate"
  // staff
  | "admin.user.read"
  | "admin.user.write"
  | "admin.order.read"
  | "admin.order.write"
  | "admin.producer.verify"
  | "admin.recruiter.verify"
  | "admin.payment.read"
  | "admin.refund.issue"
  | "admin.payout.approve"
  | "admin.dispute.resolve"
  | "admin.campaign.manage"
  | "admin.copyright.review"
  | "admin.audit.read"
  | "admin.flag.write"
  | "admin.system.read"
  | "admin.role.grant"
  | "admin.impersonate";

const CUSTOMER_BASE: readonly Permission[] = [
  "catalog.read",
  "self.profile.write",
  "self.order.read",
  "self.design.write",
  "producer.apply",
  "jobs.apply",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CUSTOMER: CUSTOMER_BASE,
  PRODUCER: [
    ...CUSTOMER_BASE,
    "producer.job.browse",
    "producer.job.accept",
    "producer.job.update",
    "producer.payout.read",
  ],
  CREATOR: [...CUSTOMER_BASE, "creator.store.manage", "creator.product.publish"],
  SELLER: [...CUSTOMER_BASE, "seller.wholesale.purchase"],
  RECRUITER: [...CUSTOMER_BASE, "jobs.post"],
  MODERATOR: [
    "catalog.read",
    "content.moderate",
    "jobs.moderate",
    "admin.user.read",
    "admin.copyright.review",
    "admin.system.read",
  ],
  SUPPORT: [
    "catalog.read",
    "admin.user.read",
    "admin.order.read",
    "admin.order.write",
    "admin.system.read",
  ],
  FINANCE: [
    "catalog.read",
    "admin.order.read",
    "admin.payment.read",
    "admin.refund.issue",
    "admin.payout.approve",
    "admin.system.read",
  ],
  ADMIN: [
    "catalog.read",
    "catalog.write",
    "content.moderate",
    "jobs.moderate",
    "admin.user.read",
    "admin.user.write",
    "admin.order.read",
    "admin.order.write",
    "admin.producer.verify",
    "admin.recruiter.verify",
    "admin.payment.read",
    "admin.refund.issue",
    "admin.payout.approve",
    "admin.dispute.resolve",
    "admin.campaign.manage",
    "admin.copyright.review",
    "admin.audit.read",
    "admin.flag.write",
    "admin.system.read",
  ],
  // SUPER_ADMIN is deliberately the only holder of role granting and impersonation:
  // the two powers that can manufacture any other power.
  SUPER_ADMIN: [] as readonly Permission[],
};

const ALL_PERMISSIONS = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat()),
) as Permission[];

function permissionsForRole(role: Role): readonly Permission[] {
  if (role === "SUPER_ADMIN") return [...ALL_PERMISSIONS, "admin.role.grant", "admin.impersonate"];
  return ROLE_PERMISSIONS[role];
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of permissionsForRole(role)) set.add(p);
  return set;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function requirePermission(
  roles: readonly Role[],
  permission: Permission,
  context: { userId?: string; route?: string } = {},
): void {
  if (!hasPermission(roles, permission)) {
    securityEvent("authz.denied", { ...context, permission, roles: [...roles] });
    throw forbidden("realizar esta ação");
  }
}

export const isStaff = (roles: readonly Role[]): boolean =>
  roles.some((r) => PRIVILEGED_ROLES.includes(r));

/**
 * Actions that require a fresh MFA challenge even inside a valid session.
 * The step-up window is short precisely because these are the actions an
 * attacker with a stolen cookie would go for.
 */
export const STEP_UP_PERMISSIONS: readonly Permission[] = [
  "admin.refund.issue",
  "admin.payout.approve",
  "admin.role.grant",
  "admin.impersonate",
  "admin.user.write",
];

export const STEP_UP_WINDOW_MINUTES = 15;

export const requiresStepUp = (permission: Permission): boolean =>
  STEP_UP_PERMISSIONS.includes(permission);
