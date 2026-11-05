import type Stripe from "stripe";
import { cancelExpiredSession, settleCheckoutSession, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Stripe → us. Confirms card orders even when the customer never returns to the site. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (e) {
    console.error("stripe webhook signature failed", e);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await settleCheckoutSession((event.data.object as Stripe.Checkout.Session).id);
        break;
      case "checkout.session.expired":
        await cancelExpiredSession(event.data.object as Stripe.Checkout.Session);
        break;
    }
  } catch (e) {
    console.error("stripe webhook handling failed", event.type, e);
    return new Response("Handler error", { status: 500 }); // Stripe retries
  }
  return new Response("ok");
}
