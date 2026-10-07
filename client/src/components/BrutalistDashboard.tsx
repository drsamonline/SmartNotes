import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";

interface BrutalistDashboardProps {
  children: React.ReactNode;
  currentCategory?: string;
  categoryCounts?: Record<string, number>;
}

export function BrutalistDashboard({ children, currentCategory, categoryCounts = {} }: BrutalistDashboardProps) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sequence, setSequence] = useState("");

  const categories = [
    { name: "Tasks", icon: "✓", color: "bg-blue-600" },
    { name: "Deadlines", icon: "⏰", color: "bg-red-600" },
    { name: "Schedule", icon: "📅", color: "bg-green-600" },
    { name: "Thoughts", icon: "💭", color: "bg-purple-600" },
    { name: "Learning", icon: "📚", color: "bg-yellow-600" },
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "?" && !isTyping) {
        event.preventDefault();
        setShowShortcuts((current) => !current);
        return;
      }
      if (isTyping) return;
      const key = event.key.toLowerCase();
      if (sequence === "g") {
        setSequence("");
        if (key === "h") navigate("/");
        if (key === "s") navigate("/settings");
        if (key === "f") navigate("/search");
        return;
      }
      if (key === "g") {
        setSequence("g");
        window.setTimeout(() => setSequence(""), 1200);
      } else if (key === "n") {
        navigate("/");
        window.setTimeout(() => document.getElementById("note-composer")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, sequence]);

  if (!user) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-7xl font-bold text-white mb-8">SMARTNOTE</h1>
          <div className="w-full h-1 bg-red-600 my-8"></div>
          <p className="text-white text-2xl mb-8">SCHEDULER</p>
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            className="bg-red-600 hover:bg-red-700 text-white font-bold text-lg px-8 py-4"
          >
            ENTER
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-0 bg-black text-white">
      {/* Sidebar */}
      <div className="w-16 md:w-64 shrink-0 border-r-2 border-white p-2 md:p-8 flex flex-col">
        <div className="mb-6 md:mb-12">
          <div className="hidden md:flex items-center gap-3 mb-3">
            <span className="w-3 h-3 bg-red-600 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] tracking-[0.3em] text-gray-500">LIVE SYSTEM</span>
          </div>
          <h1 className="hidden md:block text-4xl font-bold mb-2 tracking-tight">SMARTNOTE</h1>
          <div className="hidden md:block h-1 bg-red-600 w-full mb-4"></div>
          <p className="hidden md:block text-sm font-bold tracking-[0.35em] text-gray-300">SCHEDULER / 01</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 md:space-y-4">
          <button
            onClick={() => navigate("/")}
            aria-label="All notes"
            className={`focus-brutal w-full px-2 md:px-4 py-3 font-bold text-lg transition-all duration-200 flex items-center justify-center md:justify-start ${
              !currentCategory
                ? "bg-red-600 text-white"
                : "hover:bg-gray-900 text-white"
            }`}
          >
            <span className="md:hidden text-2xl" aria-hidden="true">☷</span>
            <span className="hidden md:inline">ALL NOTES</span>
          </button>

          <button
            onClick={() => navigate("/search")}
            aria-label="Search"
            className="focus-brutal w-full px-2 md:px-4 py-3 font-bold text-lg transition-all duration-200 flex items-center justify-center md:justify-start hover:bg-gray-900 text-white"
          >
            <span className="md:hidden text-2xl" aria-hidden="true">⌕</span>
            <span className="hidden md:inline">SEARCH</span>
          </button>

          <button
            onClick={() => navigate("/notifications")}
            aria-label="Notification history"
            className={`focus-brutal w-full px-2 md:px-4 py-3 font-bold text-lg transition-all duration-200 flex items-center justify-center md:justify-start ${
              location === "/notifications" ? "bg-red-600 text-white" : "hover:bg-gray-900 text-white"
            }`}
          >
            <span className="md:hidden text-2xl" aria-hidden="true">◷</span>
            <span className="hidden md:inline">ALERTS</span>
          </button>

          <button
            onClick={() => navigate("/settings")}
            aria-label="Settings"
            className={`focus-brutal w-full px-2 md:px-4 py-3 font-bold text-lg transition-all duration-200 flex items-center justify-center md:justify-start ${location === "/settings" ? "bg-red-600 text-white" : "hover:bg-gray-900 text-white"}`}
          >
            <Settings className="md:hidden w-6 h-6" aria-hidden="true" />
            <span className="hidden md:inline">SETTINGS</span>
          </button>

          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => navigate(`/category/${cat.name}`)}
            aria-label={cat.name}
              className={`focus-brutal w-full px-2 md:px-4 py-3 font-bold text-lg transition-all duration-200 flex items-center justify-center md:justify-between gap-3 ${
                currentCategory === cat.name
                  ? "bg-red-600 text-white"
                  : "hover:bg-gray-900 text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                  <span className={`${cat.color} w-8 h-8 flex items-center justify-center text-white font-bold shadow-[3px_3px_0_rgba(255,255,255,0.35)]`}>
                  {cat.icon}
                </span>
                <span className="hidden md:inline">{cat.name.toUpperCase()}</span>
              </div>
              <span className="hidden md:inline text-sm font-bold text-gray-300">
                {categoryCounts[cat.name] || 0}
              </span>
            </button>
          ))}
        </nav>

        {/* Divider */}
        <div className="hidden md:block h-0.5 bg-red-600 w-full my-8"></div>

        {/* User Info */}
        <div className="hidden md:block space-y-4">
          <div className="border-2 border-white p-4">
            <p className="text-xs font-bold tracking-widest text-gray-400">USER</p>
            <p className="text-lg font-bold truncate">{user.name || user.email}</p>
          </div>
          <div className="border-l-2 border-red-600 pl-3 py-1">
            <p className="text-[10px] font-bold tracking-[0.25em] text-gray-500">AUTHOR</p>
            <p className="text-sm font-bold text-white">DR SOHIL MOMIN</p>
            <p className="text-[10px] tracking-widest text-gray-600">SMARTNOTE SCHEDULER</p>
          </div>
          <Button
            onClick={() => logout()}
            variant="outline"
            className="w-full border-2 border-white text-white hover:bg-red-600 hover:border-red-600 font-bold"
          >
            <LogOut className="w-4 h-4 mr-2" />
            LOGOUT
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-w-0 flex-1 overflow-auto">
        {children}
      </div>

      {showShortcuts && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="w-full max-w-lg border-2 border-white bg-black p-6 md:p-8 shadow-[8px_8px_0_#dc2626]">
            <div className="flex items-center justify-between mb-6">
              <div><p className="text-red-500 text-xs font-bold tracking-[0.3em]">COMMANDS / 03</p><h2 className="text-3xl font-bold">SHORTCUTS</h2></div>
              <Keyboard className="text-red-600" />
            </div>
            <div className="space-y-3 text-sm">
              {[ ["N", "Focus new note"], ["⌘ / CTRL + ENTER", "Create note"], ["?", "Toggle this panel"], ["G H", "All notes"], ["G S", "Settings"], ["G F", "Search"] ].map(([key, label]) => <div key={key} className="flex items-center justify-between border-b border-white/20 pb-2"><span className="text-gray-400">{label}</span><kbd className="bg-white text-black px-2 py-1 font-bold">{key}</kbd></div>)}
            </div>
            <button onClick={() => setShowShortcuts(false)} className="focus-brutal mt-8 border-2 border-white px-5 py-2 font-bold hover:bg-white hover:text-black">CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
