import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "WealthTrack AU 🇦🇺",
  description: "Australian FI/RE Personal Wealth Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
