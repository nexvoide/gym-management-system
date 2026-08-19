"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Print invoice" }: { label?: string }) {
  return <button className="btn btn-secondary no-print" onClick={() => window.print()}><Printer size={16} /> {label}</button>;
}
