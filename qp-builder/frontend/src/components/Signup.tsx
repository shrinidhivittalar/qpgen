import React, { useState } from 'react'
import { signup } from '../api'

interface Props {
  onSignupSuccess: (token: string, user: { username: string; role: 'Admin' | 'Teacher' | 'Viewer' }) => void
  onGoToLogin: () => void
}

export function Signup({ onSignupSuccess, onGoToLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'Admin' | 'Teacher' | 'Viewer'>('Teacher')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Real-time password validation states
  const isMinLength = password.length >= 8
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isMinLength || !hasLetter || !hasNumber) {
      setError('Password does not meet the safety requirements')
      return
    }

    setLoading(true)
    try {
      const data = await signup(username, password, role)
      onSignupSuccess(data.token, data.user)
    } catch (err: any) {
      setError(err.message || 'Signup failed')
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
          <h2 className="text-xl font-medium tracking-tight text-stone-900">Create an account</h2>
          <p className="text-sm text-stone-500 mt-1.5">Sign up to start building question papers</p>
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
              placeholder="choose a username"
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5" htmlFor="role">
              Account Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-all"
            >
              <option value="Teacher">Teacher (Build, configure, generate papers)</option>
              <option value="Admin">Admin (Full management control)</option>
              <option value="Viewer">Viewer (Read-only browsing)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="create a password"
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-all"
            />
            {/* Real-time Validation UI */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={isMinLength ? 'text-green-600' : 'text-stone-400'}>
                  {isMinLength ? '✓' : '•'} At least 8 characters
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={hasLetter ? 'text-green-600' : 'text-stone-400'}>
                  {hasLetter ? '✓' : '•'} Contains a letter
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={hasNumber ? 'text-green-600' : 'text-stone-400'}>
                  {hasNumber ? '✓' : '•'} Contains a number
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 focus:ring-offset-[#f5f3ef] flex items-center justify-center"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-stone-500">
            Already have an account?{' '}
            <button
              onClick={onGoToLogin}
              className="text-stone-900 font-medium hover:underline focus:outline-none"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
