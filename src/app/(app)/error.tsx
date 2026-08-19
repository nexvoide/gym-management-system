"use client";
import Link from "next/link";
import {useEffect} from "react";
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){useEffect(()=>{console.error("Protected route error",error)},[error]);return <div className="content"><section className="card empty-state"><div className="placeholder-icon">!</div><h2>Something went wrong</h2><p>We couldn’t complete that request. Your saved information has not been intentionally removed.</p><div className="quick-actions"><button className="btn btn-primary" onClick={reset}>Try again</button><Link className="btn btn-secondary" href="/dashboard">Go to dashboard</Link></div></section></div>}
