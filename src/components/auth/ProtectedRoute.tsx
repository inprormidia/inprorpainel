import { Navigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--paper)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--brand)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (!session) return <Navigate to="/signin" replace />
  return <>{children}</>
}
