import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { neonApi } from './neonApi'

function Login({ onLogin }) {
  const { alias: urlAlias } = useParams()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [loginError, setLoginError] = useState(false)

  useEffect(() => {
    if (urlAlias) {
      try {
        const base64Alias = decodeURIComponent(urlAlias)
        const decodedAlias = decodeURIComponent(escape(atob(base64Alias)))
        signIn(decodedAlias)
      } catch (error) {
        console.error('Error decoding login token from URL:', error)
        navigate('/', { replace: true })
      }
    }
  }, [urlAlias])

  const signIn = async (identifier) => {
    try {
      const trimmed = identifier.trim()
      let data = await neonApi.signInByName(trimmed, navigator.userAgent)
      if (!data.success) {
        data = await neonApi.signInByAlias(trimmed, navigator.userAgent)
      }
      if (data.success) {
        onLogin(data.user)
        navigate('/dashboard', { replace: true })
      } else {
        setLoginError(true)
        navigate('/', { replace: true })
      }
    } catch (error) {
      console.error('Sign-in error:', error)
      setLoginError(true)
      navigate('/', { replace: true })
    }
  }

  const handleNameSubmit = async (e) => {
    e.preventDefault()
    setNameError(false)
    setLoginError(false)

    if (fullName.trim().split(/\s+/).filter(Boolean).length < 2) {
      setNameError(true)
      return
    }

    const base64Identifier = btoa(unescape(encodeURIComponent(fullName)))
    const encodedIdentifier = encodeURIComponent(base64Identifier)
    navigate(`/login/${encodedIdentifier}`, { replace: true })
  }

  return (
    <div className="login-container">
      <div className="logo">
        <h1>Press me, I talk!</h1>
        <p>A Daw Industries game product</p>
      </div>
      <form onSubmit={handleNameSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="fullName">Enter your name</label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
            required
            autoFocus
          />
          {nameError && (
            <div className="helper-error">
              Use your full name (first and last).
            </div>
          )}
          {loginError && (
            <div className="helper-error">
              Name not recognized. Check spelling or ask a host.
            </div>
          )}
        </div>
        <button type="submit" className="login-button">
          Continue
        </button>
      </form>
    </div>
  )
}

export default Login
