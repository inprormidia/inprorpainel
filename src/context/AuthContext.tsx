import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Role = "admin" | "client"

interface ClientOption { id: string; name: string; active: boolean; }

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
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminClientId, setAdminClientId] = useState<string | null>(null)
  const [adminClients, setAdminClients] = useState<ClientOption[]>([])
  const [clientModules, setClientModules] = useState<string[] | null>(null)

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

  const signOut = async () => {
    await supabase.auth.signOut()
    setRole(null); setClientId(null); setAdminClientId(null)
    setAdminClients([]); setClientModules(null)
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, role, clientId, clientModules,
      loading, signOut, adminClientId, setAdminClientId, adminClients,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export function useClientScope() {
  const { role, clientId, loading, adminClientId, setAdminClientId, adminClients } = useAuth()
  return {
    isAdmin: role === "admin",
    scopedClientId: role === "client" ? clientId : adminClientId,
    authLoading: loading,
    adminClientId,
    setAdminClientId,
    adminClients,
  }
}
