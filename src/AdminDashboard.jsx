import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { neonApi } from './neonApi'

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
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(15)
  const [creatingSession, setCreatingSession] = useState(false)
  const [editingSession, setEditingSession] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [refreshingMissions, setRefreshingMissions] = useState(false)
  const [sessionUsers, setSessionUsers] = useState([])
  const [userMissions, setUserMissions] = useState({}) // { userId: [missions] }
  const [loadingSessionData, setLoadingSessionData] = useState(false)
  const [completingMission, setCompletingMission] = useState(null) // { missionId, userId, missionType }
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  
  // Track reassignment state (persists across re-renders)
  const lastSeenTimestampRef = useRef(null)
  const hasReassignedForThisTimestampRef = useRef(false)
  
  // Check if user is admin
  const isAdmin = (currentUser?.alias_1 === 'Swift' && currentUser?.alias_2 === 'Spider') || 
                  (currentUser?.firstname === 'David' && currentUser?.lastname === 'Daw') ||
                  (currentUser?.alias_1 === 'Normal' && currentUser?.alias_2 === 'Hawk') ||
                  (currentUser?.firstname === 'Nikki' && currentUser?.lastname === 'Thayer')

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard')
      return
    }
    // Load sessions data
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, navigate])

  // Automatic mission reassignment based on session interval
  useEffect(() => {
    // Only run if there's an active session
    if (!activeSession || activeSession.status !== 'active') {
      return
    }

    // Prevent reassignment if already in progress or loading session data
    if (refreshingMissions || loadingSessionData) {
      return
    }

    const checkAndReassign = async () => {
      try {
        const lastAssigned = await neonApi.getLastAssignmentTimestamp()
        
        if (!lastAssigned) {
          // No previous assignment, skip automatic reassignment
          lastSeenTimestampRef.current = null
          hasReassignedForThisTimestampRef.current = false
          return
        }

        // Check if this is a new timestamp (meaning a reassignment happened externally)
        const currentTimestamp = lastAssigned.getTime ? lastAssigned.getTime() : new Date(lastAssigned).getTime()
        
        if (lastSeenTimestampRef.current !== currentTimestamp) {
          // Timestamp changed - reset the flag so we can reassign for this new timestamp
          console.log(`[AdminDashboard] Timestamp changed: ${lastSeenTimestampRef.current} -> ${currentTimestamp}`)
          lastSeenTimestampRef.current = currentTimestamp
          hasReassignedForThisTimestampRef.current = false
        }

        // If we've already reassigned for this timestamp, don't reassign again
        if (hasReassignedForThisTimestampRef.current) {
          return
        }

        const now = Date.now()
        const lastAssignedDate = new Date(lastAssigned)
        
        // Calculate difference - handle timezone issues
        let diffMs = now - lastAssignedDate.getTime()
        let diffMinutes = diffMs / (1000 * 60)
        
        // Handle timezone offset (same logic as Dashboard countdown)
        if (diffMs < 0 && Math.abs(diffMinutes) > 400 && Math.abs(diffMinutes) < 500) {
          const timezoneOffsetMinutes = 480 // PST is UTC-8
          const actualElapsedMs = diffMs + (timezoneOffsetMinutes * 60 * 1000)
          diffMinutes = actualElapsedMs / (1000 * 60)
        } else if (diffMinutes < 0) {
          diffMinutes = Math.abs(diffMinutes)
        }
        
        // Get the refresh interval from the active session
        const reassignmentIntervalMinutes = activeSession?.mission_refresh_interval_minutes || 15
        const elapsedMinutes = diffMinutes
        
        // Debug logging
        if (elapsedMinutes >= reassignmentIntervalMinutes * 0.9) {
          console.log(`[AdminDashboard] Check: ${elapsedMinutes.toFixed(2)} minutes elapsed, interval: ${reassignmentIntervalMinutes} minutes, needs reassignment: ${elapsedMinutes >= reassignmentIntervalMinutes}`)
        }
        
        // Only reassign if elapsed time >= interval AND we haven't already reassigned for this timestamp
        if (elapsedMinutes >= reassignmentIntervalMinutes && !hasReassignedForThisTimestampRef.current) {
          console.log(`[AdminDashboard] Auto-reassigning missions: ${elapsedMinutes.toFixed(1)} minutes elapsed (interval: ${reassignmentIntervalMinutes} minutes)`)
          
          // Mark that we've reassigned for this timestamp (optimistically)
          // If another admin succeeds first, the timestamp will change and we'll reset on next check
          hasReassignedForThisTimestampRef.current = true
          
          setRefreshingMissions(true)
          try {
            const result = await neonApi.resetAndAssignAllMissions()
            
            // If lock acquisition failed, another admin is handling it
            // This is fine - they'll update the timestamp and we'll see it on the next check
            if (!result.success && result.reason?.includes('lock')) {
              console.log('[AdminDashboard] Another admin acquired lock first, skipping reassignment')
              // Reset flag - when timestamp updates, we'll reset properly on next check
              hasReassignedForThisTimestampRef.current = false
              return
            }
            
            if (!result.success) {
              console.error('[AdminDashboard] Reassignment failed:', result.reason)
              hasReassignedForThisTimestampRef.current = false
              return
            }
            
            // Reload sessions (which will reload active session data) instead of calling loadActiveSessionData directly
            // This prevents infinite loops by using the same update path as manual actions
            await loadSessions()
            console.log(`[AdminDashboard] Auto-reassignment completed successfully: ${result.missionsAssigned} missions assigned`)
          } catch (error) {
            console.error('[AdminDashboard] Error during auto-reassignment:', error)
            // Reset flag on error so we can retry
            hasReassignedForThisTimestampRef.current = false
            // Don't show alert for automatic reassignment failures
          } finally {
            setRefreshingMissions(false)
          }
        }
      } catch (error) {
        console.error('[AdminDashboard] Error checking for auto-reassignment:', error)
      }
    }

    // Don't check immediately - wait a bit to avoid checking right after session start
    // Check after 10 seconds, then every 5 seconds
    let intervalId = null
    const initialTimeout = setTimeout(() => {
      checkAndReassign()
      intervalId = setInterval(checkAndReassign, 5000) // Check every 5 seconds
    }, 10000)

    return () => {
      clearTimeout(initialTimeout)
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, refreshingMissions, loadingSessionData]) // Only depend on session ID, not entire object

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
        setUserMissions({})
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
      setUserMissions({})
      return
    }

    try {
      setLoadingSessionData(true)
      
      // Get all users
      const allUsers = await neonApi.getUsers()
      
      // Filter to only session participants
      const sessionUserIds = new Set(session.participant_user_ids.map(id => Number(id)))
      const usersInSession = allUsers.filter(user => sessionUserIds.has(user.id))
      setSessionUsers(usersInSession)
      
      // Fetch missions for each user
      // Note: We need to fetch missions directly since getAllMissionsForAgent checks if user is in session
      // Admin might not be in the participant list, so we'll fetch missions directly
      const missionsMap = {}
      for (const user of usersInSession) {
        try {
          // Try getAllMissionsForAgent first (works if the user is in session)
          // If that fails or returns empty, fetch missions directly from the database
          let missions = []
          try {
            missions = await neonApi.getAllMissionsForAgent(user.id)
          } catch (err) {
            // If that fails, fetch missions directly
            console.log(`Getting missions directly for user ${user.id}`)
          }
          
          // If we didn't get missions, fetch them directly
          if (!missions || missions.length === 0) {
            // Get missions directly from database for this user
            const bookMissions = await neonApi.getBookMissionsForAgent(user.id)
            const passphraseMissions = await neonApi.getPassphraseMissionsForAgent(user.id)
            const objectMissions = await neonApi.getObjectMissionsForAgent(user.id)
            
            const bookWithType = (bookMissions || []).map(m => ({ ...m, type: 'book' }))
            missions = [...bookWithType, ...(passphraseMissions || []), ...(objectMissions || [])]
          }
          
          missionsMap[user.id] = missions || []
        } catch (error) {
          console.error(`Error fetching missions for user ${user.id}:`, error)
          missionsMap[user.id] = []
        }
      }
      
      setUserMissions(missionsMap)
    } catch (error) {
      console.error('Error loading active session data:', error)
      setSessionUsers([])
      setUserMissions({})
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

  const handleOpenVoting = async (sessionId) => {
    try {
      await neonApi.openVoting(sessionId)
      await loadSessions()
      alert('Voting opened! Users can now submit intel.')
    } catch (error) {
      alert(`Error opening voting: ${error.message || 'Please try again.'}`)
    }
  }

  const handleCloseVoting = async (sessionId) => {
    try {
      await neonApi.closeVoting(sessionId)
      await loadSessions()
      alert('Voting closed.')
    } catch (error) {
      alert(`Error closing voting: ${error.message || 'Please try again.'}`)
    }
  }

  const handleOpenCreateModal = async () => {
    try {
      // Fetch all users for selection
      const users = await neonApi.getUsers()
      setAllUsers(users.filter(user => user.ishere)) // Only show active users
      setSelectedUsers(new Set())
      setSessionName('')
      setRefreshIntervalMinutes(15)
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
        createdBy: currentUser?.id,
        refreshIntervalMinutes: refreshIntervalMinutes
      })
      
      // Close modal and refresh sessions
      setShowCreateModal(false)
      setSessionName('')
      setSelectedUsers(new Set())
      setRefreshIntervalMinutes(15)
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
      setRefreshIntervalMinutes(session.mission_refresh_interval_minutes || 15)
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
        userIds: Array.from(selectedUsers),
        refreshIntervalMinutes: refreshIntervalMinutes
      })
      
      // Close modal and refresh sessions
      setShowEditModal(false)
      setEditingSessionId(null)
      setSessionName('')
      setSelectedUsers(new Set())
      setRefreshIntervalMinutes(15)
      loadSessions()
      alert('Session updated successfully!')
    } catch (error) {
      console.error('Error updating session:', error)
      alert(`Error updating session: ${error.message || 'Please try again.'}`)
    } finally {
      setEditingSession(false)
    }
  }

  const handleRefreshMissions = async () => {
    // Prevent multiple rapid clicks
    if (refreshingMissions) {
      console.log('Refresh already in progress, ignoring click')
      return
    }
    
    if (!window.confirm('Refresh missions for all users in the active session? This will reassign missions.')) {
      return
    }

    console.log('[AdminDashboard] handleRefreshMissions called')
    setRefreshingMissions(true)
    try {
      await neonApi.resetAndAssignAllMissions()
      // Reload active session data to show updated missions
      if (activeSession) {
        await loadActiveSessionData(activeSession)
      }
      alert('Missions refreshed successfully!')
    } catch (error) {
      console.error('Error refreshing missions:', error)
      alert(`Error refreshing missions: ${error.message || 'Please try again.'}`)
    } finally {
      setRefreshingMissions(false)
    }
  }

  const handleRequestCompleteMission = (mission, userId) => {
    setCompletingMission({ missionId: mission.id, userId, missionType: mission.type || 'unknown' })
    setShowCompleteConfirm(true)
  }

  const handleConfirmCompleteMission = async () => {
    if (!completingMission) return

    const { missionId, userId, missionType } = completingMission

    try {
      let result
      
      if (missionType === 'book') {
        result = await neonApi.adminCompleteBookMission(missionId, userId)
      } else if (missionType === 'passphrase') {
        result = await neonApi.adminCompletePassphraseMission(missionId, userId)
      } else if (missionType === 'object') {
        result = await neonApi.adminCompleteObjectMission(missionId, userId)
      } else {
        alert('Unknown mission type')
        return
      }

      // Reload the active session data to show updated missions
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

  if (!isAdmin) {
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
            <button className="button-secondary">
              Load Existing Session
            </button>
            <button 
              onClick={handleRefreshMissions} 
              className="button-secondary"
              disabled={refreshingMissions}
              title="Refresh missions for all users in the active session"
            >
              {refreshingMissions ? 'Refreshing...' : 'Refresh Missions'}
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
                              <button onClick={() => session.voting_open ? handleCloseVoting(session.id) : handleOpenVoting(session.id)} className="button-secondary">
                                {session.voting_open ? 'Close Voting' : 'Open Voting'}
                              </button>
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
              <h2>Active Session: {activeSession.name}</h2>
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
                <h3>Session Participants and Missions</h3>
                <div className="users-missions-table">
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'var(--unit-base)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-black)' }}>
                        <th style={{ textAlign: 'left', padding: 'var(--unit-base)', borderBottom: '2px solid var(--color-black)' }}>User</th>
                        <th style={{ textAlign: 'left', padding: 'var(--unit-base)', borderBottom: '2px solid var(--color-black)' }}>Alias</th>
                        <th style={{ textAlign: 'left', padding: 'var(--unit-base)', borderBottom: '2px solid var(--color-black)' }}>Team</th>
                        <th style={{ textAlign: 'left', padding: 'var(--unit-base)', borderBottom: '2px solid var(--color-black)' }}>Missions</th>
                        <th style={{ textAlign: 'left', padding: 'var(--unit-base)', borderBottom: '2px solid var(--color-black)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionUsers.map(user => {
                        const missions = userMissions[user.id] || []
                        return (
                          <tr key={user.id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: 'var(--unit-base)' }}>
                              {user.firstname} {user.lastname}
                            </td>
                            <td style={{ padding: 'var(--unit-base)' }}>
                              {user.alias_1} {user.alias_2}
                            </td>
                            <td style={{ padding: 'var(--unit-base)' }}>
                              <span className={`user-team team-${user.team}`} style={{ textTransform: 'capitalize' }}>
                                {user.team}
                              </span>
                            </td>
                            <td style={{ padding: 'var(--unit-base)' }}>
                              {missions.length === 0 ? (
                                <span style={{ fontStyle: 'italic', color: '#888' }}>No missions</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {missions.map((mission, idx) => {
                                    const missionType = mission.type || 'unknown'
                                    
                                    // Special handling for book missions
                                    if (missionType === 'book') {
                                      const bookTitle = mission.book || 'Unknown Book'
                                      const clueText = user.team === 'red' 
                                        ? (mission.clue_red || mission.mission_body || 'No clue')
                                        : (mission.clue_blue || mission.mission_body || 'No clue')
                                      
                                      return (
                                        <div 
                                          key={`${user.id}-${mission.id}-${idx}-book`} 
                                          style={{ 
                                            fontSize: '0.9em',
                                            padding: '8px',
                                            backgroundColor: mission.completed ? '#f0f8f0' : '#f9f9f9',
                                            borderRadius: '4px',
                                            border: mission.completed ? '1px solid #90ee90' : '1px solid #ddd'
                                          }}
                                        >
                                          <div style={{ fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            📖 Book Mission
                                            {mission.completed && (
                                              <span style={{ color: 'green', marginLeft: '8px', fontSize: '0.85em' }}>✓ Completed</span>
                                            )}
                                          </div>
                                          <div style={{ marginBottom: '4px', fontSize: '0.9em' }}>
                                            <strong>Book:</strong> {bookTitle}
                                          </div>
                                          <div style={{ fontSize: '0.85em', color: '#666' }}>
                                            <strong>Clue:</strong> {clueText && clueText.length > 100 
                                              ? clueText.substring(0, 100) + '...'
                                              : clueText
                                            }
                                          </div>
                                          {!mission.completed && (
                                            <button
                                              onClick={() => handleRequestCompleteMission(mission, user.id)}
                                              style={{
                                                marginTop: '6px',
                                                padding: '4px 8px',
                                                fontSize: '0.85em',
                                                cursor: 'pointer',
                                                backgroundColor: '#4CAF50',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px'
                                              }}
                                            >
                                              Complete Mission
                                            </button>
                                          )}
                                        </div>
                                      )
                                    }
                                    
                                    // Special handling for passphrase missions
                                    if (missionType === 'passphrase') {
                                      const isReceiver = mission.assigned_receiver === user.id
                                      const isSender1 = mission.assigned_sender_1 === user.id
                                      const isSender2 = mission.assigned_sender_2 === user.id
                                      const isSender = isSender1 || isSender2
                                      
                                      let passphraseDisplay = ''
                                      let roleDisplay = ''
                                      
                                      if (isReceiver) {
                                        roleDisplay = 'Receiver'
                                        // Show template with [correct/incorrect] format
                                        const template = mission.passphrase_template || 'Unknown passphrase'
                                        const correct = mission.correct_answer || ''
                                        const incorrect = mission.incorrect_answer || ''
                                        passphraseDisplay = template.replace('___', `[${correct}/${incorrect}]`)
                                      } else if (isSender) {
                                        roleDisplay = 'Sender'
                                        // Show full passphrase with the word they're trying to pass
                                        const template = mission.passphrase_template || 'Unknown passphrase'
                                        const wordToPass = isSender1 
                                          ? (mission.correct_answer || '')
                                          : (mission.incorrect_answer || '')
                                        passphraseDisplay = template.replace('___', wordToPass)
                                      }
                                      
                                      return (
                                        <div 
                                          key={`${user.id}-${mission.id}-${idx}-passphrase`} 
                                          style={{ 
                                            fontSize: '0.9em',
                                            padding: '8px',
                                            backgroundColor: mission.completed ? '#f0f8f0' : '#f9f9f9',
                                            borderRadius: '4px',
                                            border: mission.completed ? '1px solid #90ee90' : '1px solid #ddd'
                                          }}
                                        >
                                          <div style={{ fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            💬 Passphrase Mission
                                            {mission.completed && (
                                              <span style={{ color: 'green', marginLeft: '8px', fontSize: '0.85em' }}>✓ Completed</span>
                                            )}
                                          </div>
                                          <div style={{ marginBottom: '4px', fontSize: '0.9em' }}>
                                            <strong>Role:</strong> {roleDisplay}
                                          </div>
                                          <div style={{ fontSize: '0.85em', color: '#666' }}>
                                            <strong>Passphrase:</strong> {passphraseDisplay && passphraseDisplay.length > 100 
                                              ? passphraseDisplay.substring(0, 100) + '...'
                                              : passphraseDisplay
                                            }
                                          </div>
                                          {!mission.completed && (
                                            <button
                                              onClick={() => handleRequestCompleteMission(mission, user.id)}
                                              style={{
                                                marginTop: '6px',
                                                padding: '4px 8px',
                                                fontSize: '0.85em',
                                                cursor: 'pointer',
                                                backgroundColor: '#4CAF50',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px'
                                              }}
                                            >
                                              Complete Mission
                                            </button>
                                          )}
                                        </div>
                                      )
                                    }
                                    
                                    // Standard format for object missions and other types
                                    let missionTitle = ''
                                    let missionDescription = ''
                                    
                                    if (missionType === 'object') {
                                      missionTitle = mission.title || 'Object Mission'
                                      missionDescription = mission.mission_body || 'No description'
                                    } else {
                                      missionTitle = mission.title || 'Mission'
                                      missionDescription = mission.mission_body || mission.description || ''
                                    }
                                    
                                    return (
                                      <div 
                                        key={`${user.id}-${mission.id}-${idx}-${missionType}`} 
                                        style={{ 
                                          fontSize: '0.9em',
                                          padding: '6px',
                                          backgroundColor: mission.completed ? '#f0f8f0' : '#f9f9f9',
                                          borderRadius: '4px',
                                          border: mission.completed ? '1px solid #90ee90' : '1px solid #ddd'
                                        }}
                                      >
                                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                                          {missionType === 'object' && '🎯 '}
                                          {missionTitle}
                                          {mission.completed && (
                                            <span style={{ color: 'green', marginLeft: '8px', fontSize: '0.85em' }}>✓ Completed</span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: '0.85em', color: '#666' }}>
                                          {missionDescription && missionDescription.length > 60 
                                            ? missionDescription.substring(0, 60) + '...'
                                            : missionDescription
                                          }
                                        </div>
                                        {!mission.completed && (
                                          <button
                                            onClick={() => handleRequestCompleteMission(mission, user.id)}
                                            style={{
                                              marginTop: '6px',
                                              padding: '4px 8px',
                                              fontSize: '0.85em',
                                              cursor: 'pointer',
                                              backgroundColor: '#4CAF50',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px'
                                            }}
                                          >
                                            Complete Mission
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: 'var(--unit-base)' }}>
                              <div style={{ fontWeight: 'bold' }}>
                                {missions.length} / 3
                              </div>
                              <div style={{ fontSize: '0.85em', color: '#666' }}>
                                {missions.filter(m => m.completed).length} completed
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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
                <label htmlFor="refresh-interval">Mission Refresh Interval (minutes)</label>
                <input
                  id="refresh-interval"
                  type="number"
                  min="1"
                  value={refreshIntervalMinutes}
                  onChange={(e) => setRefreshIntervalMinutes(parseInt(e.target.value) || 15)}
                  placeholder="15"
                  disabled={creatingSession}
                />
                <small style={{ color: '#888', fontSize: '0.9em' }}>
                  How often missions will refresh for players (default: 15 minutes)
                </small>
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
                <label htmlFor="edit-refresh-interval">Mission Refresh Interval (minutes)</label>
                <input
                  id="edit-refresh-interval"
                  type="number"
                  min="1"
                  value={refreshIntervalMinutes}
                  onChange={(e) => setRefreshIntervalMinutes(parseInt(e.target.value) || 15)}
                  placeholder="15"
                  disabled={editingSession}
                />
                <small style={{ color: '#888', fontSize: '0.9em' }}>
                  How often missions will refresh for players (default: 15 minutes)
                </small>
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
                ×
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

