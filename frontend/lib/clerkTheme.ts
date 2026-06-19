/**
 * Returns a Clerk appearance object tuned for the active colour scheme.
 * Pass `isDark` based on whether `document.documentElement.classList.contains("dark")`.
 */
export function clerkAppearance(isDark: boolean) {
  const v = isDark
    ? {
        colorBackground:       "#0f172a", // slate-950
        colorInputBackground:  "#1e293b", // slate-800
        colorText:             "#f1f5f9", // slate-100
        colorTextSecondary:    "#94a3b8", // slate-400
        colorInputText:        "#f1f5f9",
        colorPrimary:          "#059669", // emerald-600
        colorDanger:           "#f87171",
        borderRadius:          "0.5rem",
      }
    : {
        colorBackground:       "#ffffff",
        colorInputBackground:  "#f8fafc", // slate-50
        colorText:             "#0f172a", // slate-900
        colorTextSecondary:    "#475569", // slate-500
        colorInputText:        "#0f172a",
        colorPrimary:          "#059669",
        colorDanger:           "#dc2626",
        borderRadius:          "0.5rem",
      };

  const sharedInput = isDark
    ? "border border-slate-600 bg-slate-800 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
    : "border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none";

  const otpInput = isDark
    ? "w-11 h-14 text-center text-2xl font-extrabold rounded-lg transition-all shadow-sm " +
      "border-2 border-slate-600 bg-slate-800 text-slate-100 " +
      "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none"
    : "w-11 h-14 text-center text-2xl font-extrabold rounded-lg transition-all shadow-sm " +
      "border-2 border-slate-300 bg-white text-slate-900 " +
      "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none";

  return {
    variables: v,
    elements: {
      card: isDark
        ? "bg-slate-900 border border-slate-700 shadow-2xl"
        : "bg-white border border-slate-200 shadow-xl",
      headerTitle: isDark ? "text-slate-100" : "text-slate-900",
      headerSubtitle: isDark ? "text-slate-400" : "text-slate-600",
      formFieldLabel: isDark
        ? "text-slate-300 font-medium text-sm"
        : "text-slate-700 font-medium text-sm",
      formFieldInput: sharedInput,
      formButtonPrimary: "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors",
      footerActionLink: isDark
        ? "text-emerald-400 hover:text-emerald-300"
        : "text-emerald-600 hover:text-emerald-500",
      formFieldAction: isDark
        ? "text-emerald-400 hover:text-emerald-300"
        : "text-emerald-600 hover:text-emerald-500",
      identityPreviewText: isDark ? "text-slate-100" : "text-slate-900",
      identityPreviewEditButtonIcon: isDark ? "text-emerald-400" : "text-emerald-600",
      // OTP / 2FA boxes
      otpCodeFieldInputs: "flex gap-2 justify-center my-4",
      otpCodeFieldInput: otpInput,
      // 2FA-specific headings and description
      formHeaderTitle: isDark ? "text-slate-100 font-semibold" : "text-slate-900 font-semibold",
      formHeaderSubtitle: isDark ? "text-slate-400" : "text-slate-500",
      // Alert / error text inside the card
      formFieldErrorText: isDark ? "text-red-400 text-xs mt-1" : "text-red-600 text-xs mt-1",
      alertText: isDark ? "text-red-400" : "text-red-600",
    },
  };
}
