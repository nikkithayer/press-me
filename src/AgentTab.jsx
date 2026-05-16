import { useState, useEffect } from 'react'
import { neonApi } from './neonApi'

function AgentTab({ currentUser }) {
  const [passphraseVisible, setPassphraseVisible] = useState(false)
  const [passphrase, setPassphrase] = useState(currentUser?.passphrase || null)

  useEffect(() => {
    if (!passphrase && currentUser?.id) {
      neonApi.getUserPassphrase(currentUser.id).then(p => {
        if (p) {
          setPassphrase(p)
          const stored = JSON.parse(localStorage.getItem('spyUser') || '{}')
          stored.passphrase = p
          localStorage.setItem('spyUser', JSON.stringify(stored))
        }
      }).catch(() => {})
    }
  }, [currentUser?.id, passphrase])

  useEffect(() => {
    if (passphraseVisible) {
      const timer = setTimeout(() => setPassphraseVisible(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [passphraseVisible])

  const EyeOpen = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
    </svg>
  )

  const EyeClosed = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>
    </svg>
  )

  return (
    <div className="tab-content">
      <div className="agent-card">
        <div className="passphrase-field">
          <div className={`passphrase-value ${passphraseVisible ? 'revealed' : 'concealed'}`}>
            {passphraseVisible ? (passphrase || '…') : 'PASSPHRASE'}
          </div>
          <button type="button" onClick={() => setPassphraseVisible(!passphraseVisible)} className="toggle-button">
            {passphraseVisible ? <EyeOpen /> : <EyeClosed />}
            <span className="button-text">{passphraseVisible ? 'hide' : 'reveal'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AgentTab
