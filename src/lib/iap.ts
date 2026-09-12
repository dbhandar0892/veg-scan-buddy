// Apple In-App Purchase bridge.
//
// Purchases only work inside the native iOS shell (Capacitor). On the web the
// helpers below report "unavailable" so the UI can explain that instead of
// showing a dead button.
//
// Native side (done once, locally, in the checked-out repo):
//   1. npm i @revenuecat/purchases-capacitor
//   2. npx cap sync ios
//   3. Create the auto-renewing subscription in App Store Connect
//      (product id: PRODUCT_ID below) and add it to a RevenueCat offering
//      with entitlement id ENTITLEMENT_ID.
//   4. Set VITE_REVENUECAT_IOS_KEY to the RevenueCat iOS public SDK key.

import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_ID = "com.vegseal.app.pro.monthly";
export const ENTITLEMENT_ID = "pro";

const PLUGIN = "@revenuecat/purchases-capacitor";

type PurchasesModule = {
  Purchases: {
    configure(opts: { apiKey: string; appUserID?: string | null }): Promise<void>;
    logIn(opts: { appUserID: string }): Promise<unknown>;
    getOfferings(): Promise<{ current?: { availablePackages?: unknown[] } | null }>;
    purchasePackage(opts: { aPackage: unknown }): Promise<{ customerInfo: CustomerInfo }>;
    restorePurchases(): Promise<{ customerInfo: CustomerInfo }>;
    getCustomerInfo(): Promise<{ customerInfo: CustomerInfo }>;
  };
};

type CustomerInfo = { entitlements: { active: Record<string, unknown> } };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

let modulePromise: Promise<PurchasesModule | null> | null = null;
let configured = false;

async function getPurchases(): Promise<PurchasesModule["Purchases"] | null> {
  if (!isNativeApp()) return null;
  const apiKey = import.meta.env["VITE_REVENUECAT_IOS_KEY"] as string | undefined;
  if (!apiKey) return null;

  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ PLUGIN).then(
      (m) => m as PurchasesModule,
      () => null,
    );
  }
  const mod = await modulePromise;
  if (!mod) return null;

  if (!configured) {
    const { data } = await supabase.auth.getUser();
    await mod.Purchases.configure({ apiKey, appUserID: data.user?.id ?? null });
    configured = true;
  }
  return mod.Purchases;
}

function isActive(info: CustomerInfo): boolean {
  return Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]);
}

async function markSubscribed(active: boolean) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("profiles").update({ is_subscribed: active }).eq("id", data.user.id);
}

export type PurchaseResult =
  | { status: "unavailable" }
  | { status: "active" }
  | { status: "cancelled" }
  | { status: "none" }
  | { status: "error"; message: string };

export async function purchaseSubscription(): Promise<PurchaseResult> {
  const Purchases = await getPurchases();
  if (!Purchases) return { status: "unavailable" };
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) return { status: "error", message: "No subscription available right now." };
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    if (isActive(customerInfo)) {
      await markSubscribed(true);
      return { status: "active" };
    }
    return { status: "none" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return { status: "cancelled" };
    return { status: "error", message };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  const Purchases = await getPurchases();
  if (!Purchases) return { status: "unavailable" };
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const active = isActive(customerInfo);
    await markSubscribed(active);
    return active ? { status: "active" } : { status: "none" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Sync App Store subscription state into the profile on app open. */
export async function syncSubscriptionStatus(): Promise<void> {
  const Purchases = await getPurchases();
  if (!Purchases) return;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    await markSubscribed(isActive(customerInfo));
  } catch {
    /* offline or not configured yet — leave the stored state alone */
  }
}
