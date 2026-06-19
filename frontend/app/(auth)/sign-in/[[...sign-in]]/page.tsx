import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">WealthTrack AU 🇦🇺</h1>
          <p className="mt-1 text-sm text-slate-400">Australian FI/RE Wealth Dashboard</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              card: "bg-slate-900 border border-slate-800 shadow-xl",
              headerTitle: "text-white",
              headerSubtitle: "text-slate-400",
              formFieldLabel: "text-slate-300",
              formFieldInput:
                "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500",
              formButtonPrimary:
                "bg-emerald-600 hover:bg-emerald-500 text-white",
              footerActionLink: "text-emerald-400 hover:text-emerald-300",
            },
          }}
        />
      </div>
    </div>
  );
}
