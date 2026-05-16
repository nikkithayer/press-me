import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { neonApi } from './neonApi'

function Login({ onLogin }) {
  const { alias: urlAlias } = useParams()
  const navigate = useNavigate()
  const [alias, setAlias] = useState('')
  const [aliasError, setAliasError] = useState(false)
  const [loginError, setLoginError] = useState(false)

  useEffect(() => {
    if (urlAlias) {
      try {
        const base64Alias = decodeURIComponent(urlAlias)
        const decodedAlias = decodeURIComponent(escape(atob(base64Alias)))
        signIn(decodedAlias)
      } catch (error) {
        console.error('Error decoding alias from URL:', error)
        navigate('/', { replace: true })
      }
    }
  }, [urlAlias])

  const signIn = async (aliasToSignIn) => {
    try {
      const data = await neonApi.signInByAlias(aliasToSignIn, navigator.userAgent)
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

  const handleAliasSubmit = async (e) => {
    e.preventDefault()
    setAliasError(false)
    setLoginError(false)

    const base64Alias = btoa(unescape(encodeURIComponent(alias)))
    const encodedAlias = encodeURIComponent(base64Alias)
    navigate(`/login/${encodedAlias}`, { replace: true })
  }

  return (
    <div className="login-container">
      <div className="logo">
        <h1>Press me, I talk!</h1>
        <p>A Daw Industries game product</p>
      </div>
      <form onSubmit={handleAliasSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="alias">Enter your alias</label>
          <input
            type="text"
            id="alias"
            name="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Your alias"
            autoComplete="username"
            required
            autoFocus
          />
          {aliasError && (
            <div className="helper-error">
              Invalid alias.
            </div>
          )}
          {loginError && (
            <div className="helper-error">
              Alias not recognized. Check with a host.
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
