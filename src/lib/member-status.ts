export type MemberStatus="active"|"expiring_soon"|"expired"|"frozen"|"cancelled";
export const statusLabel:Record<MemberStatus,string>={active:"Active",expiring_soon:"Expiring soon",expired:"Expired",frozen:"Frozen",cancelled:"Cancelled"};
