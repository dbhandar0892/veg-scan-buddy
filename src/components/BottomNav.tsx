import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ScanLine, History, Heart, Settings } from "lucide-react";

type NavItem = {
  to: "/" | "/scan" | "/history" | "/favorites" | "/settings";
  label: string;
  icon: typeof Home;
  primary?: boolean;
};

const items: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/scan", label: "Scan", icon: ScanLine, primary: true },
  { to: "/history", label: "History", icon: History },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/welcome" || pathname === "/auth") return null;
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/85 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {items.map(({ to, label, icon: Icon, primary }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className="group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5"
                aria-label={label}
              >
                <span
                  className={[
                    "flex items-center justify-center transition-all",
                    primary
                      ? "size-12 -mt-6 rounded-full bg-primary text-primary-foreground shadow-card"
                      : active
                        ? "size-9 rounded-xl bg-accent text-accent-foreground"
                        : "size-9 rounded-xl text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className={primary ? "size-6" : "size-5"} strokeWidth={2.25} />
                </span>
                <span
                  className={[
                    "text-[10px] font-medium tracking-wide",
                    active ? "text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
