import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gyms } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { TrainerForm } from "@/components/trainer-form";
import { createTrainer } from "../actions";
export default async function Page(){const user=await requirePermission("trainers.write");const gym=(await db.select({currency:gyms.currency}).from(gyms).where(eq(gyms.id,user.gymId)))[0];return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">Coaching team</div><h1>Add trainer</h1><p>Create a focused profile without scheduling overhead.</p></div></div><TrainerForm action={createTrainer} currency={gym?.currency??"USD"}/></div>}
