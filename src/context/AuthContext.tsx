import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Role = "admin" | "agency" | "client"

interface ClientOption { id: string; name: string; active: boolean; }

export interface TeamMember {
  id: string; user_id: string | null; name: string;
  email: string | null; role_title: string | null;
  color: string | null; active: boolean;
  modules?: string[] | null;
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
  myModules: string[] | null
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
  myModules: null,
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
    if (role !== "admin" && role !== "agency") { setAdminClients([]); setAdminClientId(null); return }
    // para a equipe, a policy de clients ja devolve somente os clientes atribuidos
    supabase.from("clients").select("id, name, active").order("name")
      .then(({ data }) => { setAdminClients((data as ClientOption[]) ?? []) })
  }, [role])

  // Equipe: usada para atribuir tarefas e para o atalho "minhas tarefas"
  const reloadTeam = async () => {
    const { data } = await supabase
      .from("team_members")
      .select("id,user_id,name,email,role_title,color,active,modules")
      .order("name")
    setTeam((data as TeamMember[]) ?? [])
  }

  useEffect(() => {
    if (!session?.user?.id) { setTeam([]); return }
    reloadTeam()
  }, [session?.user?.id])

  const meMember  = team.find(m => m.user_id === session?.user?.id)
  const myMemberId = meMember?.id ?? null
  // admin nao tem restricao de modulo; equipe usa o que foi liberado
  const myModules = role === "agency" ? (meMember?.modules ?? []) : null

  const signOut = async () => {
    await supabase.auth.signOut()
    setRole(null); setClientId(null); setAdminClientId(null)
    setAdminClients([]); setClientModules(null); setTeam([])
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, role, clientId, clientModules,
      loading, signOut, adminClientId, setAdminClientId, adminClients,
      team, myMemberId, myModules, reloadTeam,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export function useClientScope() {
  const { role, clientId, loading, adminClientId, setAdminClientId, adminClients,
          team, myMemberId, myModules, reloadTeam } = useAuth()
  const isAdmin  = role === "admin"
  const isAgency = role === "agency"
  return {
    isAdmin,
    isAgency,
    // admin e equipe escolhem o cliente; o restaurante ve apenas o proprio
    isStaff: isAdmin || isAgency,
    canSeeModule: (m: string) => isAdmin || (myModules?.includes(m) ?? false),
    myModules,
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
