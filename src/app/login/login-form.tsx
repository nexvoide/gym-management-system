"use client";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { login } from "./actions";
import Link from "next/link";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return <form action={action}>
    {state.error && <div className="error" role="alert">{state.error}</div>}
    <div className="field"><label htmlFor="email">Email address</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
    <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div>
    <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "Signing in…" : <>Sign in <ArrowRight size={16}/></>}</button>
    <p className="demo-note"><Link className="link" href="/forgot-password">Forgot password?</Link></p>
    <p className="demo-note"><a className="link" href="/register">Create a new gym account</a></p>
  </form>;
}
