// Margaret connects PayPal once (Vault v3), and her later bills use the saved PayPal with no PayPal page.
// Same rules as src/lib/paypal.ts, whose SDK client and token this shares: sandbox only, every POST carries a
// PayPal-Request-Id the caller stored before calling, and nothing personal is returned or logged. A payment token
// answer carries her PayPal email and name; only the token id and PayPal's customer id leave this file.
//
// Measured 9 Nov: a setup token is 201 PAYER_ACTION_REQUIRED with an approve link on sandbox.paypal.com/agreements;
// a payment token from a setup token nobody approved is 422 PAYER_ACTION_REQUIRED; an order with a vault id PayPal
// doesn't know is 403 PERMISSION_DENIED.

import {
  CheckoutPaymentIntent,
  ExperienceContextShippingPreference,
  OrdersController,
  PaypalPaymentTokenCustomerType,
  PaypalPaymentTokenUsageType,
  UsagePattern,
  VaultController,
  VaultTokenRequestType,
} from "@paypal/paypal-server-sdk";
import { toAmount } from "@/lib/money";
import { call, PayPalError, requireRequestId, sdk } from "@/lib/paypal";

/** Step 1 of connecting: a setup token Margaret approves once on PayPal's page. */
export async function createVaultSetupToken(input: {
  requestId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ setupTokenId: string; customerId?: string; status: string; approveUrl: string; debugId?: string }> {
  requireRequestId(input.requestId);
  const { result, debugId } = await call(() =>
    new VaultController(sdk()).createSetupToken({
      paypalRequestId: input.requestId,
      body: {
        paymentSource: {
          paypal: {
            description: "Second Look pays the bills you confirm, from your PayPal account",
            usagePattern: UsagePattern.Immediate,
            usageType: PaypalPaymentTokenUsageType.Merchant,
            customerType: PaypalPaymentTokenCustomerType.Consumer,
            permitMultiplePaymentTokens: false,
            experienceContext: {
              brandName: "Second Look",
              locale: "en-US",
              shippingPreference: ExperienceContextShippingPreference.NoShipping,
              returnUrl: input.returnUrl,
              cancelUrl: input.cancelUrl,
            },
          },
        },
      },
    }),
  );
  const approveUrl = result.links?.find((l) => l.rel === "approve")?.href;
  if (!result.id || !approveUrl) throw new PayPalError(201, "NO_APPROVAL_LINK", debugId);
  return { setupTokenId: result.id, customerId: result.customer?.id, status: String(result.status), approveUrl, debugId };
}

/** Step 2, after she approved: the saved PayPal (a payment token) that later orders name as their vault_id. */
export async function createVaultPaymentToken(input: {
  requestId: string;
  setupTokenId: string;
}): Promise<{ vaultId: string; customerId?: string; debugId?: string }> {
  requireRequestId(input.requestId);
  const { result, debugId } = await call(() =>
    new VaultController(sdk()).createPaymentToken({
      paypalRequestId: input.requestId,
      body: { paymentSource: { token: { id: input.setupTokenId, type: VaultTokenRequestType.SetupToken } } },
    }),
  );
  if (!result.id) throw new PayPalError(201, "NO_PAYMENT_TOKEN", debugId);
  return { vaultId: result.id, customerId: result.customer?.id, debugId };
}

export interface VaultedOrder {
  orderId: string;
  status: string;
  /** The hold, when PayPal placed it at create (no buyer step). */
  authorization?: { authorizationId: string; status: string; expiresAt?: string };
  /** When PayPal wants Margaret after all: where to send her. */
  approveUrl?: string;
  debugId?: string;
}

/**
 * An AUTHORIZE order paid from Margaret's saved PayPal. Expected to come back with the hold already placed, as card
 * orders do (COMPLETED, authorization CREATED); the caller handles APPROVED (authorize it) and PAYER_ACTION_REQUIRED
 * (send her to PayPal) too.
 */
export async function createVaultedAuthorizeOrder(input: {
  requestId: string;
  vaultId: string;
  amountCents: number;
  description: string;
  customId: string;
}): Promise<VaultedOrder> {
  requireRequestId(input.requestId);
  const { result, debugId } = await call(() =>
    new OrdersController(sdk()).createOrder({
      paypalRequestId: input.requestId,
      prefer: "return=representation",
      body: {
        intent: CheckoutPaymentIntent.Authorize,
        purchaseUnits: [
          {
            referenceId: input.customId,
            customId: input.customId,
            description: input.description.slice(0, 127),
            amount: { currencyCode: "USD", value: toAmount(input.amountCents) },
          },
        ],
        paymentSource: { paypal: { vaultId: input.vaultId } },
      },
    }),
  );
  if (!result.id) throw new PayPalError(201, "NO_ORDER", debugId);
  const hold = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  const approveUrl = result.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return {
    orderId: result.id,
    status: String(result.status),
    authorization: hold?.id ? { authorizationId: hold.id, status: String(hold.status), expiresAt: hold.expirationTime } : undefined,
    approveUrl,
    debugId,
  };
}
