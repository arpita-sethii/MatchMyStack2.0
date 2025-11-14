import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Github, Sparkles, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext"; // ← ADD THIS

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-extrabold text-lg">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="h-4 w-4" />
      </span>
      <span>Match My Stack</span>
    </Link>
  );
}

const nav = [
  { to: "/", label: "Home" },
  { to: "/match", label: "Discover" },
  { to: "/add-project", label: "Add Project" },
  { to: "/projects", label: "Projects" },
  { to: "/chat", label: "Chat", showBadge: true }, // ← Mark this for badge
];

export default function AppShell() {
  const location = useLocation();
  const { user, isLoading, logout } = useAuth();
  const { unreadCount } = useChat(); // ← ADD THIS to get unread count

  const initials = (() => {
    if (!user) return "U";
    const name = user.name || user.email || "";
    return (name.trim().split(" ").map(s => s[0]).slice(0,2).join("") || "U").toUpperCase();
  })();

  // Banner state for login success
  const [showLoginBanner, setShowLoginBanner] = useState(false);
  const [loginBannerName, setLoginBannerName] = useState<string | null>(null);

  useEffect(() => {
    const onLogin = (e: Event) => {
      const ce = e as CustomEvent;
      const u = ce?.detail;
      setLoginBannerName(u?.name || u?.email || "there");
      setShowLoginBanner(true);

      // auto dismiss after 4 seconds
      setTimeout(() => setShowLoginBanner(false), 4000);
    };

    window.addEventListener("user-login", onLogin as EventListener);

    return () => {
      window.removeEventListener("user-login", onLogin as EventListener);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-background">
      {/* Header with high z-index */}
      <header className="sticky top-0 z-[99999] w-full backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          
          {/* Navigation with badge support */}
          <nav className="hidden md:flex items-center gap-6">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "relative text-sm font-medium text-muted-foreground hover:text-foreground transition-colors",
                    isActive && "text-foreground"
                  )
                }
              >
                {item.label}
                
                {/* ← ADD UNREAD BADGE for Chat */}
                {item.showBadge && unreadCount > 0 && (
                  <span className="absolute -top-2 -right-3 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Auth state */}
            {isLoading ? (
              <div className="px-3 py-1 text-sm text-muted-foreground">Loading…</div>
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-gray-200 w-8 h-8 flex items-center justify-center text-sm">
                    {initials}
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{user.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => logout()}>
                  Log out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild>
                  <Link to="/auth">Login / Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Optional inline banner shown after successful login */}
      {showLoginBanner && (
        <div className="bg-emerald-50 border-b border-emerald-100 py-3">
          <div className="container flex items-center justify-between text-sm">
            <div className="text-emerald-800">
              Welcome back{loginBannerName ? `, ${loginBannerName}` : ""}! You are signed in.
            </div>
            <div>
              <button
                onClick={() => setShowLoginBanner(false)}
                className="text-emerald-700 underline text-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content with padding */}
      <main className="container pt-20 py-12">
        <Outlet />
      </main>

      <footer className="border-t py-10 mt-10">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Match My Stack. Built for hackers, makers, and dreamers.</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/contact" className="hover:text-foreground flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
