import React, { useState, useEffect } from 'react'
import { neonApi } from './neonApi'
import AgentTab from './AgentTab'
import MissionsTab from './MissionsTab'

function Dashboard({ agentId, firstName, lastName, alias1, alias2, onLogout, currentUser }) {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successKeys, setSuccessKeys] = useState({})
  const [completedMissions, setCompletedMissions] = useState(new Set())
  const [activeTab, setActiveTab] = useState('missions')
  const [missionErrors, setMissionErrors] = useState({})

  const [activeSessionId, setActiveSessionId] = useState(null)
  const [currentPhase, setCurrentPhase] = useState(0)
  const [sessionParticipants, setSessionParticipants] = useState([])
  const [signerUserId, setSignerUserId] = useState('')
  const [signerPassphrase, setSignerPassphrase] = useState('')

  const [showMissionModal, setShowMissionModal] = useState(false)
  const [isMissionClosing, setIsMissionClosing] = useState(false)
  const [selectedMissionId, setSelectedMissionId] = useState(null)
  const [showMissionSuccess, setShowMissionSuccess] = useState(false)
  const [showMissionFailed, setShowMissionFailed] = useState(false)
  const [missionFailedMessage, setMissionFailedMessage] = useState(null)
  const [completedBounty, setCompletedBounty] = useState(0)
  const [isInActiveSession, setIsInActiveSession] = useState(false)
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true)

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

  // ── Mission modal ──────────────────────────────────────────────────────────

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

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (showMissionModal) closeMissionModal()
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
        if (!signerUserId || !signerPassphrase) {
          setMissionErrors(prev => ({ ...prev, [playerMissionId]: 'Select a signer and enter their passphrase' }))
          return
        }
        result = await neonApi.signOffMission(playerMissionId, parseInt(signerUserId), signerPassphrase)
      }

      setCompletedMissions(prev => new Set([...prev, playerMissionId]))
      setSuccessKeys(prev => { const n = { ...prev }; delete n[playerMissionId]; return n })
      setSignerUserId('')
      setSignerPassphrase('')

      if (result.bounty > 0) setCompletedBounty(result.bounty)
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

  // ── Tab bar (shared across loading/error/normal states) ────────────────────

  const TabBar = () => (
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
  )

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="dashboard-container">
        <TabBar />
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

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="dashboard-container">
        <TabBar />
        <div className={`dashboard-content dashboard-content-${activeTab}`}>
          <div className="tab-content">
            <h1>ERROR</h1>
            <p>{error}</p>
            <div className="tab-actions">
              <button onClick={fetchMissions} className="retry-button">RETRY</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal render ──────────────────────────────────────────────────────────

  const selectedMission = missions.find(m => m.playerMissionId === selectedMissionId)

  return (
    <div className="dashboard-container">
      <TabBar />

      <div className={`dashboard-content dashboard-content-${activeTab}`}>
        {activeTab === 'agent' && (
          <AgentTab
            currentUser={currentUser}
            onLogout={onLogout}
          />
        )}

        {activeTab === 'missions' && (
          <MissionsTab
            isInActiveSession={isInActiveSession}
            missions={missions}
            currentPhase={currentPhase}
            completedMissions={completedMissions}
            onMissionClick={openMissionModal}
          />
        )}
      </div>

      {showMissionModal && selectedMission && (
        <div className={`modal ${isMissionClosing ? 'closing' : ''}`}>
          {!showMissionSuccess && !showMissionFailed ? (
            <>
              <div className="modal-header">
                <button onClick={closeMissionModal} className="close-button">Close</button>
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
                  </div>
                )}

                {selectedMission.completionType === 'signoff' && (
                  <>
                    {selectedMission.signoffPromptTemplate && (
                      <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '12px', fontStyle: 'italic' }}>
                        {selectedMission.signoffPromptTemplate
                          .replace(/\{player_name\}/g, `${firstName} ${lastName}`)
                          .replace(/\{variable\}/g, selectedMission.variableValue || '')
                          .replace(/\{signer_name\}/g, '________')}
                      </div>
                    )}

                    {selectedMission.signerConstraint === 'new_signer' && (
                      <p style={{ fontSize: '0.85em', color: '#888', marginBottom: '8px' }}>
                        Must be someone who hasn't signed off on any of your other missions.
                      </p>
                    )}
                    {selectedMission.signerConstraint === 'same_signer' && (
                      <p style={{ fontSize: '0.85em', color: '#888', marginBottom: '8px' }}>
                        Must be the same person who signed off on your earlier mission.
                      </p>
                    )}
                    {selectedMission.signerConstraint === 'admin_only' && (
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
                  <div className="mission-error">{missionErrors[selectedMissionId]}</div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  onClick={() => handleSubmitMission(selectedMissionId)}
                  disabled={
                    selectedMission.completionType === 'phrase'
                      ? !successKeys[selectedMissionId]
                      : !signerUserId || !signerPassphrase
                  }
                  className="save-button"
                >
                  {selectedMission.completionType === 'signoff' ? 'Confirm Sign-off' : 'Submit'}
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
                <button onClick={closeMissionModal} className="close-button">Close</button>
              </div>
              <div className="modal-content">
                <div className="mission-success">
                  <p>Mission success</p>
                  <h2>{selectedMission.title}</h2>
                  {completedBounty > 0 && (
                    <div className="bounty-award">
                      <p className="bounty-award-text">BONUS AWARDED: {completedBounty} pts</p>
                      <button
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
