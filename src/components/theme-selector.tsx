"use client";
import { useState, useTransition } from "react";
export type GymTheme = "midnight" | "titanium" | "carbon";
const themes: { id: GymTheme; name: string; description: string; colors: string[]; recommended?: boolean }[] = [
  { id: "midnight", name: "Midnight", description: "Premium dark", colors: ["#0B0F14", "#111820", "#18212B", "#FF5A36"], recommended: true },
  { id: "titanium", name: "Titanium", description: "Clean light", colors: ["#F5F7FA", "#FFFFFF", "#EEF1F5", "#2563EB"] },
  { id: "carbon", name: "Carbon", description: "Athletic dark", colors: ["#090909", "#141414", "#1D1D1D", "#A3E635"] },
];
export function ThemeSelector({ active, disabled, action }: { active: GymTheme; disabled: boolean; action: (theme: GymTheme) => Promise<void> }) {
  const [selected, setSelected] = useState(active), [pending, startTransition] = useTransition();
  const choose = (theme: GymTheme) => { if (disabled || pending || theme === selected) return; const previous = selected; setSelected(theme); document.querySelector("[data-skin]")?.setAttribute("data-skin", theme); startTransition(async () => { try { await action(theme); } catch { setSelected(previous); document.querySelector("[data-skin]")?.setAttribute("data-skin", previous); } }); };
  return <div className="skin-grid" role="radiogroup" aria-label="Gym appearance">{themes.map((theme) => <button type="button" role="radio" aria-checked={selected === theme.id} className={`skin-choice ${selected === theme.id ? "active" : ""}`} key={theme.id} onClick={() => choose(theme.id)} disabled={disabled || pending}><span className="skin-preview" style={{ background: theme.colors[0] }}><i style={{ background: theme.colors[1] }}/><em style={{ background: theme.colors[2] }}/><b style={{ background: theme.colors[3] }}/></span><span className="skin-copy"><strong>{theme.name}{theme.recommended && <small>Recommended</small>}</strong><span>{theme.description}</span></span><span className="skin-state">{selected === theme.id ? "✓ Active" : "Select"}</span></button>)}</div>;
}
