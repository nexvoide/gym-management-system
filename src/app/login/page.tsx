import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ confirmed?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const confirmationRequired = (await searchParams).confirmed === "0";
  return <main className="auth-page">
    <section className="auth-story"><div className="brand"><span className="brand-mark">F</span><span>Form</span></div><div className="story-copy"><div className="story-kicker">Built for the everyday</div><h1>Run your gym.<br/>Without the noise.</h1><p>Members, memberships, attendance and money—connected in one calm, dependable workspace.</p></div><small style={{color:"var(--text-secondary)"}}>A universal operating system for modern gyms.</small></section>
    <section className="auth-panel"><div className="auth-card"><div className="eyebrow">Welcome back</div><h2>Sign in to Form</h2><p className="muted">Use your staff account to continue.</p>{confirmationRequired&&<div className="success" role="status">Your account was created. Confirm your email address before signing in.</div>}<LoginForm/></div></section>
  </main>;
}
