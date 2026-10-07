import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Loader2 } from "lucide-react";
import { loadPreferences } from "@/lib/preferences";

const Home = lazy(() => import("./pages/Home"));
const CategoryView = lazy(() => import("./pages/CategoryView"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const NotificationHistory = lazy(() => import("@/pages/NotificationHistory"));
const Settings = lazy(() => import("@/pages/Settings"));

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-red-600">
          <Loader2 className="w-8 h-8 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/category/:category" component={CategoryView} />
        <Route path="/search" component={SearchPage} />
        <Route path="/notifications" component={NotificationHistory} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme={loadPreferences().theme}
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
