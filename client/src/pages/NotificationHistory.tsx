import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BrutalistDashboard } from "@/components/BrutalistDashboard";
import { Loader2 } from "lucide-react";

const statusStyles = {
  sent: "bg-green-600 text-white",
  failed: "bg-red-600 text-white",
  skipped: "bg-gray-700 text-gray-200",
} as const;

export default function NotificationHistory() {
  const { user } = useAuth();
  const { data: logs = [], isLoading } = trpc.notes.notificationHistory.useQuery();

  if (!user) return null;

  return (
    <BrutalistDashboard>
      <div className="min-h-screen bg-black text-white">
        <header className="border-b-2 border-white p-8">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">ALERT HISTORY</h1>
          <div className="h-1 bg-red-600 w-24 mb-4" />
          <p className="text-gray-400 text-lg">Recent reminder delivery attempts</p>
        </header>

        <main className="p-8">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="border-2 border-white p-12 text-center">
              <p className="text-gray-400 text-lg font-bold">NO ALERTS YET</p>
              <p className="text-gray-500">Reminder delivery attempts will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <article key={log.id} className="border-2 border-white p-5 bg-gray-950">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-xl font-bold">{log.title}</h2>
                      <p className="text-xs tracking-widest text-gray-500 mt-1">
                        {log.channel.toUpperCase()} · {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`${statusStyles[log.status]} px-3 py-1 text-xs font-bold`}>
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-gray-300">{log.content}</p>
                  {log.error && <p className="text-red-400 text-sm mt-3">{log.error}</p>}
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    </BrutalistDashboard>
  );
}
