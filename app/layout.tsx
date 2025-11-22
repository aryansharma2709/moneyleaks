// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyLeaks",
  description: "Find where your money silently leaks every month.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        <div className="relative overflow-hidden">
          {/* subtle background gradient */}
          <div className="pointer-events-none fixed inset-0 opacity-50">
            <div className="absolute -top-40 -left-20 h-80 w-80 rounded-full bg-emerald-500 blur-3xl" />
            <div className="absolute top-40 -right-16 h-80 w-80 rounded-full bg-cyan-500 blur-3xl" />
          </div>

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <header className="mb-8 pb-5 border-b border-slate-800/70 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Money<span className="text-emerald-400">Leaks</span>
                </h1>
                <p className="text-slate-400 mt-1 text-sm sm:text-base max-w-xl">
                  Upload your bank / UPI / card statement and instantly see{" "}
                  <span className="text-emerald-300 font-semibold">where your money leaks</span>:
                  subscriptions, bank fees, food delivery and more.
                </p>
              </div>
              <div className="text-xs sm:text-sm text-slate-400 bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2">
                <p className="font-semibold text-slate-200">Privacy note</p>
                <p>
                  Data is processed only for this analysis session. You can use dummy data for demo.
                </p>
              </div>
            </header>

            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
