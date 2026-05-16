import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { neonApi } from './neonApi'
import { isAdmin } from './utils/admin.js'

const PRODUCTION_URL = 'https://press-me-iota.vercel.app'

function getPlayerLoginUrl(user) {
  const alias = `${user.alias_1} ${user.alias_2}`
  const base64Alias = btoa(unescape(encodeURIComponent(alias)))
  return `${PRODUCTION_URL}/login/${encodeURIComponent(base64Alias)}`
}

// Helper function to format timestamp with proper timezone handling
function formatTimestamp(timestamp) {
  if (!timestamp) return ''
  
  try {
    let date
    
    if (typeof timestamp === 'string') {
      const trimmed = timestamp.trim()
      if (!trimmed) return ''
      
      // Check if it explicitly has timezone info (Z or +/-HH:MM)
      const hasExplicitTimezone = trimmed.endsWith('Z') || 
                                  /[+-]\d{2}:?\d{2}$/.test(trimmed)
      
      if (hasExplicitTimezone) {
        // Has explicit timezone info, parse as-is
        date = new Date(trimmed)
      } else {
        // No timezone info - PostgreSQL TIMESTAMP without timezone stores in UTC
        // Parse the components and create a UTC date explicitly
        // Handle formats like: "2024-01-15 14:30:00" or "2024-01-15T14:30:00" or "2024-01-15T14:30:00.123456"
        let normalized = trimmed
        
        // Replace space with T
        normalized = normalized.replace(' ', 'T')
        
        // Remove microseconds/milliseconds if present (keep only seconds)
        if (normalized.includes('.')) {
          const parts = normalized.split('.')
          normalized = parts[0] + (parts[1] ? '.' + parts[1].substring(0, 3) : '')
        }
        
        // Ensure we have a proper ISO format
        // Parse YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ss.SSS
        const isoPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/
        const match = normalized.match(isoPattern)
        
        if (match) {
          // Create date using UTC methods to ensure it's treated as UTC
          const year = parseInt(match[1], 10)
          const month = parseInt(match[2], 10) - 1 // months are 0-indexed
          const day = parseInt(match[3], 10)
          const hour = parseInt(match[4], 10)
          const minute = parseInt(match[5], 10)
          const second = parseInt(match[6], 10)
          
          date = new Date(Date.UTC(year, month, day, hour, minute, second))
        } else {
          // Fallback: add Z to mark as UTC
          date = new Date(normalized + 'Z')
        }
      }
    } else {
      // Already a Date object or number
      date = timestamp instanceof Date ? timestamp : new Date(timestamp)
    }
    
    // Validate the date
    if (isNaN(date.getTime())) {
      console.warn('Invalid timestamp:', timestamp)
      return String(timestamp) // Return the original as string if invalid
    }
    
    // Subtract 8 hours (PST is UTC-8) from UTC timestamp before displaying
    const pstDate = new Date(date.getTime() - (8 * 60 * 60 * 1000))
    
    // Format the PST date
    return pstDate.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    })
  } catch (error) {
    console.error('Error formatting timestamp:', timestamp, error)
    return String(timestamp) // Return the original as string on error
  }
}

