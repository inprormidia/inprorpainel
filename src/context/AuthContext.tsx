import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Role = "admin" | "client"

interface ClientOption { id: string; name: string; active: boolean; }

export interface TeamMember {
  id: string; user_id: string | null; name: string;
  email: string | null; role_title: string | null;
  color: string | null; active: boolean;
}

interface AuthContextType {
  session: Session | null
  user: User | null
  role: Role | null
  clientId: string | null
  clientModules: string[] | null
  loading: boolean
  signOut: () => Promise<void>
  adminClientId: string | null
  setAdminClientId: (id: string | null) => void
  adminClients: ClientOption[]
  team: TeamMember[]
  myMemberId: string | null
  reloadTeam: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  clientId: null,
  clientModules: null,
  loading: true,
  signOut: async () => {},
  adminClientId: null,
  setAdminClientId: () => {},
  adminClients: [],
  team: [],
  myMemberId: null,
  reloadTeam: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminClientId, setAdminClientId] = useState<string | null>(null)
  const [adminClients, setAdminClients] = useState<ClientOption[]>([])
  const [clientModules, setClientModules] = useState<string[] | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user?.id) { setRole(null); setClientId(null); return }
    supabase
      .from("user_roles")
      .select("role, client_id")
      .eq("user_id", session.user.id)
      .single()
      .then(async ({ data }) => {
        const resolvedRole = (data?.role as Role) ?? "client"
        const resolvedClientId = data?.client_id ?? null
        setRole(resolvedRole)
        setClientId(resolvedClientId)
        if (resolvedRole === "client" && resolvedClientId) {
          const { data: clientData } = await supabase
            .from("clients")
            .select("modules")
            .eq("id", resolvedClientId)
            .single()
          setClientModules(clientData?.modules ?? null)
        }
      })
  }, [session?.user?.id])

  useEffect(() => {
    if (role !== "admin") { setAdminClients([]); setAdminClientId(null); return }
    supabase.from("clients").select("id, name, active").order("name")
      .then(({ data }) => { setAdminClients((data as ClientOption[]) ?? []) })
  }, [role])

  // Equipe: usada para atribuir tarefas e para o atalho "minhas tarefas"
  const reloadTeam = async () => {
    const { data } = await supabase
      .from("team_members")
      .select("id,user_id,name,email,role_title,color,active")
      .order("name")
    setTeam((data as TeamMember[]) ?? [])
  }

  useEffect(() => {
    if (!session?.user?.id) { setTeam([]); return }
    reloadTeam()
  }, [session?.user?.id])

  const myMemberId = team.find(m => m.user_id === session?.user?.id)?.id ?? null

  const signOut = async () => {
    await supabase.auth.signOut()
    setRole(null); setClientId(null); setAdminClientId(null)
    setAdminClients([]); setClientModules(null); setTeam([])
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, role, clientId, clientModules,
      loading, signOut, adminClientId, setAdminClientId, adminClients,
      team, myMemberId, reloadTeam,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export function useClientScope() {
  const { role, clientId, loading, adminClientId, setAdminClientId, adminClients,
          team, myMemberId, reloadTeam } = useAuth()
  return {
    isAdmin: role === "admin",
    scopedClientId: role === "client" ? clientId : adminClientId,
    authLoading: loading,
    adminClientId,
    setAdminClientId,
    adminClients,
    team,
    myMemberId,
    reloadTeam,
  }
}
