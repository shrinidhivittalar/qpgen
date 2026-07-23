import React, { useState } from 'react'
import { login, type User } from '../api'

interface Props {
  onLoginSuccess: (token: string, user: User) => void
  onGoToSignup: () => void
}

export function Login({ onLoginSuccess, onGoToSignup }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const data = await login(username, password)
      onLoginSuccess(data.token, data.user)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f3ef] font-sans antialiased text-stone-900 px-4">
      <div className="w-full max-w-[360px]">
        {/* Brand/Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 rounded-lg bg-stone-900 flex items-center justify-center text-[#f5f3ef] font-semibold text-lg shadow-sm mb-4">
            QP
          </div>
          <h2 className="text-xl font-medium tracking-tight text-stone-900">Sign in to QP Generator</h2>
          <p className="text-sm text-stone-500 mt-1.5">Enter your details to access your dashboard</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. shrinidhiv"
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-all"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider" htmlFor="password">
                Password
              </label>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 focus:ring-offset-[#f5f3ef] flex items-center justify-center"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-stone-500">
            Don't have an account?{' '}
            <button
              onClick={onGoToSignup}
              className="text-stone-900 font-medium hover:underline focus:outline-none"
            >
              Sign up free
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
