import { Navigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth()
  if (loading) return null
  if (role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
