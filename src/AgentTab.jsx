import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAdmin } from './utils/admin.js'

function AgentTab({ agentName, firstName, lastName, currentUser, onLogout }) {
  const navigate = useNavigate()
  const [agentNameVisible, setAgentNameVisible] = useState(false)
  const [realNameVisible, setRealNameVisible] = useState(false)

  useEffect(() => {
    if (agentNameVisible) {
      const timer = setTimeout(() => setAgentNameVisible(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [agentNameVisible])

  useEffect(() => {
    if (realNameVisible) {
      const timer = setTimeout(() => setRealNameVisible(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [realNameVisible])

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
        <h3>Classified</h3>
        <h4>Reveal to trusted associates only</h4>

        <div className="field-group">
          <div className="field-label">Agent</div>
          <div className={`field-row ${agentNameVisible ? 'visible' : 'hidden'}`}>
            <span>{agentName}</span>
            <button onClick={() => setAgentNameVisible(!agentNameVisible)} className="toggle-button">
              {agentNameVisible ? <EyeOpen /> : <EyeClosed />}
              <span className="button-text">{agentNameVisible ? 'hide' : 'reveal'}</span>
            </button>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">AKA</div>
          <div className={`field-row ${realNameVisible ? 'visible' : 'hidden'}`}>
            <span>{firstName} {lastName}</span>
            <button onClick={() => setRealNameVisible(!realNameVisible)} className="toggle-button">
              {realNameVisible ? <EyeOpen /> : <EyeClosed />}
              <span className="button-text">{realNameVisible ? 'hide' : 'reveal'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="backstory-card">
        <h3>Briefing</h3>
        <p>We've been following the movements of a mysterious hacker known as <strong>TH33_HACKERG0D</strong> and have reason to believe they are planning to detonate a doomsday device at some point on the evening of Saturday, May 16.</p>
        <p>The device itself is located somewhere on the premises of <strong>MacGuffin Toys</strong>. You will be infiltrating the environment as part of their annual company party.</p>
        <p>Initial intelligence suggests the company's employees are not very bright.</p>
        <p>Your mission is to determine the location of this doomsday device and disable it. We've prepared a series of smaller missions that will help you maintain cover and locate the device. You can do missions in any order.</p>
        <p>Due to the severity of the threat, we may have sent a few too many agents to retrieve the device. If you see a fellow agent in disguise, please be respectful and do not blow their cover. Sign off on missions if they ask.</p>
        <p>Good luck, have fun, and don't get caught.</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {isAdmin(currentUser) && (
          <button
            onClick={() => navigate('/admin/login')}
            className="admin-button button-min"
            style={{ marginRight: '10px' }}
          >
            ADMIN
          </button>
        )}
        <button onClick={onLogout} className="logout-button button-min">LOGOUT</button>
      </div>
    </div>
  )
}

export default AgentTab
