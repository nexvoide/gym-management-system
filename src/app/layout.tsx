import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Form — Gym Management", description: "A lean, modern operating system for gyms." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
