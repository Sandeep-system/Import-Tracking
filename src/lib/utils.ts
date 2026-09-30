import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWeight(val?: number | null, unit: string = "KG"): string {
  if (val === null || val === undefined || isNaN(val)) return `0 ${unit}`;
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(val)} ${unit}`;
}

export function formatCurrency(val?: number | null, currency: string = "USD"): string {
  if (val === null || val === undefined || isNaN(val)) return `$0`;
  const curr = currency.toUpperCase();
  const symbol = curr === "USD" ? "$" : curr === "EUR" ? "€" : curr === "INR" ? "₹" : curr === "YEN" || curr === "JPY" ? "¥" : `${curr} `;
  return `${symbol}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(val)}`;
}

export function formatDate(val?: string | null): string {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return val;
  }
}

export function getStatusBadgeClass(status?: string): string {
  switch (status?.toLowerCase()) {
    case "open":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "partially received":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "partially resolved":
      return "bg-orange-50 text-orange-700 border-orange-200 font-medium";
    case "received":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "over received":
      return "bg-purple-50 text-purple-700 border-purple-200 font-semibold";
    case "closed":
      return "bg-slate-100 text-slate-700 border-slate-300";
    case "closed — fully received":
      return "bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold";
    case "closed — short received":
      return "bg-teal-50 text-teal-800 border-teal-300 font-semibold";
    case "closed — balance carried forward":
      return "bg-indigo-50 text-indigo-800 border-indigo-300 font-semibold";
    case "closed — balance resolved":
      return "bg-cyan-50 text-cyan-800 border-cyan-300 font-semibold";
    case "cancelled":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "available":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "allocated":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}
