import type { Status } from "@/lib/analyzer";
import { Check } from "lucide-react";

const map: Record<
  Status,
  { label: string; dot: string; ring: string; bg: string; fg: string }
> = {
  vegan: {
    label: "Vegan",
    dot: "bg-vegan",
    ring: "ring-vegan/30",
    bg: "bg-vegan-soft",
    fg: "text-vegan",
  },
  vegetarian: {
    label: "Vegetarian",
    dot: "bg-vegan",
    ring: "ring-vegan/30",
    bg: "bg-vegan-soft",
    fg: "text-vegan",
  },
  not_vegetarian: {
    label: "Not Vegetarian",
    dot: "bg-danger",
    ring: "ring-danger/30",
    bg: "bg-danger-soft",
    fg: "text-danger",
  },
  unknown: {
    label: "Unable to Confirm",
    dot: "bg-warn",
    ring: "ring-warn/30",
    bg: "bg-warn-soft",
    fg: "text-warn-foreground",
  },
};

export function StatusPill({ status, size = "md" }: { status: Status; size?: "sm" | "md" | "lg" }) {
  const m = map[status];
  const cls =
    size === "lg"
      ? "text-lg px-5 py-2.5"
      : size === "sm"
        ? "text-xs px-2.5 py-1"
        : "text-sm px-3.5 py-1.5";
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full font-medium ring-1",
        m.bg,
        m.fg,
        m.ring,
        cls,
      ].join(" ")}
    >
      <span className={["size-2 rounded-full", m.dot].join(" ")} aria-hidden />
      {m.label}
    </span>
  );
}

const veganMap: Record<
  Status,
  { label: string; dot: string; ring: string; bg: string; fg: string }
> = {
  vegan: map.vegan,
  vegetarian: {
    label: "Not vegan",
    dot: "bg-danger",
    ring: "ring-danger/30",
    bg: "bg-danger-soft",
    fg: "text-danger",
  },
  not_vegetarian: {
    label: "Not vegan",
    dot: "bg-danger",
    ring: "ring-danger/30",
    bg: "bg-danger-soft",
    fg: "text-danger",
  },
  unknown: {
    label: "Vegan status unknown",
    dot: "bg-warn",
    ring: "ring-warn/30",
    bg: "bg-warn-soft",
    fg: "text-warn-foreground",
  },
};

export function StatusHero({
  status,
  explanation,
}: {
  status: Status;
  explanation: string;
}) {
  const m = map[status];
  const vm = veganMap[status];
  return (
    <div className={["rounded-3xl p-6 shadow-soft ring-1", m.bg, m.ring].join(" ")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={["inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1", m.bg, m.fg, m.ring].join(" ")}>
          <span className={["size-2 rounded-full", m.dot].join(" ")} aria-hidden />
          {m.label}
          {(status === "vegetarian" || status === "vegan") ? (
            <Check className="size-3.5 stroke-[3]" aria-hidden />
          ) : null}
        </span>
        <span className={["inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1", vm.bg, vm.fg, vm.ring].join(" ")}>
          <span className={["size-2 rounded-full", vm.dot].join(" ")} aria-hidden />
          {vm.label}
        </span>
      </div>
      <p className="mt-4 font-display text-3xl leading-tight text-foreground">{explanation}</p>
    </div>
  );
}
