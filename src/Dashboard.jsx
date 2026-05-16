import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { neonApi } from './neonApi'
import { isAdmin } from './utils/admin.js'
import AgentTab from './AgentTab'
import MissionsTab from './MissionsTab'

function renderSignoffMadlibPreview(template, firstName, lastName, variableValue) {
  const playerName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const varVal = (variableValue || '').trim()
  const parts = template.split(/(\{player_name\}|\{variable\}|\{signer_name\})/g)
  return parts.map((part, i) => {
    if (part === '{player_name}') {
      return (
        <span key={i} className="mission-signoff-madlib-fill">
          {playerName || '________'}
        </span>
      )
    }
    if (part === '{variable}') {
      return (
        <span key={i} className="mission-signoff-madlib-fill">
          {varVal || '________'}
        </span>
      )
    }
    if (part === '{signer_name}') {
      return (
        <span key={i} className="mission-signoff-madlib-fill mission-signoff-madlib-blank">
          {' '}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function formatWitnessSignedAt(iso) {
  if (iso == null || iso === '') return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function BriefingModalPanel({ isClosing, onClose }) {
  return (
    <div className={`modal briefing-modal ${isClosing ? 'closing' : ''}`}>
      <div className="modal-header">
        <button type="button" onClick={onClose} className="close-button">Close</button>
      </div>
      <div className="modal-content">
        <div className="backstory-card briefing-modal-card">
          <img className="briefing-modal-seal" src="/briefing-seal.png" alt="" />
          <h4>Briefing - TOP SECRET!!!</h4>
          <p>We've been following the movements of a mysterious hacker known as <strong>tha_h4ck3rG0d</strong> and have reason to believe they are planning to detonate a doomsday device at some point on the evening of Saturday, May 16.</p>
          <p>The device itself is located somewhere on the premises of <strong>MacGuffin Toys</strong>. You will be infiltrating the environment as part of their annual company party.</p>
          <p>Initial intelligence suggests the company's employees are not very bright.</p>
          <p>Your mission is to determine the location of this doomsday device and disable it. We've prepared a series of smaller missions that will help you maintain cover and locate the device. You can do missions in any order.</p>
          <p>Due to the severity of the threat, we may have sent a few too many agents to retrieve the device. If you see a fellow agent in disguise, please help them maintain their cover by playing along.</p>
          <p><strong>Good luck, have fun, and don't get caught.</strong></p>
        </div>
      </div>
    </div>
  )
}

function DashboardFooter({ currentUser, onLogout }) {
  const navigate = useNavigate()
  return (
    <footer className="dashboard-footer">
      <AgentTab currentUser={currentUser} />
      <div className="dashboard-footer-actions">
        {isAdmin(currentUser) && (
          <button type="button" className="admin-button button-min" onClick={() => navigate('/admin/login')}>
            ADMIN
          </button>
        )}
        <button type="button" className="logout-button button-min" onClick={onLogout}>LOGOUT</button>
      </div>
    </footer>
  )
}

function BriefingStrip({ onOpenBriefing }) {
  return (
    <div className="dashboard-briefing-strip">
      <div className="tab-content dashboard-briefing-inner">
        <div className="briefing-strip-card">
          <div className="briefing-strip-row">
            <div className="briefing-strip-label">Briefing</div>
            <button type="button" className="briefing-strip-open" onClick={onOpenBriefing}>
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dashboard({ agentId, firstName, lastName, alias1, alias2, onLogout, currentUser }) {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successKeys, setSuccessKeys] = useState({})
  const [completedMissions, setCompletedMissions] = useState(new Set())
  const [missionErrors, setMissionErrors] = useState({})

  const [activeSessionId, setActiveSessionId] = useState(null)
  const [currentPhase, setCurrentPhase] = useState(0)
  const [signerPassphrase, setSignerPassphrase] = useState('')
  const [signoffSuccessSignerName, setSignoffSuccessSignerName] = useState(null)
  const [signoffSignedAt, setSignoffSignedAt] = useState(null)
  const [signoffPhase, setSignoffPhase] = useState('brief')

  const [showMissionModal, setShowMissionModal] = useState(false)
  const [isMissionClosing, setIsMissionClosing] = useState(false)
  const [selectedMissionId, setSelectedMissionId] = useState(null)
  const [showMissionSuccess, setShowMissionSuccess] = useState(false)
  const [showMissionFailed, setShowMissionFailed] = useState(false)
  const [missionFailedMessage, setMissionFailedMessage] = useState(null)
  const [completedBounty, setCompletedBounty] = useState(0)
  const [isInActiveSession, setIsInActiveSession] = useState(false)
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true)

  const [showBriefingModal, setShowBriefingModal] = useState(true)
  const [isBriefingClosing, setIsBriefingClosing] = useState(false)

  // ── Session & mission data fetching ────────────────────────────────────────

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

          if (!userInSession) {
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
  }, [agentId])

  useEffect(() => {
    if (isInActiveSession && !sessionCheckLoading && activeSessionId) {
      fetchMissions()
    } else if (!isInActiveSession) {
      setError(null)
    }
  }, [agentId, isInActiveSession, sessionCheckLoading, activeSessionId])

  useEffect(() => {
    if (missions.length > 0 || (!loading && !sessionCheckLoading)) {
      setError(null)
    }
  }, [missions, loading, sessionCheckLoading])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const activeSession = await neonApi.getActiveSession()
        if (activeSession && activeSession.participant_user_ids) {
          const userInSession = activeSession.participant_user_ids.includes(agentId)
          if (userInSession !== isInActiveSession) {
            setIsInActiveSession(userInSession)
            if (!userInSession) setMissions([])
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
        setCompletedMissions(new Set(
          (playerMissions || []).filter(m => m.completed).map(m => m.playerMissionId)
        ))
      } catch (error) {
        if (error && error.message && !error.message.includes('session')) {
          console.error('[AUTO-CHECK] Error checking missions:', error)
        }
      }
    }

    const interval = setInterval(checkMissions, 5000)
    return () => clearInterval(interval)
  }, [agentId, isInActiveSession, activeSessionId])

  const fetchMissions = async () => {
    try {
      setLoading(true)
      setError(null)
      if (!activeSessionId) { setMissions([]); return }

      const playerMissions = await neonApi.getPlayerMissions(activeSessionId, agentId)
      setMissions(playerMissions || [])
      if (playerMissions && playerMissions.length > 0) {
        setCurrentPhase(playerMissions[0].currentPhase || 0)
      }
      setCompletedMissions(new Set(
        (playerMissions || []).filter(m => m.completed).map(m => m.playerMissionId)
      ))
      setSuccessKeys({})
      setMissionErrors({})
    } catch (error) {
      console.error('Error fetching missions:', error)
      if (error && error.message) setError('Failed to fetch missions: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Mission & briefing modals ─────────────────────────────────────────────

  const resetMissionModal = () => {
    setShowMissionModal(false)
    setIsMissionClosing(false)
    setSelectedMissionId(null)
    setShowMissionSuccess(false)
    setShowMissionFailed(false)
    setMissionFailedMessage(null)
    setCompletedBounty(0)
    setSignoffSuccessSignerName(null)
    setSignoffPhase('brief')
    setSignerPassphrase('')
    setSignoffSignedAt(null)
  }

  const openBriefingModal = () => {
    resetMissionModal()
    setShowBriefingModal(true)
    setIsBriefingClosing(false)
  }

  const closeBriefingModal = () => {
    setIsBriefingClosing(true)
    setTimeout(() => {
      setShowBriefingModal(false)
      setIsBriefingClosing(false)
    }, 300)
  }

  const openMissionModal = (missionId) => {
    setShowBriefingModal(false)
    setIsBriefingClosing(false)
    setSelectedMissionId(missionId)
    setShowMissionModal(true)
    setShowMissionSuccess(false)
    setShowMissionFailed(false)
    setMissionErrors(prev => ({ ...prev, [missionId]: '' }))
    setMissionFailedMessage(null)
    setCompletedBounty(0)
    setSignoffSuccessSignerName(null)
    setSignoffPhase('brief')
    setSignerPassphrase('')
    setSignoffSignedAt(null)

    const mission = missions.find(m => m.playerMissionId === missionId)
    if (mission?.completionType === 'signoff' && mission.completed) {
      setShowMissionSuccess(false)
      setSignoffPhase('witnessDone')
      setSignoffSuccessSignerName(mission.signerName || null)
      setSignoffSignedAt(mission.signedOffAt || null)
      if (!mission.bountyPaid && mission.bounty > 0) {
        setCompletedBounty(mission.bounty)
      } else {
        setCompletedBounty(0)
      }
    } else if (mission && mission.completed && !mission.bountyPaid && mission.bounty > 0) {
      setShowMissionSuccess(true)
      setCompletedBounty(mission.bounty)
    }
  }

  const closeMissionModal = () => {
    setIsMissionClosing(true)
    setTimeout(() => {
      resetMissionModal()
    }, 300)
  }

  const handleSuccessKeyChange = (playerMissionId, value) => {
    setSuccessKeys(prev => ({ ...prev, [playerMissionId]: value }))
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
        if (!signerPassphrase) {
          setMissionErrors(prev => ({ ...prev, [playerMissionId]: 'The person signing off must enter their passphrase' }))
          return
        }
        result = await neonApi.signOffMission(playerMissionId, signerPassphrase)
      }

      setCompletedMissions(prev => new Set([...prev, playerMissionId]))
      setSuccessKeys(prev => { const n = { ...prev }; delete n[playerMissionId]; return n })
      setSignerPassphrase('')

      if (mission.completionType === 'signoff') {
        setSignoffPhase('witnessDone')
        setSignoffSuccessSignerName(result.signerName || null)
        setSignoffSignedAt(result.signedOffAt ?? null)
        setMissions(prev => prev.map(m =>
          m.playerMissionId === playerMissionId
            ? {
              ...m,
              completed: true,
              signerName: result.signerName ?? m.signerName,
              signedOffAt: result.signedOffAt ?? m.signedOffAt
            }
            : m
        ))
        if (result.bounty > 0) setCompletedBounty(result.bounty)
        if (selectedMissionId === playerMissionId) {
          setShowMissionFailed(false)
          setMissionErrors(prev => ({ ...prev, [playerMissionId]: '' }))
        }
      } else {
        if (result.bounty > 0) setCompletedBounty(result.bounty)
        if (selectedMissionId === playerMissionId) {
          setShowMissionSuccess(true)
          setShowMissionFailed(false)
          setMissionErrors(prev => ({ ...prev, [playerMissionId]: '' }))
        }
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

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-page">
          <div className="dashboard-missions-heading">MISSIONS</div>
          <BriefingStrip onOpenBriefing={openBriefingModal} />
          <div className="dashboard-content dashboard-content-missions">
            <div className="tab-content">
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>LOADING MISSION DATA...</p>
              </div>
            </div>
          </div>
          <DashboardFooter currentUser={currentUser} onLogout={onLogout} />
        </div>
        {showBriefingModal && (
          <BriefingModalPanel isClosing={isBriefingClosing} onClose={closeBriefingModal} />
        )}
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-page">
          <div className="dashboard-missions-heading">MISSIONS</div>
          <BriefingStrip onOpenBriefing={openBriefingModal} />
          <div className="dashboard-content dashboard-content-missions">
            <div className="tab-content">
              <h1>ERROR</h1>
              <p>{error}</p>
              <div className="tab-actions">
                <button type="button" onClick={fetchMissions} className="retry-button">RETRY</button>
              </div>
            </div>
          </div>
          <DashboardFooter currentUser={currentUser} onLogout={onLogout} />
        </div>
        {showBriefingModal && (
          <BriefingModalPanel isClosing={isBriefingClosing} onClose={closeBriefingModal} />
        )}
      </div>
    )
  }

  // ── Normal render ──────────────────────────────────────────────────────────

  const selectedMission = missions.find(m => m.playerMissionId === selectedMissionId)

  return (
    <div className="dashboard-container">
      <div className="dashboard-page">
        <div className="dashboard-missions-heading">MISSIONS</div>
        <BriefingStrip onOpenBriefing={openBriefingModal} />
        <div className="dashboard-content dashboard-content-missions">
          <MissionsTab
            isInActiveSession={isInActiveSession}
            missions={missions}
            currentPhase={currentPhase}
            completedMissions={completedMissions}
            onMissionClick={openMissionModal}
          />
        </div>
        <DashboardFooter currentUser={currentUser} onLogout={onLogout} />
      </div>

      {showBriefingModal && (
        <BriefingModalPanel isClosing={isBriefingClosing} onClose={closeBriefingModal} />
      )}

      {showMissionModal && selectedMission && (
        <div className={`modal mission-modal ${isMissionClosing ? 'closing' : ''}`}>
          {!showMissionSuccess && !showMissionFailed ? (
            <>
              <div className="modal-header">
                <button type="button" onClick={closeMissionModal} className="close-button">Close</button>
              </div>
              <div className="modal-content">
                <h2>{selectedMission.title}</h2>
                <p style={{ whiteSpace: 'pre-line' }}>{selectedMission.missionBody}</p>

                {selectedMission.completionType === 'phrase' && (
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
                    {missionErrors[selectedMissionId] && (
                      <div className="mission-error">{missionErrors[selectedMissionId]}</div>
                    )}
                    <div className="mission-inline-action">
                      <button
                        type="button"
                        onClick={() => handleSubmitMission(selectedMissionId)}
                        disabled={!successKeys[selectedMissionId]}
                        className="save-button"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}

                {selectedMission.completionType === 'signoff' && signoffPhase === 'brief' && (
                  <>
                    {selectedMission.signerConstraint === 'new_signer' && (
                      <p className="mission-signoff-hint mission-signoff-hint--constraint-emphasis">
                        Must be someone who hasn't signed off on any of your other missions.
                      </p>
                    )}
                    {selectedMission.signerConstraint === 'same_signer' && (
                      <p className="mission-signoff-hint mission-signoff-hint--constraint-emphasis">
                        Must be the same person who signed off on your earlier mission.
                      </p>
                    )}
                    {selectedMission.signerConstraint === 'admin_only' && (
                      <p className="mission-signoff-hint mission-signoff-hint--constraint-emphasis">
                        Must be signed off by a host.
                      </p>
                    )}
                    {missionErrors[selectedMissionId] && (
                      <div className="mission-error">{missionErrors[selectedMissionId]}</div>
                    )}
                    <div className="mission-inline-action">
                      <button
                        type="button"
                        onClick={() => {
                          setMissionErrors(prev => ({ ...prev, [selectedMissionId]: '' }))
                          setSignerPassphrase('')
                          setSignoffPhase('witness')
                        }}
                        className="save-button mission-complete-outline-button"
                      >
                        Complete mission
                      </button>
                    </div>
                  </>
                )}

                {selectedMission.completionType === 'signoff' && signoffPhase === 'witness' && (
                  <>
                    {selectedMission.signerConstraint === 'new_signer' && (
                      <p className="mission-signoff-hint mission-signoff-hint--constraint-emphasis">
                        Must be someone who hasn't signed off on any of your other missions.
                      </p>
                    )}
                    {selectedMission.signerConstraint === 'same_signer' && (
                      <p className="mission-signoff-hint mission-signoff-hint--constraint-emphasis">
                        Must be the same person who signed off on your earlier mission.
                      </p>
                    )}
                    {selectedMission.signerConstraint === 'admin_only' && (
                      <p className="mission-signoff-hint mission-signoff-hint--constraint-emphasis">
                        Must be signed off by a host.
                      </p>
                    )}

                    <div className="mission-witness-panel">
                      <p className="mission-witness-instruction">
                        Hand your phone to an authorized witness to confirm.
                      </p>

                      {selectedMission.signoffPromptTemplate && (
                        <div className="mission-signoff-preview mission-signoff-preview--madlib">
                          {renderSignoffMadlibPreview(
                            selectedMission.signoffPromptTemplate,
                            firstName,
                            lastName,
                            selectedMission.variableValue
                          )}
                        </div>
                      )}

                      <div className="field-group">
                        <label htmlFor="signer-passphrase">Authorized witness</label>
                        <div className="input-with-clear">
                          <input
                            id="signer-passphrase"
                            type="password"
                            value={signerPassphrase}
                            onChange={(e) => setSignerPassphrase(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && signerPassphrase) {
                                handleSubmitMission(selectedMissionId)
                              }
                            }}
                            placeholder="Enter passphrase"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      {missionErrors[selectedMissionId] && (
                        <div className="mission-error">{missionErrors[selectedMissionId]}</div>
                      )}
                      <div className="mission-inline-action">
                        <button
                          type="button"
                          onClick={() => handleSubmitMission(selectedMissionId)}
                          disabled={!signerPassphrase}
                          className="save-button"
                        >
                          Sign off
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {selectedMission.completionType === 'signoff' && signoffPhase === 'witnessDone' && (
                  <div className="mission-witness-panel mission-witness-panel--signed">
                    {selectedMission.signoffPromptTemplate && (
                      <div className="mission-signoff-preview mission-signoff-preview--madlib">
                        {renderSignoffMadlibPreview(
                          selectedMission.signoffPromptTemplate,
                          firstName,
                          lastName,
                          selectedMission.variableValue
                        )}
                      </div>
                    )}
                    <p className="mission-witness-signed-summary">
                      Signed by{' '}
                      <strong>{signoffSuccessSignerName || selectedMission.signerName}</strong>
                      {' '}
                      at {formatWitnessSignedAt(signoffSignedAt ?? selectedMission.signedOffAt)}.
                    </p>
                    {completedBounty > 0 && !selectedMission.bountyPaid && (
                      <div className="mission-witness-bounty-wrap">
                        <div className="bounty-award">
                          <p className="bounty-award-text">BONUS AWARDED: {completedBounty} pts</p>
                          <button
                            type="button"
                            className="bounty-paid-button"
                            onClick={() => handleMarkBountyPaid(selectedMission.playerMissionId)}
                          >
                            PAID
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : showMissionFailed ? (
            <>
              <div className="modal-header">
                <button type="button" onClick={closeMissionModal} className="close-button">Close</button>
              </div>
              <div className="modal-content">
                <div className="mission-failed">
                  <p className="mission-failed-title">MISSION FAILED</p>
                  <h2>{selectedMission.title}</h2>
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
                <button type="button" onClick={closeMissionModal} className="close-button">Close</button>
              </div>
              <div className="modal-content">
                <div className="mission-success">
                  <p>Mission success</p>
                  <h2>{selectedMission.title}</h2>
                  {completedBounty > 0 && (
                    <div className="bounty-award">
                      <p className="bounty-award-text">BONUS AWARDED: {completedBounty} pts</p>
                      <button
                        type="button"
                        className="bounty-paid-button"
                        onClick={() => handleMarkBountyPaid(selectedMission.playerMissionId)}
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
      )}
    </div>
  )
}

export default Dashboard
