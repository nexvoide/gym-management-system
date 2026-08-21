import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gyms } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { signedGymLogoUrl } from "@/lib/gym-branding";
import { can } from "@/lib/permissions";
import { deleteGymLogo, replaceGymLogo, updateAppearance, updateCommunicationSettings, updateGymProfile } from "./actions";
import { ThemeSelector, type GymTheme } from "@/components/theme-selector";

export default async function SettingsPage() {
  const user = await requirePermission("settings.read");
  const gym = (await db.select().from(gyms).where(eq(gyms.id, user.gymId)))[0]!;
  const logoUrl = await signedGymLogoUrl(gym.logoUrl, user.gymId);
  const reminders = Array.isArray(gym.expiryReminderDays) ? gym.expiryReminderDays.filter((day): day is number => typeof day === "number") : [7, 3];
  const owner = user.role === "owner";
  return <div className="content settings-page">
    <div className="page-head"><div><div className="eyebrow">Workspace configuration</div><h1>Settings</h1><p>Manage your gym profile, branding, appearance, and member messages.</p></div></div>
    <div className="settings-grid"><aside className="card settings-menu"><a className="settings-link active" href="#profile">Gym profile</a><a className="settings-link" href="#branding">Branding</a><a className="settings-link" href="#appearance">Appearance</a><a className="settings-link" href="#communications">Communications</a>{can(user.role, "users.manage") && <Link className="settings-link" href="/settings/staff">Staff & roles</Link>}</aside>
      <div className="settings-stack">
        <form id="profile" className="card form-card" action={updateGymProfile}><h3>Gym profile</h3><p>Details shown to staff and used in member communications.</p><div className="form-grid">
          <Field label="Gym name" name="name" value={gym.name} required span/><Field label="Email" name="email" value={gym.email} type="email"/><Field label="Phone" name="phone" value={gym.phone}/><Field label="WhatsApp number" name="whatsappPhone" value={gym.whatsappPhone} hint="Include the international country code."/><Field label="Website" name="website" value={gym.website} type="url"/><Field label="Address" name="address" value={gym.address} span/>
          <Field label="Country code" name="country" value={gym.country} required/><Field label="ISO currency" name="currency" value={gym.currency} required/><Field label="IANA timezone" name="timezone" value={gym.timezone} required/><Field label="Locale" name="locale" value={gym.locale} required/>
          <div className="field"><label htmlFor="dateFormat">Date display</label><select className="input" id="dateFormat" name="dateFormat" defaultValue={gym.dateFormat}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></div>
          <div className="field"><label htmlFor="firstDayOfWeek">First day of week</label><select className="input" id="firstDayOfWeek" name="firstDayOfWeek" defaultValue={gym.firstDayOfWeek}><option value="1">Monday</option><option value="0">Sunday</option><option value="6">Saturday</option></select></div>
          <label className="check-row span-2"><input name="taxEnabled" type="checkbox" defaultChecked={gym.taxEnabled}/><span>Apply configured tax to new invoices</span></label><Field label="Tax name" name="taxName" value={gym.taxName}/><Field label="Tax percentage" name="taxPercentage" value={String(gym.taxPercentage)} type="number"/>
        </div><div className="save-row"><button className="btn btn-primary" disabled={!can(user.role, "settings.write")}>Save profile</button></div></form>
        <section id="branding" className="card form-card"><h3>Gym logo</h3><p>Your logo appears in navigation, settings, and invoices. Owner access is required.</p><div className="branding-row"><div className="gym-logo-preview">{logoUrl ? <Image src={logoUrl} alt={`${gym.name} logo`} fill sizes="96px" unoptimized/> : <span>{gym.name.slice(0, 1).toUpperCase()}</span>}</div><div className="branding-actions"><form action={replaceGymLogo}><input className="input" name="logo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={!owner}/><button className="btn btn-primary" disabled={!owner}>Upload or replace logo</button></form>{gym.logoUrl && <form action={deleteGymLogo}><button className="btn btn-danger" disabled={!owner}>Remove logo</button></form>}<small>JPG, PNG, or WEBP. Maximum 5 MB.</small></div></div></section>
        <section id="appearance" className="card form-card"><h3>Appearance</h3><p>Select a professional gym interface. Changes appear immediately and persist for everyone in this gym.</p><ThemeSelector active={gym.skin as GymTheme} disabled={!owner} action={updateAppearance}/></section>
        <form id="communications" className="card form-card" action={updateCommunicationSettings}><h3>Member communications</h3><p>Email uses the existing secure server-side SMTP configuration. WhatsApp opens a pre-filled message for staff to send manually.</p><div className="communication-settings"><label className="check-row"><input name="autoWelcomeEmail" type="checkbox" defaultChecked={gym.autoWelcomeEmail}/><span>Automatically send a welcome email when a member is created</span></label><label className="check-row"><input name="expiryRemindersEnabled" type="checkbox" defaultChecked={gym.expiryRemindersEnabled}/><span>Enable automatic membership expiry email reminders</span></label><div><strong>Reminder timing</strong><div className="reminder-options">{[7, 3, 1].map((day) => <label className="check-row" key={day}><input name={`reminder${day}`} type="checkbox" defaultChecked={reminders.includes(day)}/><span>{day} day{day === 1 ? "" : "s"} before expiry</span></label>)}</div></div></div><div className="save-row"><button className="btn btn-primary" disabled={!can(user.role, "settings.write")}>Save communication settings</button></div></form>
      </div>
    </div>
  </div>;
}
function Field({ label, name, value, type = "text", required, span, hint }: { label: string; name: string; value: string | null; type?: string; required?: boolean; span?: boolean; hint?: string }) {
  return <div className={`field ${span ? "span-2" : ""}`}><label htmlFor={name}>{label}</label><input className="input" id={name} name={name} type={type} defaultValue={value ?? ""} required={required}/>{hint && <small className="field-hint">{hint}</small>}</div>;
}
