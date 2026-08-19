import postgres from "postgres";

process.loadEnvFile?.(".env");
const url = process.env.DATABASE_URL;
if (!url?.startsWith("postgres")) throw new Error("DATABASE_URL must be PostgreSQL.");
const sql = postgres(url, { prepare: false, max: 1, ssl: "require", connect_timeout: 15 });

async function main() {
  try {
    await sql.begin(async tx => {
      await tx`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
          phone, phone_change, phone_change_token, email_change_token_current,
          email_change_confirm_status, reauthentication_token, is_sso_user, is_anonymous
        )
        select
          '00000000-0000-0000-0000-000000000000'::uuid, gen_random_uuid(),
          'authenticated', 'authenticated', lower(u.email), u.password_hash, now(),
          '', '', '', '',
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', u.name), false, u.created_at, now(),
          null, '', '', '', 0, '', false, false
        from public.users u
        where not exists (select 1 from auth.users au where lower(au.email) = lower(u.email))
      `;
      await tx`
        insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        select au.id::text, au.id,
          jsonb_build_object('sub', au.id::text, 'email', au.email, 'email_verified', true, 'phone_verified', false),
          'email', null, au.created_at, now()
        from auth.users au
        join public.users u on lower(u.email) = lower(au.email)
        where not exists (select 1 from auth.identities ai where ai.user_id = au.id and ai.provider = 'email')
      `;
    });
    const [{ app_users, auth_users, identities }] = await sql<{ app_users: number; auth_users: number; identities: number }[]>`
      select
        (select count(*) from public.users)::int app_users,
        (select count(*) from auth.users au join public.users u on lower(u.email)=lower(au.email))::int auth_users,
        (select count(*) from auth.identities ai join auth.users au on au.id=ai.user_id join public.users u on lower(u.email)=lower(au.email) where ai.provider='email')::int identities
    `;
    if (app_users !== auth_users || app_users !== identities)
      throw new Error(`Auth reconciliation failed: app=${app_users}, auth=${auth_users}, identities=${identities}`);
    console.log(`Supabase Auth migration: PASS (${auth_users} users)`);
  } finally {
    await sql.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
