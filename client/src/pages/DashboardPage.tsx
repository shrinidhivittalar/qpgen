import { useAuth } from '../hooks/useAuth';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-gray-800">Teacher Dashboard</h1>
      <p className="text-gray-500">Welcome, {user?.name}</p>
      <button onClick={logout} className="text-sm text-indigo-600 hover:underline">Sign out</button>
    </div>
  );
}
