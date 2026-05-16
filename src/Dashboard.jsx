import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { neonApi } from './neonApi'
import { isAdmin } from './utils/admin.js'

function Dashboard({ agentName, agentId, firstName, lastName, alias1, alias2, onLogout, currentUser }) {
  const navigate = useNavigate()
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeLeft, setTimeLeft] = useState('Calculating...')
  const [successKeys, setSuccessKeys] = useState({})
  const [agentNameVisible, setAgentNameVisible] = useState(false)
  const [realNameVisible, setRealNameVisible] = useState(false)
  const [completedMissions, setCompletedMissions] = useState(new Set())
  const [activeTab, setActiveTab] = useState('missions')
  const [missionErrors, setMissionErrors] = useState({})

  // Phase mission state
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [currentPhase, setCurrentPhase] = useState(0)
  const [sessionParticipants, setSessionParticipants] = useState([])
  const [signerUserId, setSignerUserId] = useState('')
  const [signerPassphrase, setSignerPassphrase] = useState('')
  
  
  // New state for relationship and alibi
  const [relationship, setRelationship] = useState('')
  const [alibi, setAlibi] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [modalRelationship, setModalRelationship] = useState('')
  const [modalAlibi, setModalAlibi] = useState('')
  
  // Mission completion modal state
  const [showMissionModal, setShowMissionModal] = useState(false)
  const [isMissionClosing, setIsMissionClosing] = useState(false)
  const [selectedMissionId, setSelectedMissionId] = useState(null)
  const [showMissionSuccess, setShowMissionSuccess] = useState(false)
  const [showMissionFailed, setShowMissionFailed] = useState(false)
  const [missionFailedMessage, setMissionFailedMessage] = useState(null)
  const [completedBounty, setCompletedBounty] = useState(0)
  const [isInActiveSession, setIsInActiveSession] = useState(false)
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true)
 
  // Data arrays for relationships and alibis
  const relationships = [
    'a long lost childhood friend of the host',
    'a former business partner of the host',
    'the host\'s estranged sibling',
    'a college roommate of the host',
    'the host\'s ex-spouse',
    'a former colleague from the host\'s previous job',
    'the host\'s neighbor from their old apartment',
    'a member of the host\'s book club',
    'the host\'s personal trainer',
    'a friend from the host\'s hiking group'
  ]

  const alibis = [
    'the host owes you money',
    'you\'re here to collect on a bet you won',
    'you\'re delivering a package for a mutual friend',
    'you\'re here to discuss a business opportunity',
    'you\'re attending as the host\'s plus-one',
    'you\'re here to pick up something you left behind',
    'you\'re delivering a message from a mutual acquaintance',
    'you\'re here to finalize plans for an upcoming trip',
    'you\'re attending as a favor to the host',
    'you\'re here to discuss a shared investment'
  ]

  // Function to get random relationship and alibi
  const getRandomBackstory = () => {
    const randomRelationship = relationships[Math.floor(Math.random() * relationships.length)]
    const randomAlibi = alibis[Math.floor(Math.random() * alibis.length)]
    setRelationship(randomRelationship)
    setAlibi(randomAlibi)
  }

  // Modal functions
  const openModal = () => {
    setModalRelationship(relationship)
    setModalAlibi(alibi)
    setShowModal(true)
  }

  const closeModal = () => {
    setIsClosing(true)
    setTimeout(() => {
      setShowModal(false)
      setIsClosing(false)
    }, 300)
  }

  const openMissionModal = (missionId) => {
    setSelectedMissionId(missionId)
    setShowMissionModal(true)
    setShowMissionSuccess(false)
    setShowMissionFailed(false)
    setMissionErrors(prev => ({ ...prev, [missionId]: '' }))
    setMissionFailedMessage(null)
    setCompletedBounty(0)

    const mission = missions.find(m => m.playerMissionId === missionId)
    if (mission && mission.completed && !mission.bountyPaid && mission.bounty > 0) {
      setShowMissionSuccess(true)
      setCompletedBounty(mission.bounty)
    }
  }


  const closeMissionModal = () => {
    setIsMissionClosing(true)
    setTimeout(() => {
      setShowMissionModal(false)
      setIsMissionClosing(false)
      setSelectedMissionId(null)
      setShowMissionSuccess(false)
      setShowMissionFailed(false)
      setMissionFailedMessage(null)
      setCompletedBounty(0)
    }, 300)
  }

  const saveModal = () => {
    setRelationship(modalRelationship)
    setAlibi(modalAlibi)
    closeModal()
  }

  const clearRelationship = () => {
    setModalRelationship('')
  }

  const clearAlibi = () => {
    setModalAlibi('')
  }

  // Check if user is in active session
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        setSessionCheckLoading(true)
        const activeSession = await neonApi.getActiveSession()
        if (activeSession && activeSession.participant_user_ids) {
          const agentIdNum = Number(agentId)
          const participantIds = activeSession.participant_user_ids.map(id => Number(id))
          const userInSession = participantIds.includes(agentIdNum)
          setIsInActiveSession(userInSession)
          setActiveSessionId(activeSession.id)
          setCurrentPhase(activeSession.current_phase || 0)

          if (userInSession) {
            const participants = await neonApi.getSessionParticipants(activeSession.id)
            setSessionParticipants(participants.filter(p => p.id !== agentIdNum))
          } else {
            setMissions([])
            setLoading(false)
          }
        } else {
          setIsInActiveSession(false)
          setActiveSessionId(null)
          setCurrentPhase(0)
          setMissions([])
          setLoading(false)
        }
      } catch (error) {
        console.error('Error checking active session:', error)
        setIsInActiveSession(false)
        setActiveSessionId(null)
        setMissions([])
        setLoading(false)
      } finally {
        setSessionCheckLoading(false)
      }
    }

    checkActiveSession()
    getRandomBackstory()
  }, [agentId])

  useEffect(() => {
    if (isInActiveSession && !sessionCheckLoading && activeSessionId) {
      fetchRandomMissions()
    } else if (!isInActiveSession) {
      setError(null)
    }
  }, [agentId, isInActiveSession, sessionCheckLoading, activeSessionId])

  // Clear error when missions are successfully loaded
  useEffect(() => {
    if (missions.length > 0 || (!loading && !sessionCheckLoading)) {
      setError(null)
    }
  }, [missions, loading, sessionCheckLoading])

  // Auto-hide revealed items after 3 seconds
  useEffect(() => {
    if (agentNameVisible) {
      const timer = setTimeout(() => {
        setAgentNameVisible(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [agentNameVisible])

  useEffect(() => {
    if (realNameVisible) {
      const timer = setTimeout(() => {
        setRealNameVisible(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [realNameVisible])






  // Periodically check if user is still in active session
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const activeSession = await neonApi.getActiveSession()
        if (activeSession && activeSession.participant_user_ids) {
          const userInSession = activeSession.participant_user_ids.includes(agentId)
          if (userInSession !== isInActiveSession) {
            setIsInActiveSession(userInSession)
            if (!userInSession) {
              setMissions([])
            }
          }

          setActiveSessionId(activeSession.id)
          if (activeSession.current_phase !== undefined) {
            setCurrentPhase(activeSession.current_phase)
          }
        } else {
          if (isInActiveSession) {
            setIsInActiveSession(false)
            setMissions([])
          }
        }
      } catch (error) {
        console.error('Error checking session status:', error)
      }
    }, 10000)
    
    return () => clearInterval(interval)
  }, [agentId, isInActiveSession])

  useEffect(() => {
    if (!isInActiveSession || !activeSessionId) return

    const checkMissions = async () => {
      try {
        const playerMissions = await neonApi.getPlayerMissions(activeSessionId, agentId)
        setError(null)

        if (playerMissions && playerMissions.length > 0) {
          setCurrentPhase(playerMissions[0].currentPhase || 0)
        }

        setMissions(playerMissions || [])
        const completedSet = new Set(
          (playerMissions || []).filter(m => m.completed).map(m => m.playerMissionId)
        )
        setCompletedMissions(completedSet)
      } catch (error) {
        if (error && error.message && !error.message.includes('session')) {
          console.error('[AUTO-CHECK] Error checking missions:', error)
        }
      }
    }

    const interval = setInterval(checkMissions, 5000)
    return () => clearInterval(interval)
  }, [agentId, isInActiveSession, activeSessionId])

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      if (missions.length > 0 && missions[0].mission_expires) {
        const now = new Date()
        const expiry = new Date(missions[0].mission_expires)
        const diffMs = expiry - now
        
        if (diffMs <= 0) {
          setTimeLeft('MISSIONS EXPIRED')
        } else {
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
          const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000)
          
          if (diffHours > 0) {
            setTimeLeft(`${diffHours}h ${diffMinutes}m ${diffSeconds}s remaining`)
          } else if (diffMinutes > 0) {
            setTimeLeft(`${diffMinutes}m ${diffSeconds}s remaining`)
          } else {
            setTimeLeft(`${diffSeconds}s remaining`)
          }
        }
      } else {
        setTimeLeft('No active missions')
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [missions])

  const fetchRandomMissions = async () => {
    try {
      setLoading(true)
      setError(null)

      if (!activeSessionId) {
        setMissions([])
        return
      }

      const playerMissions = await neonApi.getPlayerMissions(activeSessionId, agentId)
      setMissions(playerMissions || [])

      if (playerMissions && playerMissions.length > 0) {
        setCurrentPhase(playerMissions[0].currentPhase || 0)
      }

      const completedSet = new Set(
        (playerMissions || []).filter(m => m.completed).map(m => m.playerMissionId)
      )
      setCompletedMissions(completedSet)
      setSuccessKeys({})
      setMissionErrors({})
    } catch (error) {
      console.error('Error fetching missions:', error)
      if (error && error.message) {
        setError('Failed to fetch missions: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    onLogout()
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (showModal) {
      closeModal()
    }
    if (showMissionModal) {
      closeMissionModal()
    }
  }

  const handleSuccessKeyChange = (playerMissionId, value) => {
    setSuccessKeys(prev => ({
      ...prev,
      [playerMissionId]: value
    }))
    if (missionErrors[playerMissionId]) {
      setMissionErrors(prev => ({ ...prev, [playerMissionId]: '' }))
    }
  }

  const handleSubmitMission = async (playerMissionId) => {
    const mission = missions.find(m => m.playerMissionId === playerMissionId)
    if (!mission) {
      setMissionErrors(prev => ({ ...prev, [playerMissionId]: 'Mission not found' }))
      return
    }

    setMissionErrors(prev => ({ ...prev, [playerMissionId]: '' }))
    setShowMissionSuccess(false)

    try {
      let result

      if (mission.completionType === 'phrase') {
        const answer = successKeys[playerMissionId]
        if (!answer) return
        result = await neonApi.completePhaseMission(playerMissionId, answer, agentId)
      } else if (mission.completionType === 'signoff') {
        if (!signerUserId || !signerPassphrase) {
          setMissionErrors(prev => ({ ...prev, [playerMissionId]: 'Select a signer and enter their passphrase' }))
          return
        }
        result = await neonApi.signOffMission(playerMissionId, parseInt(signerUserId), signerPassphrase)
      }

      setCompletedMissions(prev => new Set([...prev, playerMissionId]))
      setSuccessKeys(prev => {
        const newKeys = { ...prev }
        delete newKeys[playerMissionId]
        return newKeys
      })
      setSignerUserId('')
      setSignerPassphrase('')

      if (result.bounty > 0) {
        setCompletedBounty(result.bounty)
      }

      if (selectedMissionId === playerMissionId) {
        setShowMissionSuccess(true)
        setShowMissionFailed(false)
        setMissionErrors(prev => ({ ...prev, [playerMissionId]: '' }))
      }
    } catch (error) {
      console.error('Error completing mission:', error)
      setMissionErrors(prev => ({ ...prev, [playerMissionId]: error.message || 'Failed to complete mission. Please try again.' }))
      setShowMissionSuccess(false)
    }
  }

  const handleMarkBountyPaid = async (playerMissionId) => {
    try {
      await neonApi.markBountyPaid(playerMissionId)
      setMissions(prev => prev.map(m =>
        m.playerMissionId === playerMissionId ? { ...m, bountyPaid: true } : m
      ))
      setCompletedBounty(0)
      closeMissionModal()
    } catch (error) {
      console.error('Error marking bounty paid:', error)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="dashboard-tabs">
            <button 
              className={`tab-button tab-agent ${activeTab === 'agent' ? 'active' : ''}`}
              onClick={() => handleTabChange('agent')}
            >
              AGENT
            </button>
            <button 
              className={`tab-button tab-missions ${activeTab === 'missions' ? 'active' : ''}`}
              onClick={() => handleTabChange('missions')}
            >
              MISSIONS
            </button>
          </div>
        </div>
        <div className={`dashboard-content dashboard-content-${activeTab}`}>
          <div className="tab-content">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>LOADING MISSION DATA...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="dashboard-tabs">
            <button 
              className={`tab-button tab-agent ${activeTab === 'agent' ? 'active' : ''}`}
              onClick={() => handleTabChange('agent')}
            >
              Agent
            </button>
            <button 
              className={`tab-button tab-missions ${activeTab === 'missions' ? 'active' : ''}`}
              onClick={() => handleTabChange('missions')}
            >
              Missions
            </button>
          </div>
        </div>
        <div className={`dashboard-content dashboard-content-${activeTab}`}>
          <div className="tab-content">
          <h1>ERROR</h1>
          <p>{error}</p>
            <div className="tab-actions">
          <button onClick={fetchRandomMissions} className="retry-button">
            RETRY
          </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
        <div className="dashboard-header">
        <div className="dashboard-tabs">
          <button 
            className={`tab-button tab-agent ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => handleTabChange('agent')}
          >
            AGENT
          </button>
          <button 
            className={`tab-button tab-missions ${activeTab === 'missions' ? 'active' : ''}`}
            onClick={() => handleTabChange('missions')}
          >
            MISSIONS
          </button>
        </div>
        </div>

      <div className={`dashboard-content dashboard-content-${activeTab}`}>
        {activeTab === 'agent' && (
          <div className="tab-content">
            <div className="agent-card">
              <h3>Classified</h3>
              <h4>Reveal to trusted associates only</h4>
              
              <div className="field-group">
                <div className="field-label">Agent</div>
                <div className={`field-row ${agentNameVisible ? 'visible' : 'hidden'}`}>
                  <span>{agentName}</span>
                  <button onClick={() => setAgentNameVisible(!agentNameVisible)} className="toggle-button">
                    {agentNameVisible ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>
                      </svg>
                    )}
                    <span className="button-text">{agentNameVisible ? 'hide' : 'reveal'}</span>
                    </button>
                </div>
              </div>
              
              <div className="field-group">
                <div className="field-label">AKA</div>
                <div className={`field-row ${realNameVisible ? 'visible' : 'hidden'}`}>
                  <span>{firstName} {lastName}</span>
                  <button onClick={() => setRealNameVisible(!realNameVisible)} className="toggle-button">
                    {realNameVisible ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>
                      </svg>
                    )}
                    <span className="button-text">{realNameVisible ? 'hide' : 'reveal'}</span>
                    </button>
                </div>
              </div>
              
            </div>
            <div className="backstory-card">
              <h3>Cover story</h3>
              <p>You are {firstName} {lastName}, <span className="relationship">{relationship}</span>. You are here tonight because <span className="alibi">{alibi}</span>.</p>
              <div className="backstory-buttons">
                <button onClick={getRandomBackstory} className="reroll-button">
                  Shuffle
                </button>
                <button onClick={openModal} className="write-your-own-button">
                  Write your own
                </button>
              </div>
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
              <button onClick={handleLogout} className="logout-button button-min">
                LOGOUT
              </button>
            </div>
          </div>
        )}

        {activeTab === 'missions' && (
          <div className="tab-content">
            {!isInActiveSession ? (
              <div className="no-session-message">
                <h2>THE PARTY HASN'T STARTED YET</h2>
                <p>Wait for the host to start a session. Once a session is active, your missions will appear here.</p>
              </div>
            ) : (
              <>
                {[0, 1, 2, 3].map(phase => {
                  const phaseMissions = missions.filter(m => m.phase === phase)
                  if (phaseMissions.length === 0) return null
                  const isLocked = phase < currentPhase
                  const isCurrent = phase === currentPhase

                  return (
                    <div key={phase} style={{ marginBottom: '16px' }}>
                      <div className="missions-grid">
                        {phaseMissions
                          .filter(m => !completedMissions.has(m.playerMissionId))
                          .map(mission => (
                            <div
                              key={mission.playerMissionId}
                              className={`mission-card ${!isLocked ? 'clickable' : ''}`}
                              onClick={() => !isLocked && openMissionModal(mission.playerMissionId)}
                              style={{ opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}
                            >
                              <div className="mission-header">
                                <h3>{mission.title}</h3>
                                {mission.bounty > 0 && (
                                  <span style={{ fontSize: '0.75em', color: '#b8860b', fontWeight: 'bold' }}>{mission.bounty}pts</span>
                                )}
                              </div>
                              <p style={{ whiteSpace: 'pre-line' }}>{mission.missionBody}</p>
                            </div>
                          ))}
                      </div>

                      {phaseMissions.some(m => completedMissions.has(m.playerMissionId)) && (
                        <div className="completed-missions">
                          <ul>
                            {phaseMissions
                              .filter(m => completedMissions.has(m.playerMissionId))
                              .map(mission => (
                                <li
                                  key={mission.playerMissionId}
                                  onClick={() => openMissionModal(mission.playerMissionId)}
                                  style={{ cursor: 'pointer', textDecoration: 'underline', position: 'relative', display: 'inline-block' }}
                                >
                                  {mission.title}
                                  {mission.bountyPaid && mission.bounty > 0 && (
                                    <span className="paid-stamp">PAID</span>
                                  )}
                                  {mission.completed && !mission.bountyPaid && mission.bounty > 0 && (
                                    <span style={{ marginLeft: '6px', color: '#b8860b', fontWeight: 'bold', fontSize: '0.85em' }}>({mission.bounty}pts)</span>
                                  )}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

      </div>

      {/* Modal */}
        {showModal && (
          <div className={`modal ${isClosing ? 'closing' : ''}`}>
            <div className="modal-header">
              <button onClick={closeModal} className="close-button">
                Close
              </button>
        </div>

            <div className="modal-content">
              <h2>Write Your Own!</h2>
              
              <div className="field-group">
                <label htmlFor="relationship-field">Relationship</label>
                <div className="input-with-clear">
                  <textarea
                    id="relationship-field"
                    type="text"
                    value={modalRelationship}
                    onChange={(e) => setModalRelationship(e.target.value)}
                    placeholder="Enter your relationship to the host..."
                  />
                  <button onClick={clearRelationship} className="clear-button">
                    <img src="/svgs/X.svg" alt="Clear" />
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="alibi-field">Alibi</label>
                <div className="input-with-clear">
                  <textarea
                    id="alibi-field"
                    type="text"
                    value={modalAlibi}
                    onChange={(e) => setModalAlibi(e.target.value)}
                    placeholder="Enter your reason for being here..."
                  />
                  <button onClick={clearAlibi} className="clear-button">
                    <img src="/svgs/X.svg" alt="Clear" />
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={closeModal} className="cancel-button">
                Cancel
              </button>
              <button onClick={saveModal} className="save-button">
                Save
          </button>
        </div>
      </div>
      )}

      {/* Mission Completion Modal */}
        {showMissionModal && selectedMissionId && (() => {
          const mission = missions.find(m => m.playerMissionId === selectedMissionId)
          if (!mission) return null

          return (
            <div className={`modal ${isMissionClosing ? 'closing' : ''}`}>
              {!showMissionSuccess && !showMissionFailed ? (
                <>
                  <div className="modal-header">
                    <button onClick={closeMissionModal} className="close-button">
                      Close
                    </button>
                  </div>

                  <div className="modal-content">
                    <h2>{mission.title}</h2>
                    <p style={{ whiteSpace: 'pre-line' }}>{mission.missionBody}</p>

                    {mission.completionType === 'phrase' && (
                      <div className="field-group">
                        <label htmlFor="mission-success-key">Your Answer</label>
                        <div className="input-with-clear">
                          <input
                            id="mission-success-key"
                            type="text"
                            value={successKeys[selectedMissionId] || ''}
                            onChange={(e) => handleSuccessKeyChange(selectedMissionId, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && successKeys[selectedMissionId]) {
                                handleSubmitMission(selectedMissionId)
                              }
                            }}
                            placeholder="Enter your answer..."
                          />
                        </div>
                      </div>
                    )}

                    {mission.completionType === 'signoff' && (
                      <>
                        {mission.signoffPromptTemplate && (
                          <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '12px', fontStyle: 'italic' }}>
                            {mission.signoffPromptTemplate
                              .replace(/\{player_name\}/g, `${firstName} ${lastName}`)
                              .replace(/\{variable\}/g, mission.variableValue || '')
                              .replace(/\{signer_name\}/g, '________')}
                          </div>
                        )}

                        {mission.signerConstraint === 'new_signer' && (
                          <p style={{ fontSize: '0.85em', color: '#888', marginBottom: '8px' }}>
                            Must be someone who hasn't signed off on any of your other missions.
                          </p>
                        )}
                        {mission.signerConstraint === 'same_signer' && (
                          <p style={{ fontSize: '0.85em', color: '#888', marginBottom: '8px' }}>
                            Must be the same person who signed off on your earlier mission.
                          </p>
                        )}
                        {mission.signerConstraint === 'admin_only' && (
                          <p style={{ fontSize: '0.85em', color: '#888', marginBottom: '8px' }}>
                            Must be signed off by a host.
                          </p>
                        )}

                        <div className="field-group">
                          <label htmlFor="signer-select">Who is signing off?</label>
                          <select
                            id="signer-select"
                            value={signerUserId}
                            onChange={(e) => setSignerUserId(e.target.value)}
                            style={{ width: '100%', padding: '8px', fontSize: '1em' }}
                          >
                            <option value="">-- Select a player --</option>
                            {sessionParticipants.map(p => (
                              <option key={p.id} value={p.id}>{p.firstname} {p.lastname}</option>
                            ))}
                          </select>
                        </div>

                        <div className="field-group">
                          <label htmlFor="signer-passphrase">Their passphrase</label>
                          <div className="input-with-clear">
                            <input
                              id="signer-passphrase"
                              type="password"
                              value={signerPassphrase}
                              onChange={(e) => setSignerPassphrase(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && signerUserId && signerPassphrase) {
                                  handleSubmitMission(selectedMissionId)
                                }
                              }}
                              placeholder="Enter their passphrase..."
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {missionErrors[selectedMissionId] && (
                      <div className="mission-error">
                        {missionErrors[selectedMissionId]}
                      </div>
                    )}
                  </div>

                  <div className="modal-footer">
                    <button
                      onClick={() => handleSubmitMission(selectedMissionId)}
                      disabled={
                        mission.completionType === 'phrase'
                          ? !successKeys[selectedMissionId]
                          : !signerUserId || !signerPassphrase
                      }
                      className="save-button"
                    >
                      {mission.completionType === 'signoff' ? 'Confirm Sign-off' : 'Submit'}
                    </button>
                  </div>
                </>
              ) : showMissionFailed ? (
                <>
                  <div className="modal-header">
                    <button onClick={closeMissionModal} className="close-button">Close</button>
                  </div>
                  <div className="modal-content">
                    <div className="mission-failed">
                      <p className="mission-failed-title">MISSION FAILED</p>
                      <h2>{mission.title}</h2>
                      {missionFailedMessage && (
                        <p className="mission-failed-message">
                          {missionFailedMessage.replace(/^Mission failed\.\s*/i, '')}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-header">
                    <button onClick={closeMissionModal} className="close-button">Close</button>
                  </div>
                  <div className="modal-content">
                    <div className="mission-success">
                      <p>Mission success</p>
                      <h2>{mission.title}</h2>
                      {completedBounty > 0 && (
                        <div className="bounty-award">
                          <p className="bounty-award-text">BONUS AWARDED: {completedBounty} pts</p>
                          <button
                            className="bounty-paid-button"
                            onClick={() => handleMarkBountyPaid(mission.playerMissionId)}
                          >
                            PAID
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })()}
        
    </div>
  )
}

export default Dashboard
