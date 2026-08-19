import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { attendance, expenseCategories, expenses, gyms, invoices, members, membershipPlans, memberships, payments, users } from "../src/db/schema";
import { getMember } from "../src/lib/members";
import { invoiceDetail } from "../src/lib/payments";
test("navigation controls are functional rather than decorative", () => { const shell = readFileSync("src/components/app-shell.tsx", "utf8"), settings = readFileSync("src/app/(app)/settings/page.tsx", "utf8"); assert.match(shell, /onClick=\{\(\)=>setMenuOpen\(true\)\}/); assert.match(shell, /event\.metaKey\|\|event\.ctrlKey/); assert.match(shell, /<form className="search" action="\/members">/); assert.doesNotMatch(settings, /<span className="settings-link">Memberships<\/span>/); assert.doesNotMatch(settings, /<span className="settings-link">Payments<\/span>/); });
test("tenant reads and related writes reject foreign records", async () => {
    const sourceMember = (await (db.select().from(members)).limit(1))[0], sourcePlan = (await (db.select().from(membershipPlans)).limit(1))[0], sourceInvoice = (await (db.select().from(invoices)).limit(1))[0], sourceCategory = (await (db.select().from(expenseCategories)).limit(1))[0], sourceUser = (await (db.select().from(users)).limit(1))[0];
    assert.ok(sourceMember && sourcePlan && sourceInvoice && sourceCategory && sourceUser);
    const gymId = `qa_${crypto.randomUUID()}`;
    await db.insert(gyms).values({ id: gymId, name: "QA Tenant", slug: gymId, country: "US", currency: "USD", timezone: "UTC", locale: "en-US" });
    try {
        assert.equal(await getMember(gymId, sourceMember.id), undefined);
        assert.equal(await invoiceDetail(gymId, sourceInvoice.id), null);
        await assert.rejects(db.insert(memberships).values({ id: crypto.randomUUID(), gymId, memberId: sourceMember.id, planId: sourcePlan.id, status: "active", startsAt: new Date(), endsAt: new Date(Date.now() + 86400000) }));
        await assert.rejects(db.insert(invoices).values({ id: crypto.randomUUID(), gymId, memberId: sourceMember.id, invoiceNumber: "QA-1", issuedAt: new Date(), dueAt: new Date(), subtotal: 10, total: 10, balance: 10, status: "unpaid" }));
        await assert.rejects(db.insert(payments).values({ id: crypto.randomUUID(), gymId, memberId: sourceMember.id, invoiceId: sourceInvoice.id, amount: 1, method: "Cash", paidAt: new Date() }));
        await assert.rejects(db.insert(attendance).values({ id: crypto.randomUUID(), gymId, memberId: sourceMember.id, localDate: "2026-01-01", checkInAt: new Date(), method: "manual_search", staffUserId: sourceUser.id }));
        await assert.rejects(db.insert(expenses).values({ id: crypto.randomUUID(), gymId, categoryId: sourceCategory.id, description: "QA", amount: 1, expenseDate: new Date(), paymentMethod: "Cash", createdBy: sourceUser.id }));
    }
    finally {
        await (db.delete(gyms)).where(eq(gyms.id, gymId));
    }
});
test("trainer-facing sources enforce assignment context", () => { const membersPage = readFileSync("src/app/(app)/members/page.tsx", "utf8"), profile = readFileSync("src/app/(app)/members/[id]/page.tsx", "utf8"), trainersPage = readFileSync("src/app/(app)/trainers/page.tsx", "utf8"); assert.match(membersPage, /trainerId:\s*user\.role\s*===\s*"trainer"/); assert.match(profile, /requireMemberAccess\(id\)/); assert.match(profile, /financialAccess/); assert.match(trainersPage, /eq\(trainers\.userId,\s*user\.id\)/); });
