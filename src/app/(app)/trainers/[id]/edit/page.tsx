import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gyms, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { TrainerForm } from "@/components/trainer-form";
import { updateTrainer } from "../../actions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("trainers.write");
    const { id } = await params;
    const trainer = (await (db.select().from(trainers)).where(and(eq(trainers.id, id), eq(trainers.gymId, user.gymId), isNull(trainers.archivedAt))))[0];
    const gym = (await db.select({ currency: gyms.currency }).from(gyms).where(eq(gyms.id, user.gymId)))[0];
    if (!trainer)
        notFound();
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">Coaching team</div><h1>Edit trainer</h1><p>Update {trainer.name}’s contact and professional details.</p></div></div><TrainerForm action={updateTrainer.bind(null, id)} values={trainer} currency={gym?.currency ?? "USD"}/></div>;
}
