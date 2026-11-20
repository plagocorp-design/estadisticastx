import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { accesoDe, accesoJson, type Role } from "@/lib/team.public";

const TEAM: { slug: string; name: string; email: string; password: string; role: Role }[] = [
  { slug: "david", name: "David Jaimes", email: "david@vinculalibre.app", password: "David2026", role: "lider" },
  { slug: "alison", name: "Alison Moreno", email: "alison@vinculalibre.app", password: "Alison2026", role: "asesor" },
  { slug: "patricia", name: "Patricia", email: "patricia@vinculalibre.app", password: "Patricia2026", role: "asesor" },
  { slug: "laura", name: "Laura", email: "laura@vinculalibre.app", password: "Laura2026", role: "asesor" },
  { slug: "jose", name: "José", email: "jose@vinculalibre.app", password: "Jose2026", role: "asesor" },
  { slug: "viviana", name: "Viviana", email: "viviana@vinculalibre.app", password: "Viviana2026", role: "coordinadora" },
  { slug: "estefania", name: "Estefanía", email: "estefania@vinculalibre.app", password: "Estefania2026", role: "coordinadora" },
  { slug: "franz", name: "Franz", email: "franz@vinculalibre.app", password: "Franz2026", role: "coordinadora" },
  { slug: "asiyade", name: "Asiyade", email: "asiyade@vinculalibre.app", password: "Asiyade2026", role: "coordinadora" },
  { slug: "pablo", name: "Pablo", email: "pablo@vinculalibre.app", password: "Pablo2026", role: "coordinadora" },
  { slug: "gerencia", name: "Gerencia Taxis Libres", email: "gerencia@vinculalibre.app", password: "TaxisLibres#Pais2026", role: "gerencia" },
];

export type { Role };

export async function ensureTeamAccounts() {
  const sql = await getSql();
  for (const person of TEAM) {
    const found = await sql<{ id: string }>`select id from "user" where email = ${person.email}`;
    if (found.length === 0) {
      await auth.api.signUpEmail({
        body: { email: person.email, password: person.password, name: person.name },
      });
    }
    await sql`
      insert into profiles (user_id, slug, name, role)
      select id, ${person.slug}, ${person.name}, ${person.role}
      from "user" where email = ${person.email}
      on conflict (user_id) do update set
        name = excluded.name,
        slug = excluded.slug,
        role = case when excluded.role = 'gerencia' then excluded.role else profiles.role end
    `;
    await sql`
      insert into claves_equipo (user_id, clave)
      select id, ${person.password} from "user" where email = ${person.email}
      on conflict (user_id) do nothing
    `;
  }
}

export async function profileFor(userId: string) {
  const sql = await getSql();
  await sql.query(`alter table profiles add column if not exists acceso text not null default ''`);
  const rows = await sql<{ user_id: string; slug: string; name: string; role: Role; ciudad_id: number | null; ciudad_vista: number | null; acceso: string }>`
    select user_id, slug, name, role, ciudad_id, ciudad_vista, coalesce(acceso, '') as acceso from profiles where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.slug === "david" || row.role === "gerencia") {
    const rol: Role = row.role === "gerencia" ? "gerencia" : "lider";
    const completo = accesoJson(accesoDe(rol, ""));
    if (row.role !== rol || (row.acceso ?? "") !== completo) {
      await sql.query(`update profiles set role = $1, acceso = $2 where user_id = $3`, [rol, completo, row.user_id]);
      row.role = rol;
      row.acceso = completo;
    }
  }
  return row;
}

export function emailForSlug(slug: string) {
  return TEAM.find((p) => p.slug === slug)?.email ?? null;
}