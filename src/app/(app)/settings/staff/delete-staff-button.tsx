"use client";

export function DeleteStaffButton({ action, name }: { action: () => void | Promise<void>; name: string }) {
  return <form action={action} onSubmit={(event) => {
    if (!window.confirm(`Permanently delete ${name}'s staff account? This cannot be undone.`)) event.preventDefault();
  }}>
    <button className="btn btn-secondary btn-sm" style={{ color: "var(--danger, #b42318)" }}>Delete</button>
  </form>;
}
