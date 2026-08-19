import { format } from "date-fns";
import { Bell, CalendarClock, CheckCheck, CircleDollarSign, ClockAlert, WalletCards } from "lucide-react";
import Link from "next/link";
import { markAllRead, markRead } from "@/app/(app)/notifications/actions";
import { requireUser } from "@/lib/auth";
import { notificationFeed, syncNotifications, type NotificationType } from "@/lib/notifications";
type Props = {
    searchParams: Promise<{
        view?: string;
        type?: string;
    }>;
};
const types: NotificationType[] = ["membership_expiring", "membership_expired", "payment_overdue", "payment_received"];
export default async function NotificationsPage({ searchParams }: Props) {
    const user = await requireUser();
    const params = await searchParams;
    await syncNotifications(user.gymId);
    const all = await notificationFeed(user.gymId, user.id, user.role);
    const requestedType = types.includes(params.type as NotificationType) ? params.type as NotificationType : null;
    const rows = all.filter(row => (params.view === "unread" ? !row.readAt : true) && (requestedType ? row.type === requestedType : true));
    const unread = all.filter(row => !row.readAt).length;
    return <div className="content content-narrow notifications-page">
    <div className="page-head"><div><div className="eyebrow">Stay ahead</div><h1>Notifications</h1><p>Important membership and payment events only.</p></div>{unread > 0 && <form action={markAllRead}><button className="btn btn-secondary"><CheckCheck size={16}/> Mark all read</button></form>}</div>
    <div className="notification-layout"><aside className="card notification-filters"><Link className={!params.view && !requestedType ? "active" : ""} href="/notifications"><Bell size={15}/>All <span>{all.length}</span></Link><Link className={params.view === "unread" ? "active" : ""} href="/notifications?view=unread"><ClockAlert size={15}/>Unread <span>{unread}</span></Link><div className="nav-label">Type</div>{types.map(type => <Link key={type} className={requestedType === type ? "active" : ""} href={`/notifications?type=${type}`}>{iconFor(type, 15)}{label(type)}</Link>)}</aside>
      <section className="card notification-feed">{rows.map(row => <article className={row.readAt ? "" : "unread"} key={row.id}><span className={`notification-type notification-${row.type}`}>{iconFor(row.type, 18)}</span><div><div className="notification-title"><strong>{row.title}</strong>{!row.readAt && <span>New</span>}</div><p>{row.body}</p><small>{format(row.occurredAt, "MMM d, yyyy · h:mm a")}</small></div><div className="notification-actions"><Link className="btn btn-secondary btn-sm" href={row.href}>View</Link>{!row.readAt && <form action={markRead.bind(null, row.id)}><button className="row-action" aria-label="Mark as read"><CheckCheck size={15}/></button></form>}</div></article>)}{!rows.length && <div className="empty-state"><span className="placeholder-icon"><Bell size={22}/></span><h2>You’re all caught up</h2><p>No important notifications match this view.</p></div>}</section>
    </div>
    <p className="notification-architecture">In-app delivery is active. Email, WhatsApp, and SMS can be added later through the existing channel model.</p>
  </div>;
}
function label(type: NotificationType) { return type.split("_").map(word => word[0].toUpperCase() + word.slice(1)).join(" "); }
function iconFor(type: NotificationType, size: number) { if (type === "membership_expiring")
    return <CalendarClock size={size}/>; if (type === "membership_expired")
    return <ClockAlert size={size}/>; if (type === "payment_overdue")
    return <WalletCards size={size}/>; return <CircleDollarSign size={size}/>; }
