import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from './db'
import { teams, teamMembers, users } from './schema'
import type { Team } from './schema'

export type TeamMemberView = {
  user_id: string
  email: string
  created_at: Date
}

export type TeamView = {
  id: string
  name: string
  created_at: Date
  members: TeamMemberView[]
}

export async function getLiveTeam(orgId: string, teamId: string): Promise<Team | null> {
  const rows = await db.select().from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.org_id, orgId), isNull(teams.deleted_at)))
    .limit(1)
  return rows[0] ?? null
}

// Team membership is org-internal and visible to every org member; only
// grant management stays admin-scoped.
export async function listOrgTeams(orgId: string): Promise<TeamView[]> {
  const teamRows = await db.select().from(teams)
    .where(and(eq(teams.org_id, orgId), isNull(teams.deleted_at)))
  if (teamRows.length === 0) return []

  const memberRows = await db.select({
    team_id: teamMembers.team_id,
    user_id: teamMembers.user_id,
    email: users.email,
    created_at: teamMembers.created_at,
  }).from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.user_id))
    .where(inArray(teamMembers.team_id, teamRows.map((t) => t.id)))

  return teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    created_at: t.created_at,
    members: memberRows
      .filter((m) => m.team_id === t.id)
      .map(({ user_id, email, created_at }) => ({ user_id, email, created_at })),
  }))
}
