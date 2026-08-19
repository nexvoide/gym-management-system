import { hash } from "bcryptjs";
import { db } from "./index";
import { attendance, auditLogs, expenseCategories, expenses, gyms, invoiceItems, invoices, members, membershipHistory, membershipPlans, memberships, payments, permissions, rolePermissions, roles, settings, trainers, users } from "./schema";
import { permissionKeys, rolePermissionMap } from "../lib/permissions";
const gymId = "gym_form_demo";
async function seed() {
    if (process.env.DEMO_SEED !== "true" || process.env.NODE_ENV === "production")
        throw new Error("Demo seeding requires DEMO_SEED=true and is disabled in production.");
    await (db.insert(gyms).values({ id: gymId, name: "Form Athletics", slug: "form-athletics", phone: "+92 300 555 0182", email: "hello@formgym.com", address: "Gulberg III, Lahore", timezone: "Asia/Karachi", currency: "PKR", locale: "en-PK" })).onConflictDoNothing();
    const roleRows = (["owner", "manager", "receptionist", "trainer"] as const).map(key => ({ id: key === "owner" ? "role_super_admin" : `role_${key}`, gymId, key, name: key[0].toUpperCase() + key.slice(1), description: `Default ${key} access` }));
    for (const role of roleRows)
        await (db.insert(roles).values(role)).onConflictDoNothing();
    for (const key of permissionKeys)
        await (db.insert(permissions).values({ id: `permission_${key}`, key, description: key.replace(".", " ") })).onConflictDoNothing();
    for (const role of roleRows)
        for (const key of rolePermissionMap[role.key])
            await (db.insert(rolePermissions).values({ roleId: role.id, permissionId: `permission_${key}` })).onConflictDoNothing();
    const passwordHash = await hash("FormGym2026!", 12);
    await (db.insert(users).values({ id: "user_admin", gymId, roleId: "role_super_admin", name: "Ayesha Malik", email: "admin@formgym.com", passwordHash })).onConflictDoUpdate({ target: users.email, set: { passwordHash, active: true } });
    const defaults = [{ category: "membership" as const, key: "expiry_warning_days", value: [30, 7, 1] }, { category: "membership" as const, key: "freeze_rules", value: { extendExpiry: true, maxDays: 30 } }, { category: "payment" as const, key: "methods", value: ["Cash", "Card", "Bank Transfer", "Online", "Other"] }, { category: "notification" as const, key: "channels", value: { inApp: true, email: false, sms: false, whatsapp: false } }];
    for (const item of defaults)
        await (db.insert(settings).values({ id: `setting_${item.key}`, gymId, ...item })).onConflictDoNothing();
    const trainerRows = [{ id: "trainer_sara", gymId, name: "Sara Ahmed", status: "active" as const, phone: "+92 300 111 2001", email: "sara@formgym.com", specialization: "Strength & conditioning", joiningDate: new Date(2024, 2, 12), notes: "Focuses on progressive strength programs." }, { id: "trainer_omar", gymId, name: "Omar Farooq", status: "active" as const, phone: "+92 300 111 2002", email: "omar@formgym.com", specialization: "Mobility & functional fitness", joiningDate: new Date(2023, 8, 4), notes: "Works primarily with new members." }, { id: "trainer_maya", gymId, name: "Maya Khan", status: "active" as const, phone: "+92 300 111 2003", email: "maya@formgym.com", specialization: "General fitness", joiningDate: new Date(2025, 0, 20), notes: null }];
    for (const trainer of trainerRows)
        await (db.insert(trainers).values(trainer)).onConflictDoNothing();
    const planRows = [{ id: "plan_monthly", gymId, name: "Monthly", durationDays: 30, price: 8500 }, { id: "plan_quarterly", gymId, name: "Quarterly", durationDays: 90, price: 22500 }, { id: "plan_annual", gymId, name: "Annual", durationDays: 365, price: 78000 }];
    for (const plan of planRows)
        await (db.insert(membershipPlans).values(plan)).onConflictDoNothing();
    const firstNames = ["Ahmed", "Aisha", "Ali", "Amna", "Bilal", "Daniyal", "Fatima", "Hamza", "Hira", "Hassan", "Iqra", "Kashif", "Mahnoor", "Maryam", "Owais", "Rida", "Saad", "Sana", "Usman", "Zara"];
    const lastNames = ["Khan", "Ahmed", "Malik", "Sheikh", "Qureshi", "Raza", "Siddiqui", "Chaudhry", "Abbasi", "Mirza"];
    const now = Date.now();
    const categoryNames = ["Rent", "Electricity", "Water", "Internet", "Salaries", "Equipment", "Maintenance", "Cleaning", "Marketing", "Other"];
    for (const [index, name] of categoryNames.entries())
        await (db.insert(expenseCategories).values({ id: `expense_category_${index + 1}`, gymId, name })).onConflictDoNothing();
    for (let i = 0; i < 36; i++) {
        const categoryIndex = i % categoryNames.length, amount = [180000, 42000, 9000, 12500, 260000, 75000, 22000, 18000, 35000, 15000][categoryIndex] + (i % 4) * 1500;
        await (db.insert(expenses).values({ id: `expense_demo_${i + 1}`, gymId, categoryId: `expense_category_${categoryIndex + 1}`, description: `${categoryNames[categoryIndex]} — ${new Date(now - i * 3 * 86400000).toLocaleDateString("en-PK", { month: "short" })}`, amount, expenseDate: new Date(now - i * 3 * 86400000), paymentMethod: i % 2 === 0 ? "Bank Transfer" : "Cash", vendor: categoryIndex === 0 ? "Property Management" : categoryIndex === 5 ? "Fitness Supply Co." : null, receiptUrl: i % 5 === 0 ? `https://example.com/receipts/${i + 1}` : null, createdBy: "user_admin" })).onConflictDoNothing();
    }
    for (let i = 0; i < 56; i++) {
        const id = `member_demo_${String(i + 1).padStart(3, "0")}`;
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[(i * 3) % lastNames.length];
        await (db.insert(members).values({ id, gymId, memberNumber: `FM-${String(1001 + i)}`, firstName, lastName, phone: `+92 300 ${String(5550000 + i).slice(-7)}`, email: `${firstName}.${lastName}.${i + 1}@example.com`.toLowerCase(), address: i % 3 === 0 ? "Gulberg, Lahore" : i % 3 === 1 ? "DHA, Lahore" : "Johar Town, Lahore", dateOfBirth: new Date(1985 + (i % 18), i % 12, (i % 27) + 1), gender: i % 2 === 0 ? "male" : "female", emergencyContactName: `${lastName} Family`, emergencyContactRelationship: "Family", emergencyContactPhone: `+92 321 ${String(4440000 + i).slice(-7)}`, trainerId: trainerRows[i % trainerRows.length].id, notes: i % 9 === 0 ? "Prefers evening training sessions." : null, status: i === 52 ? "frozen" : i === 53 ? "cancelled" : "active" })).onConflictDoNothing();
        const daysFromNow = i < 36 ? 15 + (i % 180) : i < 44 ? 1 + (i % 7) : -(2 + (i % 60));
        const plan = planRows[i % planRows.length];
        const membershipId = `membership_demo_${i + 1}`, startsAt = new Date(now - (plan.durationDays - daysFromNow) * 86400000), endsAt = new Date(now + daysFromNow * 86400000);
        await (db.insert(memberships).values({ id: membershipId, gymId, memberId: id, planId: plan.id, status: daysFromNow < 0 ? "expired" : i === 52 ? "frozen" : "active", startsAt, endsAt, basePrice: plan.price, finalPrice: plan.price, createdBy: "user_admin" })).onConflictDoNothing();
        await (db.insert(membershipHistory).values({ id: `history_demo_${i + 1}`, gymId, memberId: id, membershipId, action: "created", toStatus: daysFromNow < 0 ? "expired" : i === 52 ? "frozen" : "active", startsAt, endsAt, performedBy: "user_admin" })).onConflictDoNothing();
        const invoiceId = `invoice_demo_${i + 1}`, paid = i % 3 === 0 ? plan.price : i % 3 === 1 ? Math.round(plan.price * .5) : 0, balance = plan.price - paid, invoiceStatus = balance === 0 ? "paid" : paid > 0 ? "partially_paid" : startsAt < new Date() ? "overdue" : "unpaid";
        await (db.insert(invoices).values({ id: invoiceId, gymId, memberId: id, membershipId, invoiceNumber: `INV-2026-${String(i + 1).padStart(5, "0")}`, issuedAt: startsAt, dueAt: startsAt, subtotal: plan.price, total: plan.price, paid, balance, status: invoiceStatus })).onConflictDoNothing();
        await (db.insert(invoiceItems).values({ id: `invoice_item_demo_${i + 1}`, invoiceId, description: `${plan.name} membership`, quantity: 1, unitPrice: plan.price, amount: plan.price })).onConflictDoNothing();
        if (paid > 0)
            await (db.insert(payments).values({ id: `payment_demo_${i + 1}`, gymId, memberId: id, invoiceId, amount: paid, method: i % 2 === 0 ? "Cash" : "Card", paidAt: startsAt, reference: i % 4 === 0 ? `POS-${10000 + i}` : null, recordedBy: "user_admin" })).onConflictDoNothing();
        if (daysFromNow > 0 && i !== 52) {
            for (let visit = 0; visit < 4; visit++) {
                const checkInAt = new Date(now - ((i + visit * 5) % 28) * 86400000 - (8 + (i % 10)) * 3600000), checkOutAt = new Date(checkInAt.getTime() + (45 + (i % 75)) * 60000);
                await (db.insert(attendance).values({ id: `attendance_demo_${i + 1}_${visit + 1}`, gymId, memberId: id, membershipId, localDate: checkInAt.toISOString().slice(0, 10), checkInAt, checkOutAt, method: visit % 3 === 0 ? "member_id" : "manual_search", staffUserId: "user_admin" })).onConflictDoNothing();
            }
        }
    }
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), gymId, userId: "user_admin", action: "workspace.seeded", entityType: "gym", entityId: gymId });
    console.log("Development demo data seeded. Credentials are intentionally not printed.");
}
await seed();
