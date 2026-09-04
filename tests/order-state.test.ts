import { describe, it, expect } from "vitest";
import {
  canTransition, assertTransition, allowedTransitions, trackerPosition,
  isTerminal, TRACKER_SPINE,
} from "@/server/domain/order-state";
import { ORDER_STATUSES, type OrderStatus } from "@/server/domain/enums";
import { AppError } from "@/server/lib/errors";

/**
 * The state machine is the authority on what an order may do. These tests are
 * mostly negative: they prove that the actors who must NOT be able to move an
 * order cannot, regardless of what a request body claims.
 */
describe("order state machine", () => {
  it("advances an order along the normal happy path", () => {
    const path: [OrderStatus, OrderStatus, Parameters<typeof canTransition>[0]["actor"]][] = [
      ["DRAFT", "QUOTED", "SYSTEM"],
      ["QUOTED", "CUSTOMER_APPROVED", "CUSTOMER"],
      ["CUSTOMER_APPROVED", "PAYMENT_PENDING", "SYSTEM"],
      ["PAYMENT_PENDING", "PAID", "PROVIDER_WEBHOOK"],
      ["PAID", "PRODUCER_PENDING", "SYSTEM"],
      ["PRODUCER_PENDING", "PRODUCER_ACCEPTED", "PRODUCER"],
      ["PRODUCER_ACCEPTED", "MATERIALS_PREPARATION", "PRODUCER"],
      ["MATERIALS_PREPARATION", "CUTTING", "PRODUCER"],
      ["CUTTING", "SEWING", "PRODUCER"],
      ["SEWING", "FINISHING", "PRODUCER"],
      ["FINISHING", "QUALITY_CONTROL", "PRODUCER"],
      ["QUALITY_CONTROL", "READY_TO_SHIP", "PRODUCER"],
      ["READY_TO_SHIP", "SHIPPED", "PRODUCER"],
      ["SHIPPED", "DELIVERED", "PROVIDER_WEBHOOK"],
      ["DELIVERED", "COMPLETED", "SYSTEM"],
    ];
    for (const [from, to, actor] of path) {
      expect(canTransition({ from, to, actor }), `${from} → ${to} as ${actor}`).toBe(true);
    }
  });

  describe("authorisation by actor", () => {
    it("does not let a customer declare their own order paid", () => {
      expect(canTransition({ from: "PAYMENT_PENDING", to: "PAID", actor: "CUSTOMER" })).toBe(false);
    });

    it("does not let a customer mark their own order shipped or delivered", () => {
      expect(canTransition({ from: "READY_TO_SHIP", to: "SHIPPED", actor: "CUSTOMER" })).toBe(false);
      expect(canTransition({ from: "SHIPPED", to: "DELIVERED", actor: "CUSTOMER" })).toBe(false);
    });

    it("does not let a producer refund an order", () => {
      expect(canTransition({ from: "PAID", to: "REFUNDED", actor: "PRODUCER" })).toBe(false);
      expect(canTransition({ from: "DISPUTED", to: "REFUNDED", actor: "PRODUCER" })).toBe(false);
    });

    it("does not let a producer skip straight from acceptance to shipped", () => {
      expect(canTransition({ from: "PRODUCER_ACCEPTED", to: "SHIPPED", actor: "PRODUCER" })).toBe(false);
    });

    it("does not let a producer resolve a dispute", () => {
      expect(canTransition({ from: "DISPUTED", to: "COMPLETED", actor: "PRODUCER" })).toBe(false);
    });

    it("lets only the provider webhook or an admin confirm payment", () => {
      expect(canTransition({ from: "PAYMENT_PENDING", to: "PAID", actor: "PROVIDER_WEBHOOK" })).toBe(true);
      expect(canTransition({ from: "PAYMENT_PENDING", to: "PAID", actor: "ADMIN" })).toBe(true);
      expect(canTransition({ from: "PAYMENT_PENDING", to: "PAID", actor: "SYSTEM" })).toBe(false);
      expect(canTransition({ from: "PAYMENT_PENDING", to: "PAID", actor: "PRODUCER" })).toBe(false);
    });
  });

  describe("terminal states", () => {
    it("treats REFUNDED as final for everyone", () => {
      for (const status of ORDER_STATUSES) {
        for (const actor of ["SYSTEM", "CUSTOMER", "PRODUCER", "ADMIN", "PROVIDER_WEBHOOK"] as const) {
          expect(
            canTransition({ from: "REFUNDED", to: status, actor }),
            `REFUNDED → ${status} as ${actor} must be refused`,
          ).toBe(false);
        }
      }
    });

    it("does not let a cancelled order restart production", () => {
      expect(canTransition({ from: "CANCELLED", to: "SEWING", actor: "PRODUCER" })).toBe(false);
      expect(canTransition({ from: "CANCELLED", to: "PAID", actor: "ADMIN" })).toBe(false);
      // The one legitimate move out of CANCELLED is refunding the money.
      expect(canTransition({ from: "CANCELLED", to: "REFUNDED", actor: "ADMIN" })).toBe(true);
    });

    it("reports terminality consistently", () => {
      expect(isTerminal("REFUNDED")).toBe(true);
      expect(isTerminal("CANCELLED")).toBe(true);
      expect(isTerminal("SEWING")).toBe(false);
    });
  });

  it("never treats a no-op as a valid transition", () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition({ from: status, to: status, actor: "ADMIN" })).toBe(false);
    }
  });

  it("throws a typed AppError, not a bare boolean, on an illegal move", () => {
    expect(() => assertTransition({ from: "DRAFT", to: "SHIPPED", actor: "CUSTOMER" })).toThrow(AppError);
    try {
      assertTransition({ from: "DRAFT", to: "SHIPPED", actor: "CUSTOMER" });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("ILLEGAL_STATE_TRANSITION");
      expect((e as AppError).action).toBeTruthy();
    }
  });

  it("returns a self-consistent set of allowed transitions", () => {
    for (const status of ORDER_STATUSES) {
      for (const actor of ["CUSTOMER", "PRODUCER", "ADMIN", "SYSTEM", "PROVIDER_WEBHOOK"] as const) {
        for (const to of allowedTransitions(status, actor)) {
          expect(canTransition({ from: status, to, actor })).toBe(true);
        }
      }
    }
  });

  it("keeps the tracker monotonic along the spine", () => {
    for (let i = 1; i < TRACKER_SPINE.length; i += 1) {
      expect(trackerPosition(TRACKER_SPINE[i]!)).toBeGreaterThan(trackerPosition(TRACKER_SPINE[i - 1]!));
    }
    // Interrupted states sit off the spine so the tracker never reorders.
    expect(trackerPosition("REQUIRES_CUSTOMER_ACTION")).toBe(-1);
    expect(trackerPosition("ON_HOLD")).toBe(-1);
  });
});
