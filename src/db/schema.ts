import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
};

export const gyms = pgTable("gyms", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull().unique(),
  phone: text("phone"), email: text("email"), address: text("address"), logoUrl: text("logo_url"),
  country: text("country").notNull().default("US"),
  timezone: text("timezone").notNull().default("UTC"), currency: text("currency").notNull().default("USD"),
  locale: text("locale").notNull().default("en"), dateFormat: text("date_format").notNull().default("medium"), firstDayOfWeek: integer("first_day_of_week").notNull().default(1),
  taxEnabled: boolean("tax_enabled").notNull().default(false), taxName: text("tax_name"), taxPercentage: numeric("tax_percentage", { precision: 6, scale: 3, mode: "number" }).notNull().default(0), ...timestamps,
});

export const roles = pgTable("roles", {
  id: text("id").primaryKey(), gymId: text("gym_id").references(() => gyms.id, { onDelete: "cascade" }),
  key: text("key", { enum: ["owner", "manager", "receptionist", "trainer"] }).notNull(),
  name: text("name").notNull(), description: text("description"), ...timestamps,
}, (t) => [uniqueIndex("roles_gym_key_unique").on(t.gymId, t.key)]);

export const permissions = pgTable("permissions", {
  id: text("id").primaryKey(), key: text("key").notNull().unique(), description: text("description").notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: text("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("role_permission_unique").on(t.roleId, t.permissionId)]);

export const users = pgTable("users", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id),
  roleId: text("role_id").notNull().references(() => roles.id), name: text("name").notNull(),
  email: text("email").notNull().unique(), passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"), active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }), ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const passwordTokens = pgTable("password_tokens", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["staff_setup", "password_reset"] }).notNull(), tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(), usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("password_tokens_user_idx").on(t.userId, t.expiresAt)]);

export const requestLimits = pgTable("request_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("request_limits_expires_idx").on(t.expiresAt)]);

export const settings = pgTable("settings", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id, { onDelete: "cascade" }),
  category: text("category", { enum: ["gym", "membership", "payment", "notification"] }).notNull(),
  key: text("key").notNull(), value: jsonb("value").notNull(), ...timestamps,
}, (t) => [uniqueIndex("settings_gym_key_unique").on(t.gymId, t.key)]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id),
  userId: text("user_id").references(() => users.id), action: text("action").notNull(), entityType: text("entity_type").notNull(),
  entityId: text("entity_id"), metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["membership_expiring", "membership_expired", "payment_overdue", "payment_received"] }).notNull(),
  title: text("title").notNull(), body: text("body").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  href: text("href").notNull(), channel: text("channel", { enum: ["in_app", "email", "whatsapp", "sms"] }).notNull().default("in_app"),
  dedupeKey: text("dedupe_key").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("notifications_gym_dedupe_unique").on(t.gymId, t.dedupeKey), index("notifications_gym_occurred_idx").on(t.gymId, t.occurredAt)]);

