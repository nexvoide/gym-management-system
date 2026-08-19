import type { MemberStatus } from "@/lib/member-status"; import { statusLabel } from "@/lib/member-status";
export function MemberStatusBadge({status}:{status:MemberStatus}){return <span className={`status-badge status-${status}`}><span className="status-dot"/>{statusLabel[status]}</span>}
