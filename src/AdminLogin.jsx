import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { neonApi } from './neonApi'

function AdminLogin({ onLogin }) {
  const { name: urlName } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passphraseHint, setPassphraseHint] = useState('')
  const [showUnauthorizedMessage, setShowUnauthorizedMessage] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [nameError, setNameError] = useState(false)
  const [loading, setLoading] = useState(false)

  // If we're on the passphrase step, decode name and validate
  useEffect(() => {
    if (urlName) {
      try {
        // Decode URL-encoded base64 string first, then decode base64
        const base64Name = decodeURIComponent(urlName)
        const decodedName = decodeURIComponent(escape(atob(base64Name)))
        setName(decodedName)
        // Validate name and get passphrase hint
        validateNameForPassphrase(decodedName)
      } catch (error) {
        // If decoding fails, redirect back to admin login
        console.error('Error decoding name from URL:', error)
        navigate('/admin/login', { replace: true })
      }
    }
  }, [urlName, navigate])

  const validateNameForPassphrase = async (nameToValidate) => {
    try {
      const data = await neonApi.validateAdminName(nameToValidate)
      if (data.valid) {
        setPassphraseHint(data.passphraseHint || '')
        setNameError(false)
      } else {
        // Invalid name in URL, redirect back to admin login
        navigate('/admin/login', { replace: true })
      }
    } catch (error) {
      console.error('Error validating admin name:', error)
      navigate('/admin/login', { replace: true })
    }
  }

  const handleNameSubmit = async (e) => {
    e.preventDefault()
    setNameError(false)
    
    try {
      const data = await neonApi.validateAdminName(name)
      
      if (data.valid) {
        // Generate unique login URL from name (base64 encoded to obscure the name)
        const base64Name = btoa(unescape(encodeURIComponent(name)))
        // URL-encode the base64 string to handle special characters in URLs
        const encodedName = encodeURIComponent(base64Name)
        navigate(`/admin/login/${encodedName}`, { replace: true })
      } else {
        setNameError(true)
        setName('')
      }
    } catch (error) {
      console.error('Error validating admin name:', error)
      setNameError(true)
      setName('')
    }
  }

  const handlePassphraseSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setShowUnauthorizedMessage(false)
    
    try {
      const data = await neonApi.authenticateAdmin(name, password, null, navigator.userAgent)
      
      if (data.success) {
        // Authentication successful (authenticateAdmin already checks for admin status)
        setShowUnauthorizedMessage(false)
        onLogin(data.user)
        navigate('/admin', { replace: true })
      } else {
        // Authentication failed
        setFailedAttempts(prev => prev + 1)
        setShowUnauthorizedMessage(true)
        setPassword('')
      }
    } catch (error) {
      console.error('Login error:', error)
      setFailedAttempts(prev => prev + 1)
      setShowUnauthorizedMessage(true)
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  // Full screen lockout after 5 failed attempts
  if (failedAttempts >= 5) {
    return (
      <div className="admin-login-container">
        <div className="admin-logo">
          <h1>Unauthorized Access</h1>
          <div className="admin-error-message">
            Multiple failed login attempts detected. Admin access has been restricted.
          </div>
        </div>
      </div>
    )
  }

  // If we're on the passphrase step (has URL name)
  if (urlName) {
    return (
      <div className="admin-login-container">
        <div className="admin-logo">
          <h1>Admin Access</h1>
          <p>Administrative Dashboard</p>
        </div>
        <form onSubmit={handlePassphraseSubmit} className="admin-login-form">
          <div className="form-group">
            <label htmlFor="admin-password">Enter your passphrase</label>
            <input
              type="text"
              id="admin-password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passphraseHint}
              autoComplete="current-password"
              required
              disabled={loading}
            />
            {showUnauthorizedMessage && (
              <div className="helper-error">
                Invalid credentials or insufficient privileges.
              </div>
            )}
          </div>
          <button type="submit" className="admin-login-button" disabled={loading}>
            {loading ? 'Authenticating...' : 'Access Admin Panel'}
          </button>
        </form>
      </div>
    )
  }

  // Name entry step (admin login home page)
  return (
    <div className="admin-login-container">
      <div className="admin-logo">
        <h1>Admin Access</h1>
        <p>Administrative Dashboard</p>
      </div>
      <form onSubmit={handleNameSubmit} className="admin-login-form">
        <div className="form-group">
          <label htmlFor="admin-name">Enter your full name</label>
          <input
            type="text"
            id="admin-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First Last"
            autoComplete="name"
            required
            autoFocus
          />
          {nameError && (
            <div className="helper-error">
              Admin not found. Please enter your full name (first and last).
            </div>
          )}
        </div>
        <button type="submit" className="admin-login-button">
          Continue
        </button>
      </form>
    </div>
  )
}

export default AdminLogin
