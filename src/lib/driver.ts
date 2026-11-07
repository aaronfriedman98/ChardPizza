import { createHmac, timingSafeEqual } from "crypto";

// The driver link is /driver/<service id>/<signature>. The signature is made from a server secret,
// so nobody can guess a link, and each sale night gets its own. No settings to set up.
export function driverSig(serviceId: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  return createHmac("sha256", secret).update(`driver:${serviceId}`).digest("hex").slice(0, 20);
}

export function driverOk(serviceId: string, sig: string) {
  const want = Buffer.from(driverSig(serviceId));
  const got = Buffer.from(String(sig));
  return want.length === got.length && timingSafeEqual(want, got);
}

export function driverPath(serviceId: string) {
  return `/driver/${serviceId}/${driverSig(serviceId)}`;
}
