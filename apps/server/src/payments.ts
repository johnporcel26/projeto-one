import type { PurchaseRecord } from "./auth-repository.js";

export interface PaymentProvider {
  readonly id: string;
  createCheckout(purchase: PurchaseRecord): { checkoutUrl: string | null };
  verifyPayment(
    providerPaymentId: string,
  ): Promise<"PAID" | "PENDING" | "FAILED">;
  handleWebhook(
    _payload: unknown,
    _signature: string | undefined,
  ): Promise<void>;
}

/** Development-only simulator. It is never instantiated in production. */
export class DevPaymentProvider implements PaymentProvider {
  readonly id = "dev";
  createCheckout(purchase: PurchaseRecord): { checkoutUrl: string | null } {
    return { checkoutUrl: `dev://payment/${purchase.providerPaymentId}` };
  }
  async verifyPayment(): Promise<"PENDING"> {
    return "PENDING";
  }
  async handleWebhook(): Promise<void> {
    throw new Error(
      "Dev payments are approved only by the authenticated development route.",
    );
  }
}

export class DisabledPaymentProvider implements PaymentProvider {
  readonly id = "disabled";
  createCheckout(): { checkoutUrl: null } {
    return { checkoutUrl: null };
  }
  async verifyPayment(): Promise<"FAILED"> {
    return "FAILED";
  }
  async handleWebhook(): Promise<void> {
    throw new Error(
      "A production payment provider must verify signed webhooks.",
    );
  }
}

export const paymentProvider: PaymentProvider =
  process.env.NODE_ENV === "production"
    ? new DisabledPaymentProvider()
    : new DevPaymentProvider();