export const notificationReads = pgTable("notification_reads", {
  notificationId: text("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("notification_reads_unique").on(t.notificationId, t.userId), index("notification_reads_user_idx").on(t.userId, t.readAt)]);

export const trainers = pgTable("trainers", { id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id), userId:text("user_id").references(()=>users.id,{onDelete:"set null"}), name: text("name").notNull(), photoUrl:text("photo_url"),phone:text("phone"),email:text("email"),specialization:text("specialization"),joiningDate:timestamp("joining_date", { withTimezone: true, mode: "date" }),salaryAmount:numeric("salary_amount",{precision:18,scale:3,mode:"number"}),salaryCurrency:text("salary_currency"),salaryPeriod:text("salary_period",{enum:["hourly","per_session","weekly","monthly"]}),status: text("status",{enum:["active","inactive"]}).notNull().default("active"),notes:text("notes"),archivedAt:timestamp("archived_at", { withTimezone: true, mode: "date" }), ...timestamps },(t)=>[index("trainers_gym_status_idx").on(t.gymId,t.status),uniqueIndex("trainers_user_unique").on(t.userId)]);
export const members = pgTable("members", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id), memberNumber: text("member_number").notNull(),
  firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), profilePhotoUrl: text("profile_photo_url"),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true, mode: "date" }), gender: text("gender", { enum: ["female", "male", "non_binary", "prefer_not_to_say"] }),
  phone: text("phone"), email: text("email"), address: text("address"), notes: text("notes"),
  emergencyContactName: text("emergency_contact_name"), emergencyContactRelationship: text("emergency_contact_relationship"), emergencyContactPhone: text("emergency_contact_phone"),
  trainerId: text("trainer_id").references(() => trainers.id, { onDelete: "set null" }), status: text("status", { enum: ["active", "frozen", "cancelled"] }).notNull().default("active"),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }), ...timestamps,
}, (t) => [uniqueIndex("member_number_gym_unique").on(t.gymId, t.memberNumber), index("members_gym_name_idx").on(t.gymId,t.lastName,t.firstName), index("members_gym_phone_idx").on(t.gymId,t.phone), index("members_gym_email_idx").on(t.gymId,t.email)]);
export const membershipPlans = pgTable("membership_plans", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id), name: text("name").notNull(), description: text("description"),
  durationDays: integer("duration_days").notNull(), duration: integer("duration").notNull().default(30), durationUnit: text("duration_unit", { enum: ["days", "weeks", "months", "years"] }).notNull().default("days"), currency: text("currency").notNull().default("USD"),
  price: numeric("price", { precision: 18, scale: 3, mode: "number" }).notNull(), signupFee: numeric("signup_fee", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), recurring: boolean("recurring").notNull().default(false), accessDescription: text("access_description"), notes: text("notes"),
  active: boolean("active").notNull().default(true), archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }), ...timestamps,
}, (t)=>[uniqueIndex("membership_plans_gym_name_unique").on(t.gymId,t.name),index("membership_plans_gym_active_idx").on(t.gymId,t.active)]);
export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(), gymId: text("gym_id").notNull().references(() => gyms.id), memberId: text("member_id").notNull().references(() => members.id), planId: text("plan_id").notNull().references(() => membershipPlans.id),
  status: text("status",{enum:["pending","active","expired","frozen","cancelled"]}).notNull(), startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
  currency: text("currency").notNull().default("USD"), basePrice: numeric("base_price", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), signupFee: numeric("signup_fee", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), discountType: text("discount_type", { enum: ["fixed", "percentage"] }).notNull().default("fixed"), discountValue: numeric("discount_value", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), discount: numeric("discount", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), taxName: text("tax_name"), taxRate: numeric("tax_rate", { precision: 6, scale: 3, mode: "number" }).notNull().default(0), tax: numeric("tax", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), finalPrice: numeric("final_price", { precision: 18, scale: 3, mode: "number" }).notNull().default(0), notes:text("notes"),
  createdBy: text("created_by").references(()=>users.id), cancelledAt:timestamp("cancelled_at", { withTimezone: true, mode: "date" }), ...timestamps,
},(t)=>[index("memberships_gym_member_idx").on(t.gymId,t.memberId),index("memberships_gym_end_idx").on(t.gymId,t.endsAt)]);
export const membershipHistory = pgTable("membership_history",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),memberId:text("member_id").notNull().references(()=>members.id),membershipId:text("membership_id").notNull().references(()=>memberships.id),
  action:text("action",{enum:["created","activated","renewed","frozen","resumed","expired","cancelled"]}).notNull(),fromStatus:text("from_status"),toStatus:text("to_status"),
  startsAt:timestamp("starts_at", { withTimezone: true, mode: "date" }),endsAt:timestamp("ends_at", { withTimezone: true, mode: "date" }),notes:text("notes"),performedBy:text("performed_by").references(()=>users.id),createdAt:timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(()=>new Date()),
},(t)=>[index("membership_history_member_idx").on(t.gymId,t.memberId,t.createdAt)]);
export const membershipFreezes = pgTable("membership_freezes",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),membershipId:text("membership_id").notNull().references(()=>memberships.id),startDate:timestamp("start_date", { withTimezone: true, mode: "date" }).notNull(),endDate:timestamp("end_date", { withTimezone: true, mode: "date" }).notNull(),
  days:integer("days").notNull(),reason:text("reason"),status:text("status",{enum:["scheduled","active","completed","cancelled"]}).notNull(),createdBy:text("created_by").references(()=>users.id),resumedAt:timestamp("resumed_at", { withTimezone: true, mode: "date" }),...timestamps,
},(t)=>[index("membership_freezes_membership_idx").on(t.membershipId,t.startDate)]);
export const invoices=pgTable("invoices",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),memberId:text("member_id").notNull().references(()=>members.id),membershipId:text("membership_id").references(()=>memberships.id),invoiceNumber:text("invoice_number").notNull(),
  currency:text("currency").notNull().default("USD"),memberName:text("member_name").notNull().default(""),memberNumberSnapshot:text("member_number_snapshot").notNull().default(""),memberEmail:text("member_email"),memberPhone:text("member_phone"),gymName:text("gym_name").notNull().default(""),gymAddress:text("gym_address"),gymEmail:text("gym_email"),gymPhone:text("gym_phone"),
  issuedAt:timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),dueAt:timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),subtotal:numeric("subtotal",{precision:18,scale:3,mode:"number"}).notNull(),discount:numeric("discount",{precision:18,scale:3,mode:"number"}).notNull().default(0),taxName:text("tax_name"),taxRate:numeric("tax_rate",{precision:6,scale:3,mode:"number"}).notNull().default(0),tax:numeric("tax",{precision:18,scale:3,mode:"number"}).notNull().default(0),total:numeric("total",{precision:18,scale:3,mode:"number"}).notNull(),paid:numeric("paid",{precision:18,scale:3,mode:"number"}).notNull().default(0),balance:numeric("balance",{precision:18,scale:3,mode:"number"}).notNull(),status:text("status",{enum:["paid","partially_paid","unpaid","overdue","refunded"]}).notNull(),notes:text("notes"),...timestamps,
},(t)=>[uniqueIndex("invoices_gym_number_unique").on(t.gymId,t.invoiceNumber),index("invoices_gym_member_idx").on(t.gymId,t.memberId)]);
export const invoiceItems=pgTable("invoice_items",{
  id:text("id").primaryKey(),invoiceId:text("invoice_id").notNull().references(()=>invoices.id),description:text("description").notNull(),quantity:numeric("quantity",{precision:12,scale:3,mode:"number"}).notNull().default(1),unitPrice:numeric("unit_price",{precision:18,scale:3,mode:"number"}).notNull(),amount:numeric("amount",{precision:18,scale:3,mode:"number"}).notNull(),createdAt:timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(()=>new Date()),
},(t)=>[index("invoice_items_invoice_idx").on(t.invoiceId)]);
export const payments=pgTable("payments",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),memberId:text("member_id").notNull().references(()=>members.id),invoiceId:text("invoice_id").notNull().references(()=>invoices.id),currency:text("currency").notNull().default("USD"),amount:numeric("amount",{precision:18,scale:3,mode:"number"}).notNull(),method:text("method").notNull(),paidAt:timestamp("paid_at", { withTimezone: true, mode: "date" }).notNull(),reference:text("reference"),notes:text("notes"),recordedBy:text("recorded_by").references(()=>users.id),createdAt:timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(()=>new Date()),
},(t)=>[index("payments_gym_member_idx").on(t.gymId,t.memberId,t.paidAt)]);
export const attendance=pgTable("attendance",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),memberId:text("member_id").notNull().references(()=>members.id),membershipId:text("membership_id").references(()=>memberships.id),
  localDate:date("local_date",{mode:"string"}).notNull(),checkInAt:timestamp("check_in_at", { withTimezone: true, mode: "date" }).notNull(),checkOutAt:timestamp("check_out_at", { withTimezone: true, mode: "date" }),method:text("method",{enum:["manual_search","member_id"]}).notNull(),
  overrideUsed:boolean("override_used").notNull().default(false),overrideReason:text("override_reason"),staffUserId:text("staff_user_id").notNull().references(()=>users.id),notes:text("notes"),createdAt:timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().$defaultFn(()=>new Date()),
},(t)=>[index("attendance_gym_date_idx").on(t.gymId,t.localDate),index("attendance_member_checkin_idx").on(t.gymId,t.memberId,t.checkInAt)]);
export const expenseCategories=pgTable("expense_categories",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),name:text("name").notNull(),active:boolean("active").notNull().default(true),archivedAt:timestamp("archived_at", { withTimezone: true, mode: "date" }),...timestamps,
},(t)=>[uniqueIndex("expense_categories_gym_name_unique").on(t.gymId,t.name)]);
export const expenses=pgTable("expenses",{
  id:text("id").primaryKey(),gymId:text("gym_id").notNull().references(()=>gyms.id),categoryId:text("category_id").notNull().references(()=>expenseCategories.id),trainerId:text("trainer_id").references(()=>trainers.id,{onDelete:"set null"}),currency:text("currency").notNull().default("USD"),description:text("description").notNull(),amount:numeric("amount",{precision:18,scale:3,mode:"number"}).notNull(),expenseDate:timestamp("expense_date", { withTimezone: true, mode: "date" }).notNull(),paymentMethod:text("payment_method").notNull(),vendor:text("vendor"),receiptUrl:text("receipt_url"),notes:text("notes"),createdBy:text("created_by").notNull().references(()=>users.id),...timestamps,
},(t)=>[index("expenses_gym_date_idx").on(t.gymId,t.expenseDate),index("expenses_gym_category_idx").on(t.gymId,t.categoryId)]);

export type RoleKey = typeof roles.$inferSelect.key;
