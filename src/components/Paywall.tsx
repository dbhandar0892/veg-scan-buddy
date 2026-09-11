import { Link } from "@tanstack/react-router";
import { ShieldCheck, Sparkles } from "lucide-react";
import { PRICE_MONTHLY, TRIAL_DAYS } from "@/lib/access";

const PERKS = [
  "Unlimited barcode and ingredient-label scans",
  "Manufacturer and web research on unclear ingredients",
  "Scan history and favorites synced to your account",
];

export function Paywall({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="px-5 pt-6">
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent">
          {signedIn ? (
            <ShieldCheck className="size-7 text-accent-foreground" />
          ) : (
            <Sparkles className="size-7 text-accent-foreground" />
          )}
        </div>

        <h2 className="mt-4 font-display text-2xl text-foreground">
          {signedIn ? "Your free trial has ended" : `Start your ${TRIAL_DAYS}-day free trial`}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {signedIn
            ? `Keep scanning with VegSeal for ${PRICE_MONTHLY} a month. Cancel any time.`
            : `Create a free account and get ${TRIAL_DAYS} days of unlimited scanning. After that it's ${PRICE_MONTHLY} a month.`}
        </p>

        <ul className="mt-5 space-y-2 text-left">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              {p}
            </li>
          ))}
        </ul>

        {signedIn ? (
          <>
            <button
              type="button"
              disabled
              className="mt-6 w-full rounded-2xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-card disabled:opacity-60"
            >
              Subscribe for {PRICE_MONTHLY}/month
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Subscriptions open shortly — you'll be able to pay right here.
            </p>
          </>
        ) : (
          <Link
            to="/auth"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-card"
          >
            Start free trial
          </Link>
        )}
      </div>
    </div>
  );
}

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="px-5 pt-4">
      <div className="rounded-2xl border border-border bg-accent/60 px-4 py-2.5 text-center text-xs font-medium text-accent-foreground">
        {daysLeft === 1
          ? "Last day of your free trial"
          : `${daysLeft} days left in your free trial`}
      </div>
    </div>
  );
}
