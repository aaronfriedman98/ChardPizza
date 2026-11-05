-- One payments row per Stripe payment, even if the success page and the webhook record it at the same moment.
create unique index if not exists payments_stripe_ref_uq on payments (provider_reference) where provider = 'stripe';
