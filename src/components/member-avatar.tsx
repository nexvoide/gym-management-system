import Image from "next/image";

export function MemberAvatar({ firstName, lastName, photoUrl, large = false }: {
  firstName: string; lastName: string; photoUrl?: string | null; large?: boolean;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return <span className={large ? "profile-avatar member-avatar-photo" : "avatar member-avatar-photo"}>
    {photoUrl ? <Image src={photoUrl} alt={`${firstName} ${lastName}`} fill sizes={large ? "64px" : "34px"} unoptimized/> : initials}
  </span>;
}
