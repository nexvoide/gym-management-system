import { Mail, MessageCircle } from "lucide-react";

export function MemberCommunicationMenu({ email, whatsapp, welcomeEmailAction, expiryEmailAction }: {
  email: boolean;
  whatsapp: { welcome: string; expiry: string } | null;
  welcomeEmailAction: () => Promise<void>;
  expiryEmailAction: () => Promise<void>;
}) {
  return <div className="member-communication-menu">
    {email && <details className="action-menu"><summary className="btn btn-secondary"><Mail size={16}/> Email</summary><div className="action-menu-popover"><form action={welcomeEmailAction}><button>Welcome message</button></form><form action={expiryEmailAction}><button>Expiry reminder</button></form></div></details>}
    {whatsapp && <details className="action-menu"><summary className="btn btn-secondary"><MessageCircle size={16}/> WhatsApp</summary><div className="action-menu-popover"><a href={whatsapp.welcome} target="_blank" rel="noreferrer">Welcome message</a><a href={whatsapp.expiry} target="_blank" rel="noreferrer">Expiry reminder</a></div></details>}
  </div>;
}