function AdminDashboard({ currentUser, onLogout }) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSession, setActiveSession] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [allUsers, setAllUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [sessionName, setSessionName] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)
  const [editingSession, setEditingSession] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [sessionUsers, setSessionUsers] = useState([])
  const [playerMissions, setPlayerMissions] = useState([]) // flat list from getAllPlayerMissionsForSession
  const [loadingSessionData, setLoadingSessionData] = useState(false)
  const [completingMission, setCompletingMission] = useState(null) // { playerMissionId, userId }
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [advancingPhase, setAdvancingPhase] = useState(false)

  // Global mission manager state
  const [showMissionManager, setShowMissionManager] = useState(false)
  const [showMissionModal, setShowMissionModal] = useState(false)
  const [editingMission, setEditingMission] = useState(null)
  const [missionForm, setMissionForm] = useState({
    phase: 1,
    title: '',
    missionBody: '',
    completionType: 'phrase',
    successKey: '',
    signoffPromptTemplate: '',
    variablePool: '',
    variableSource: 'pool',
    signerConstraint: 'any',
    sameSigerMissionId: null,
    sortOrder: 0,
    bounty: 0
  })
  const [phaseMissions, setPhaseMissions] = useState([])
  const [loadingPhaseMissions, setLoadingPhaseMissions] = useState(false)

  // Check if user is admin
  const userIsAdmin = isAdmin(currentUser)

  useEffect(() => {
    if (!userIsAdmin) {
      navigate('/admin/login')
      return
    }
    // Load sessions data
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIsAdmin, navigate])

  const loadSessions = async () => {
    try {
      const allSessions = await neonApi.getAllSessions()
      setSessions(Array.isArray(allSessions) ? allSessions : [])
      
      // Find and set active session
      const active = allSessions.find(s => s.status === 'active')
      setActiveSession(active || null)
      
      // If there's an active session, load its user data
      if (active) {
        loadActiveSessionData(active)
      } else {
        setSessionUsers([])
        setPlayerMissions([])
      }
      
      setLoading(false)
    } catch (error) {
      console.error('Error loading sessions:', error)
      setSessions([])
      setLoading(false)
    }
  }

  const loadActiveSessionData = async (session) => {
    if (!session || !session.participant_user_ids || session.participant_user_ids.length === 0) {
      setSessionUsers([])
      setPlayerMissions([])
      return
    }

    try {
      setLoadingSessionData(true)

      const allUsersResult = await neonApi.getUsers()
      const sessionUserIds = new Set(session.participant_user_ids.map(id => Number(id)))
      const usersInSession = allUsersResult.filter(user => sessionUserIds.has(user.id))
      setSessionUsers(usersInSession)

      const missions = await neonApi.getAllPlayerMissionsForSession(session.id)
      setPlayerMissions(missions || [])
    } catch (error) {
      console.error('Error loading active session data:', error)
      setSessionUsers([])
      setPlayerMissions([])
    } finally {
      setLoadingSessionData(false)
    }
  }

  const handleStartSession = async (sessionId) => {
    if (!window.confirm('Start this session? Missions will be assigned to selected players.')) {
      return
    }
    
    try {
      await neonApi.startSession(sessionId)
      await loadSessions()
      // loadSessions will automatically load the active session data
      alert('Session started and missions assigned!')
    } catch (error) {
      alert(`Error starting session: ${error.message || 'Please try again.'}`)
    }
  }

  const handlePauseSession = async (sessionId) => {
    try {
      await neonApi.pauseSession(sessionId)
      await loadSessions()
      alert('Session paused')
    } catch (error) {
      alert(`Error pausing session: ${error.message || 'Please try again.'}`)
    }
  }

  const handleResumeSession = async (sessionId) => {
    try {
      await neonApi.resumeSession(sessionId)
      await loadSessions()
      alert('Session resumed')
    } catch (error) {
      alert(`Error resuming session: ${error.message || 'Please try again.'}`)
    }
  }

  const handleEndSession = async (sessionId) => {
    if (!window.confirm('End this session? This cannot be undone.')) {
      return
    }
    
    try {
      await neonApi.endSession(sessionId)
      await loadSessions()
      alert('Session ended')
    } catch (error) {
      alert(`Error ending session: ${error.message || 'Please try again.'}`)
    }
  }

  const handleResetSession = async (sessionId) => {
    if (!window.confirm('Reset this session? This will clear all mission assignments, completions, and intel for all participants. This cannot be undone.')) {
      return
    }
    
    try {
      await neonApi.resetSession(sessionId)
      await loadSessions()
      alert('Session reset successfully. All missions and intel cleared for participants.')
    } catch (error) {
      alert(`Error resetting session: ${error.message || 'Please try again.'}`)
    }
  }


  const handleOpenCreateModal = async () => {
    try {
      // Fetch all users for selection
      const users = await neonApi.getUsers()
      setAllUsers(users.filter(user => user.ishere)) // Only show active users
      setSelectedUsers(new Set())
      setSessionName('')
      setShowCreateModal(true)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleToggleUser = (userId) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedUsers.size === allUsers.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(allUsers.map(user => user.id)))
    }
  }

  const handleCreateSession = async () => {
    if (!sessionName.trim()) {
      alert('Please enter a session name')
      return
    }
    if (selectedUsers.size === 0) {
      alert('Please select at least one player')
      return
    }

    setCreatingSession(true)
    try {
      // Create session (draft status - missions not assigned yet)
      await neonApi.createSession({
        name: sessionName.trim(),
        userIds: Array.from(selectedUsers),
        createdBy: currentUser?.id
      })

      setShowCreateModal(false)
      setSessionName('')
      setSelectedUsers(new Set())
      loadSessions()
      alert('Session created successfully! Start the session to assign missions.')
    } catch (error) {
      console.error('Error creating session:', error)
      alert(`Error creating session: ${error.message || 'Please try again.'}`)
    } finally {
      setCreatingSession(false)
    }
  }

  const handleOpenEditModal = async (session) => {
    // Only allow editing draft, paused, or ended sessions
    if (session.status === 'active') {
      alert('Cannot edit an active session. Pause or end it first.')
      return
    }

    try {
      // Fetch all users for selection
      const users = await neonApi.getUsers()
      setAllUsers(users.filter(user => user.ishere)) // Only show active users
      
      // Set current session data
      setEditingSessionId(session.id)
      setSessionName(session.name || '')
      setSelectedUsers(new Set(session.participant_user_ids || []))
      setShowEditModal(true)
    } catch (error) {
      console.error('Error fetching users:', error)
      alert('Error loading session data')
    }
  }

  const handleUpdateSession = async () => {
    if (!sessionName.trim()) {
      alert('Please enter a session name')
      return
    }
    if (selectedUsers.size === 0) {
      alert('Please select at least one player')
      return
    }

    setEditingSession(true)
    try {
      await neonApi.updateSession(editingSessionId, {
        name: sessionName.trim(),
        userIds: Array.from(selectedUsers)
      })

      setShowEditModal(false)
      setEditingSessionId(null)
      setSessionName('')
      setSelectedUsers(new Set())
      loadSessions()
      alert('Session updated successfully!')
    } catch (error) {
      console.error('Error updating session:', error)
      alert(`Error updating session: ${error.message || 'Please try again.'}`)
    } finally {
      setEditingSession(false)
    }
  }


  const handleRequestCompleteMission = (playerMissionId, userId) => {
    setCompletingMission({ playerMissionId, userId })
    setShowCompleteConfirm(true)
  }

  const handleConfirmCompleteMission = async () => {
    if (!completingMission) return

    try {
      const result = await neonApi.adminCompletePhaseMission(completingMission.playerMissionId)

      if (activeSession) {
        await loadActiveSessionData(activeSession)
      }

      setShowCompleteConfirm(false)
      setCompletingMission(null)
      alert(result.message || 'Mission completed successfully!')
    } catch (error) {
      console.error('Error completing mission:', error)
      alert(`Error completing mission: ${error.message || 'Please try again.'}`)
    }
  }

  const handleCancelCompleteMission = () => {
    setShowCompleteConfirm(false)
    setCompletingMission(null)
  }

  const handleAdvancePhase = async () => {
    if (!activeSession) return
    const currentPhase = activeSession.current_phase || 0
    if (currentPhase >= 3) return

    if (!window.confirm(`Advance to Phase ${currentPhase + 1}? This will lock Phase ${currentPhase} missions.`)) {
      return
    }

    setAdvancingPhase(true)
    try {
      await neonApi.advancePhase(activeSession.id)
      await loadSessions()
      alert(`Advanced to Phase ${currentPhase + 1}!`)
    } catch (error) {
      alert(`Error advancing phase: ${error.message || 'Please try again.'}`)
    } finally {
      setAdvancingPhase(false)
    }
  }

  // Global mission manager handlers
  const loadPhaseMissions = async () => {
    try {
      setLoadingPhaseMissions(true)
      const missions = await neonApi.getPhaseMissions()
      setPhaseMissions(missions || [])
    } catch (error) {
      console.error('Error loading phase missions:', error)
      setPhaseMissions([])
    } finally {
      setLoadingPhaseMissions(false)
    }
  }

  const handleOpenMissionManager = () => {
    setShowMissionManager(true)
    loadPhaseMissions()
  }

  const handleOpenMissionModal = (mission = null) => {
    setEditingMission(mission)
    if (mission) {
      setMissionForm({
        phase: mission.phase,
        title: mission.title,
        missionBody: mission.mission_body,
        completionType: mission.completion_type,
        successKey: mission.success_key || '',
        signoffPromptTemplate: mission.signoff_prompt_template || '',
        variablePool: mission.variable_pool ? mission.variable_pool.join(', ') : '',
        variableSource: mission.variable_source || 'pool',
        signerConstraint: mission.signer_constraint || 'any',
        sameSigerMissionId: mission.same_signer_mission_id || null,
        sortOrder: mission.sort_order || 0,
        bounty: mission.bounty || 0
      })
    } else {
      setMissionForm({
        phase: 1,
        title: '',
        missionBody: '',
        completionType: 'phrase',
        successKey: '',
        signoffPromptTemplate: '',
        variablePool: '',
        variableSource: 'pool',
        signerConstraint: 'any',
        sameSigerMissionId: null,
        sortOrder: 0,
        bounty: 0
      })
    }
    setShowMissionModal(true)
  }

  const handleSaveMission = async () => {
    if (!missionForm.title.trim() || !missionForm.missionBody.trim()) {
      alert('Title and mission body are required')
      return
    }

    const poolArray = missionForm.variablePool
      ? missionForm.variablePool.split(',').map(v => v.trim()).filter(Boolean)
      : null

    const data = {
      phase: missionForm.phase,
      title: missionForm.title.trim(),
      missionBody: missionForm.missionBody.trim(),
      completionType: missionForm.completionType,
      successKey: missionForm.completionType === 'phrase' ? missionForm.successKey : null,
      signoffPromptTemplate: missionForm.completionType === 'signoff' ? missionForm.signoffPromptTemplate : null,
      variablePool: poolArray && poolArray.length > 0 ? poolArray : null,
      variableSource: missionForm.variableSource,
      signerConstraint: missionForm.completionType === 'signoff' ? missionForm.signerConstraint : null,
      sameSigerMissionId: missionForm.signerConstraint === 'same_signer' ? missionForm.sameSigerMissionId : null,
      sortOrder: missionForm.sortOrder,
      bounty: parseInt(missionForm.bounty) || 0
    }

    try {
      if (editingMission) {
        await neonApi.updatePhaseMission(editingMission.id, data)
      } else {
        await neonApi.createPhaseMission(data)
      }
      setShowMissionModal(false)
      await loadPhaseMissions()
    } catch (error) {
      alert(`Error saving mission: ${error.message}`)
    }
  }

  const handleDeleteMission = async (missionId) => {
    if (!window.confirm('Delete this mission?')) return
    try {
      await neonApi.deletePhaseMission(missionId)
      await loadPhaseMissions()
    } catch (error) {
      alert(`Error deleting mission: ${error.message}`)
    }
  }

  if (!userIsAdmin) {
    return null
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/dashboard')} className="back-button">
            Back to Dashboard
          </button>
          <button onClick={onLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>

      <div className="admin-content">
        <div className="admin-section">
          <h2>Session Management</h2>
          <div className="session-controls">
            <button onClick={handleOpenCreateModal} className="button-primary">
              Create New Session
            </button>
            <button onClick={handleOpenMissionManager} className="button-secondary">
              Manage Missions
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--unit-base)' }}>
              <p>Loading sessions...</p>
            </div>
          ) : (
            <div className="sessions-list">
              {!sessions || sessions.length === 0 ? (
                <p style={{ textAlign: 'center', padding: 'var(--unit-base)', fontStyle: 'italic' }}>
                  No sessions found. Create a new session to get started.
                </p>
              ) : (
                <ul>
                  {Array.isArray(sessions) && sessions.map(session => (
                    <li key={session.id}>
                      <div className="session-item">
                        <h3>{session.name}</h3>
                        <div className="session-info">
                          <p className={`session-status status-${session.status}`}>Status: {session.status}</p>
                          <p>Players: {session.participant_user_ids?.length || 0}</p>
                          {session.created_at && (
                            <p>Created: {formatTimestamp(session.created_at)}</p>
                          )}
                          {session.started_at && (
                            <p>Started: {formatTimestamp(session.started_at)}</p>
                          )}
                          {session.paused_at && (
                            <p>Paused: {formatTimestamp(session.paused_at)}</p>
                          )}
                          {session.ended_at && (
                            <p>Ended: {formatTimestamp(session.ended_at)}</p>
                          )}
                        </div>
                        <div className="session-actions">
                          {session.status === 'draft' && (
                            <>
                              <button onClick={() => handleOpenEditModal(session)} className="button-secondary">
                                Edit
                              </button>
                              <button onClick={() => handleStartSession(session.id)} className="button-primary">
                                Start Session
                              </button>
                            </>
                          )}
                          {session.status === 'active' && (
                            <>
                              {(session.current_phase || 0) < 3 && (
                                <button
                                  onClick={() => handleAdvancePhase()}
                                  className="button-primary"
                                  disabled={advancingPhase}
                                >
                                  {advancingPhase ? 'Advancing...' : `Advance to Phase ${(session.current_phase || 0) + 1}`}
                                </button>
                              )}
                              <button onClick={() => handlePauseSession(session.id)} className="button-secondary">
                                Pause
                              </button>
                              <button onClick={() => handleEndSession(session.id)} className="logout-button">
                                End Session
                              </button>
                            </>
                          )}
                          {session.status === 'paused' && (
                            <>
                              <button onClick={() => handleOpenEditModal(session)} className="button-secondary">
                                Edit
                              </button>
                              <button onClick={() => handleResumeSession(session.id)} className="button-primary">
                                Resume
                              </button>
                              <button onClick={() => handleEndSession(session.id)} className="logout-button">
                                End Session
                              </button>
                              <button onClick={() => handleResetSession(session.id)} className="logout-button" style={{ backgroundColor: '#d32f2f' }}>
                                Reset Session
                              </button>
                            </>
                          )}
                          {session.status === 'ended' && (
                            <>
                              <button onClick={() => handleOpenEditModal(session)} className="button-secondary">
                                Edit
                              </button>
                              <button onClick={() => handleResetSession(session.id)} className="logout-button" style={{ backgroundColor: '#d32f2f' }}>
                                Reset Session
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {activeSession && (
          <div className="admin-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--unit-base)' }}>
              <h2>Active Session: {activeSession.name} — Phase {activeSession.current_phase || 0} of 3</h2>
              <button
                onClick={() => loadActiveSessionData(activeSession)}
                className="button-secondary"
                disabled={loadingSessionData}
                style={{ marginLeft: 'auto' }}
              >
                {loadingSessionData ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
            {loadingSessionData ? (
              <div style={{ textAlign: 'center', padding: 'var(--unit-base)' }}>
                <p>Loading session data...</p>
              </div>
            ) : sessionUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--unit-base)', fontStyle: 'italic' }}>
                <p>No users in this session.</p>
              </div>
            ) : (
              <div className="session-users-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Session Participants and Missions</h3>
                  <button
                    className="button-secondary"
                    style={{ fontSize: '0.85em' }}
                    onClick={() => {
                      const rows = [['Name', 'URL']]
                      sessionUsers.forEach(user => {
                        const name = `${user.firstname} ${user.lastname}`
                        const url = getPlayerLoginUrl(user)
                        rows.push([name, url])
                      })
                      const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
                      const blob = new Blob([csv], { type: 'text/csv' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `${activeSession.name}-player-urls.csv`
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}
                  >
                    Download Player URLs
                  </button>
                </div>
                {sessionUsers.map(user => {
                  const missions = playerMissions.filter(m => m.userId === user.id)
                  const phases = [0, 1, 2, 3].filter(p => missions.some(m => m.phase === p))
                  const currentPhase = activeSession.current_phase || 0

                  return (
                    <div key={user.id} style={{ marginBottom: '16px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                        {user.firstname} {user.lastname}
                        <span style={{ fontWeight: 'normal', color: '#888', marginLeft: '8px' }}>
                          {user.alias_1} {user.alias_2}
                        </span>
                        <span style={{ marginLeft: '8px', fontSize: '0.85em', color: '#666' }}>
                          {missions.filter(m => m.completed).length}/{missions.length} completed
                        </span>
                      </div>
                      {phases.length === 0 ? (
                        <span style={{ fontStyle: 'italic', color: '#888' }}>No missions assigned</span>
                      ) : (
                        phases.map(phase => {
                          const phaseMissions = missions.filter(m => m.phase === phase)
                          const isLocked = phase < currentPhase
                          return (
                            <div key={phase} style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: isLocked ? '#999' : '#333', marginBottom: '4px' }}>
                                Phase {phase} {isLocked ? '(Locked)' : phase === currentPhase ? '(Current)' : ''}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '12px' }}>
                                {phaseMissions.map(m => (
                                  <div
                                    key={m.playerMissionId}
                                    style={{
                                      fontSize: '0.9em',
                                      padding: '6px 8px',
                                      backgroundColor: m.completed ? '#f0f8f0' : isLocked ? '#f5f5f5' : '#f9f9f9',
                                      borderRadius: '4px',
                                      border: m.completed ? '1px solid #90ee90' : '1px solid #ddd',
                                      opacity: isLocked && !m.completed ? 0.6 : 1,
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <div>
                                      <strong>{m.title}</strong>
                                      {m.variableValue && (
                                        <span style={{ color: '#666', marginLeft: '6px', fontSize: '0.85em' }}>
                                          [{m.variableValue}]
                                        </span>
                                      )}
                                      <span style={{ color: '#999', marginLeft: '6px', fontSize: '0.8em' }}>
                                        ({m.completionType})
                                      </span>
                                      {m.completed && (
                                        <span style={{ color: 'green', marginLeft: '8px', fontSize: '0.85em' }}>
                                          Done{m.signerName ? ` (signed by ${m.signerName})` : ''}
                                        </span>
                                      )}
                                    </div>
                                    {!m.completed && !isLocked && (
                                      <button
                                        onClick={() => handleRequestCompleteMission(m.playerMissionId, m.userId)}
                                        style={{
                                          padding: '3px 8px',
                                          fontSize: '0.8em',
                                          cursor: 'pointer',
                                          backgroundColor: '#4CAF50',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px'
                                        }}
                                      >
                                        Complete
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="admin-modal-overlay" onClick={() => !creatingSession && setShowCreateModal(false)}>
          <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>Create New Session</h2>
              <button 
                className="admin-modal-close" 
                onClick={() => setShowCreateModal(false)}
                disabled={creatingSession}
              >
                ×
              </button>
            </div>
            
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label htmlFor="session-name">Session Name</label>
                <input
                  id="session-name"
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Enter session name"
                  disabled={creatingSession}
                />
              </div>

              <div className="admin-form-group">
                <div className="admin-form-header">
                  <label>Select Players ({selectedUsers.size} selected)</label>
                  <button 
                    type="button" 
                    onClick={handleSelectAll}
                    className="select-all-button"
                    disabled={creatingSession}
                  >
                    {selectedUsers.size === allUsers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="users-selection-list">
                  {allUsers.map(user => (
                    <label key={user.id} className="user-selection-item">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => handleToggleUser(user.id)}
                        disabled={creatingSession}
                      />
                      <span className="user-info">
                        <strong>{user.firstname} {user.lastname}</strong>
                        <span className="user-codename">{user.alias_1} {user.alias_2}</span>
                        <span className={`user-team team-${user.team}`}>{user.team}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="button-secondary"
                disabled={creatingSession}
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateSession}
                className="button-primary"
                disabled={creatingSession || !sessionName.trim() || selectedUsers.size === 0}
              >
                {creatingSession ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {showEditModal && (
        <div className="admin-modal-overlay" onClick={() => !editingSession && setShowEditModal(false)}>
          <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>Edit Session</h2>
              <button 
                className="admin-modal-close" 
                onClick={() => setShowEditModal(false)}
                disabled={editingSession}
              >
                ×
              </button>
            </div>
            
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label htmlFor="edit-session-name">Session Name</label>
                <input
                  id="edit-session-name"
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Enter session name"
                  disabled={editingSession}
                />
              </div>

              <div className="admin-form-group">
                <div className="admin-form-header">
                  <label>Select Players ({selectedUsers.size} selected)</label>
                  <button 
                    type="button" 
                    onClick={handleSelectAll}
                    className="select-all-button"
                    disabled={editingSession}
                  >
                    {selectedUsers.size === allUsers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="users-selection-list">
                  {allUsers.map(user => (
                    <label key={user.id} className="user-selection-item">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => handleToggleUser(user.id)}
                        disabled={editingSession}
                      />
                      <span className="user-info">
                        <strong>{user.firstname} {user.lastname}</strong>
                        <span className="user-codename">{user.alias_1} {user.alias_2}</span>
                        <span className={`user-team team-${user.team}`}>{user.team}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button 
                onClick={() => setShowEditModal(false)}
                className="button-secondary"
                disabled={editingSession}
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateSession}
                className="button-primary"
                disabled={editingSession || !sessionName.trim() || selectedUsers.size === 0}
              >
                {editingSession ? 'Updating...' : 'Update Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Mission Manager */}
      {showMissionManager && (
        <div className="admin-modal-overlay" onClick={() => setShowMissionManager(false)}>
          <div className="admin-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="admin-modal-header">
              <h2>Phase Missions</h2>
              <button className="admin-modal-close" onClick={() => setShowMissionManager(false)}>x</button>
            </div>
            <div className="admin-modal-body">
              <div style={{ marginBottom: '12px' }}>
                <button onClick={() => handleOpenMissionModal()} className="button-primary">
                  Add Mission
                </button>
              </div>
              {loadingPhaseMissions ? (
                <p>Loading missions...</p>
              ) : phaseMissions.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: '#888' }}>No missions defined yet.</p>
              ) : (
                [0, 1, 2, 3].map(phase => {
                  const missions = phaseMissions.filter(m => m.phase === phase)
                  if (missions.length === 0) return null
                  return (
                    <div key={phase} style={{ marginBottom: '16px' }}>
                      <h3 style={{ marginBottom: '8px' }}>Phase {phase} ({missions.length} missions)</h3>
                      {missions.map(m => (
                        <div key={m.id} style={{ padding: '8px', marginBottom: '4px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <strong>{m.title}</strong>
                            <span style={{ color: '#999', marginLeft: '8px', fontSize: '0.85em' }}>
                              {m.completion_type}{m.bounty ? ` | ${m.bounty}pts` : ''}{m.variable_pool ? ' | has variables' : ''}{m.variable_source === 'participants' ? ' | player var' : ''}{m.signer_constraint && m.signer_constraint !== 'any' ? ` | ${m.signer_constraint}` : ''}
                            </span>
                            <div style={{ fontSize: '0.85em', color: '#666', marginTop: '2px' }}>
                              {m.mission_body.length > 100 ? m.mission_body.substring(0, 100) + '...' : m.mission_body}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                            <button onClick={() => handleOpenMissionModal(m)} className="button-secondary" style={{ padding: '3px 8px', fontSize: '0.8em' }}>Edit</button>
                            <button onClick={() => handleDeleteMission(m.id)} className="logout-button" style={{ padding: '3px 8px', fontSize: '0.8em' }}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mission Create/Edit Modal */}
      {showMissionModal && (
        <div className="admin-modal-overlay" onClick={() => setShowMissionModal(false)}>
          <div className="admin-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="admin-modal-header">
              <h2>{editingMission ? 'Edit Mission' : 'Add Mission'}</h2>
              <button className="admin-modal-close" onClick={() => setShowMissionModal(false)}>x</button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label>Phase</label>
                <select
                  value={missionForm.phase}
                  onChange={(e) => setMissionForm({ ...missionForm, phase: parseInt(e.target.value) })}
                >
                  <option value={0}>Phase 0 (Icebreaker)</option>
                  <option value={1}>Phase 1 (Act I)</option>
                  <option value={2}>Phase 2 (Act II)</option>
                  <option value={3}>Phase 3 (Act III)</option>
                </select>
              </div>
              <div className="admin-form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={missionForm.title}
                  onChange={(e) => setMissionForm({ ...missionForm, title: e.target.value })}
                  placeholder="Mission title"
                />
              </div>
              <div className="admin-form-group">
                <label>Mission Body</label>
                <textarea
                  value={missionForm.missionBody}
                  onChange={(e) => setMissionForm({ ...missionForm, missionBody: e.target.value })}
                  placeholder="Use {variable} for the individualized element"
                  rows={3}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit', padding: '8px' }}
                />
              </div>
              <div className="admin-form-group">
                <label>Completion Type</label>
                <select
                  value={missionForm.completionType}
                  onChange={(e) => setMissionForm({ ...missionForm, completionType: e.target.value })}
                >
                  <option value="phrase">Phrase (player types an answer)</option>
                  <option value="signoff">Sign-off (another player confirms)</option>
                </select>
              </div>
              {missionForm.completionType === 'phrase' && (
                <div className="admin-form-group">
                  <label>Success Key (correct answer)</label>
                  <input
                    type="text"
                    value={missionForm.successKey}
                    onChange={(e) => setMissionForm({ ...missionForm, successKey: e.target.value })}
                    placeholder="The answer to validate against"
                  />
                </div>
              )}
              {missionForm.completionType === 'signoff' && (
                <>
                  <div className="admin-form-group">
                    <label>Sign-off Prompt Template</label>
                    <textarea
                      value={missionForm.signoffPromptTemplate}
                      onChange={(e) => setMissionForm({ ...missionForm, signoffPromptTemplate: e.target.value })}
                      placeholder="{player_name} did the thing I asked them to do."
                      rows={2}
                      style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit', padding: '8px' }}
                    />
                    <small style={{ color: '#888' }}>
                      Placeholders: {'{player_name}'}, {'{variable}'}
                    </small>
                  </div>
                  <div className="admin-form-group">
                    <label>Signer Constraint</label>
                    <select
                      value={missionForm.signerConstraint}
                      onChange={(e) => setMissionForm({ ...missionForm, signerConstraint: e.target.value })}
                    >
                      <option value="any">Any other player</option>
                      <option value="new_signer">Must be a new signer</option>
                      <option value="same_signer">Must be the same signer as another mission</option>
                      <option value="admin_only">Admin only (hosts)</option>
                    </select>
                  </div>
                  {missionForm.signerConstraint === 'same_signer' && (
                    <div className="admin-form-group">
                      <label>Same Signer As Mission</label>
                      <select
                        value={missionForm.sameSigerMissionId || ''}
                        onChange={(e) => setMissionForm({ ...missionForm, sameSigerMissionId: e.target.value ? parseInt(e.target.value) : null })}
                      >
                        <option value="">-- Select mission --</option>
                        {phaseMissions
                          .filter(m => m.completion_type === 'signoff' && m.id !== editingMission?.id)
                          .map(m => (
                            <option key={m.id} value={m.id}>Phase {m.phase}: {m.title}</option>
                          ))
                        }
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="admin-form-group">
                <label>Variable Source</label>
                <select
                  value={missionForm.variableSource}
                  onChange={(e) => setMissionForm({ ...missionForm, variableSource: e.target.value })}
                >
                  <option value="pool">Static pool (comma-separated list below)</option>
                  <option value="participants">Session participants (assigns a random other player)</option>
                </select>
              </div>
              {missionForm.variableSource === 'pool' && (
                <div className="admin-form-group">
                  <label>Variable Pool (comma-separated, leave blank for none)</label>
                  <input
                    type="text"
                    value={missionForm.variablePool}
                    onChange={(e) => setMissionForm({ ...missionForm, variablePool: e.target.value })}
                    placeholder="French, Italian, Spanish, German"
                  />
                </div>
              )}
              <div className="admin-form-group">
                <label>Bounty (points awarded on completion)</label>
                <input
                  type="number"
                  min="0"
                  value={missionForm.bounty}
                  onChange={(e) => setMissionForm({ ...missionForm, bounty: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="admin-form-group">
                <label>Sort Order</label>
                <input
                  type="number"
                  value={missionForm.sortOrder}
                  onChange={(e) => setMissionForm({ ...missionForm, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button onClick={() => setShowMissionModal(false)} className="button-secondary">
                Cancel
              </button>
              <button onClick={handleSaveMission} className="button-primary">
                {editingMission ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Mission Confirmation Modal */}
      {showCompleteConfirm && completingMission && (
        <div className="admin-modal-overlay" onClick={handleCancelCompleteMission}>
          <div className="admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>Complete Mission</h2>
              <button
                className="admin-modal-close"
                onClick={handleCancelCompleteMission}
              >
                x
              </button>
            </div>
            <div className="admin-modal-body">
              <p>Are you sure you want to manually complete this mission?</p>
              <p style={{ fontSize: '0.9em', color: '#666', marginTop: '8px' }}>
                This will mark the mission as completed and award intel to the user (if applicable).
              </p>
            </div>
            <div className="admin-modal-actions">
              <button
                onClick={handleCancelCompleteMission}
                className="button-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCompleteMission}
                className="button-primary"
                style={{ backgroundColor: '#4CAF50' }}
              >
                Complete Mission
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default AdminDashboard

