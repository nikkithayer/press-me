import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { neonApi } from './neonApi'
import { isAdmin } from './utils/admin.js'

function Dashboard({ agentName, agentId, firstName, lastName, alias1, alias2, team, onLogout, currentUser }) {
  const navigate = useNavigate()
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeLeft, setTimeLeft] = useState('Calculating...')
  const [successKeys, setSuccessKeys] = useState({})
  const [agentNameVisible, setAgentNameVisible] = useState(false)
  const [realNameVisible, setRealNameVisible] = useState(false)
  const [teamVisible, setTeamVisible] = useState(false)
  const [completedMissions, setCompletedMissions] = useState(new Set())
  const [activeTab, setActiveTab] = useState('missions')
  const [missionErrors, setMissionErrors] = useState({})
  
  // Intel state
  const [users, setUsers] = useState([])
  const [intelLoading, setIntelLoading] = useState(false)
  const [randomizedAliases, setRandomizedAliases] = useState([])
  const [userSelections, setUserSelections] = useState({})
  const [userAliases, setUserAliases] = useState({})
  const [lockedAliases, setLockedAliases] = useState({}) // Track aliases locked by intel: { userId: [position0, position1] }
  const [aliasTeams, setAliasTeams] = useState({}) // Track team intel for aliases: { alias: 'red' | 'blue' }
  const [dragOverId, setDragOverId] = useState(null)
  const [usedAliases, setUsedAliases] = useState(new Set())
  const [userFilter, setUserFilter] = useState('')
  const [votingOpen, setVotingOpen] = useState(false)
  const [hasSubmittedIntel, setHasSubmittedIntel] = useState(false)
  const [intelScore, setIntelScore] = useState(null)
  const [incorrectAliases, setIncorrectAliases] = useState({}) // { userId: [false, false] } - true if incorrect
  const [incorrectTeams, setIncorrectTeams] = useState({}) // { userId: true/false } - true if incorrect
  
  // Touch drag state
  const [touchedElement, setTouchedElement] = useState(null)
  
  // New state for relationship and alibi
  const [relationship, setRelationship] = useState('')
  const [alibi, setAlibi] = useState('')

  // Ref to store current mission IDs for comparison (avoid recreating interval on every change)
  const missionIdsRef = useRef(new Set())
  // Ref to store current completion status for comparison
  const completedStatusRef = useRef(new Map()) // Map<missionId, completed>
  // Ref to track last session ID and started_at for detecting session changes
  const lastSessionRef = useRef({ id: null, startedAt: null })
  
  // Countdown timer state
  const [nextReassignmentCountdown, setNextReassignmentCountdown] = useState('Calculating...')
  
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
  const [missionIntel, setMissionIntel] = useState(null)
  const [showMissionFailed, setShowMissionFailed] = useState(false)
  const [missionFailedMessage, setMissionFailedMessage] = useState(null)
  const [isInActiveSession, setIsInActiveSession] = useState(false)
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true)
  // Initial secret intel modal state
  const [showInitialIntelModal, setShowInitialIntelModal] = useState(false)
  const [initialIntelRed, setInitialIntelRed] = useState(null)
  const [initialIntelBlue, setInitialIntelBlue] = useState(null)
  const [redRevealed, setRedRevealed] = useState(false)
  const [blueRevealed, setBlueRevealed] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [hasSeenInitialIntel, setHasSeenInitialIntel] = useState(false)
 
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
    setShowMissionSuccess(false) // Reset success state when opening modal
    setShowMissionFailed(false) // Reset failed state when opening modal
    setMissionErrors(prev => ({ ...prev, [missionId]: '' })) // Clear any previous errors
    setMissionIntel(null) // Clear any previous intel
    setMissionFailedMessage(null) // Clear failed message
  }

  const openCompletedMissionModal = async (missionId) => {
    try {
      // Get active session to filter intel to only session users
      const activeSession = await neonApi.getActiveSession()
      if (!activeSession || !activeSession.participant_user_ids) {
        return // No active session
      }
      
      const sessionUserIds = new Set(activeSession.participant_user_ids.map(id => Number(id)))
      
      // Fetch all intel for this agent
      const agentIntel = await neonApi.getAgentIntel(agentId)
      
      // Fetch all users to get user names for user intel
      const allUsers = await neonApi.getUsers()
      
      // Filter users to only session participants
      const sessionUsers = allUsers.filter(user => sessionUserIds.has(user.id))
      
      // Build set of all aliases belonging to session users
      const sessionAliases = new Set()
      sessionUsers.forEach(user => {
        sessionAliases.add(user.alias_1)
        sessionAliases.add(user.alias_2)
      })
      
      // Format intel similar to missionIntel format, but only for session users
      const formattedIntel = []
      
      if (agentIntel && agentIntel.length > 0) {
        for (const intel of agentIntel) {
          // For user intel, only include if the user is in the session
          if (intel.intel_type === 'user') {
            const userId = Number(intel.intel_value)
            if (!sessionUserIds.has(userId)) {
              // Skip intel about users not in the session
              continue
            }
          }
          
          // For team intel, only include if the alias belongs to a session user
          if (intel.intel_type === 'team') {
            if (!sessionAliases.has(intel.alias)) {
              // Skip team intel about aliases not in the session
              continue
            }
          }
          
          let user_name = null
          if (intel.intel_type === 'user') {
            const userInfo = sessionUsers.find(u => u.id === Number(intel.intel_value))
            if (userInfo) {
              user_name = `${userInfo.firstname} ${userInfo.lastname}`
            }
          }
          
          formattedIntel.push({
            alias: intel.alias,
            intel_type: intel.intel_type,
            intel_value: intel.intel_value,
            position: intel.position,
            user_name: user_name
          })
        }
      }
      
      // Open mission modal to show intel
      setSelectedMissionId(missionId)
      setShowMissionModal(true)
      setShowMissionSuccess(true)
      setShowMissionFailed(false)
      
      // Store formatted intel (we'll modify the modal to show all intel)
      // For now, we'll store it as an array in missionIntel
      setMissionIntel(formattedIntel.length > 0 ? formattedIntel : null)
      
      // Refresh intel tab data if it's already loaded
      if (users.length > 0) {
        fetchUsers()
      }
    } catch (error) {
      console.error('Error fetching intel:', error)
    }
  }

  const closeMissionModal = () => {
    setIsMissionClosing(true)
    setTimeout(() => {
      setShowMissionModal(false)
      setIsMissionClosing(false)
      setSelectedMissionId(null)
      setShowMissionSuccess(false)
      setMissionIntel(null) // Clear intel when closing
      setShowMissionFailed(false)
      setMissionFailedMessage(null)
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
          // Convert both to numbers for comparison
          const agentIdNum = Number(agentId)
          const participantIds = activeSession.participant_user_ids.map(id => Number(id))
          const userInSession = participantIds.includes(agentIdNum)
          setIsInActiveSession(userInSession)
          
          // If user is not in active session, clear any missions they might have
          if (!userInSession) {
            setMissions([])
            setLoading(false)
          }
        } else {
          // No active session exists
          setIsInActiveSession(false)
          setMissions([])
          setLoading(false)
        }
      } catch (error) {
        console.error('Error checking active session:', error)
        setIsInActiveSession(false)
        setMissions([])
        setLoading(false)
      } finally {
        setSessionCheckLoading(false)
      }
    }
    
    checkActiveSession()
    getRandomBackstory() // Initialize with random backstory
  }, [agentId])

  useEffect(() => {
    // Only fetch missions if user is in active session
    if (isInActiveSession && !sessionCheckLoading) {
      fetchRandomMissions()
    } else if (!isInActiveSession) {
      // If not in active session, clear any errors
      setError(null)
    }
  }, [agentId, isInActiveSession, sessionCheckLoading])

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

  useEffect(() => {
    if (teamVisible) {
      const timer = setTimeout(() => {
        setTeamVisible(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [teamVisible])

  // Fetch users when intel tab is accessed (only if in active session)
  useEffect(() => {
    if (activeTab === 'intel' && users.length === 0 && isInActiveSession) {
      fetchUsers()
    }
  }, [activeTab, isInActiveSession])

  // Check if voting is open and if user has submitted intel when intel tab is active
  useEffect(() => {
    const checkVotingStatus = async () => {
      if (activeTab === 'intel' && isInActiveSession) {
        try {
          const activeSession = await neonApi.getActiveSession()
          if (activeSession) {
            const currentSessionId = activeSession.id
            const currentStartedAt = activeSession.started_at ? String(activeSession.started_at) : null
            const intelSessionKey = `intel_submitted_${currentSessionId}_${agentId}`
            const intelTimestampKey = `intel_submitted_${currentSessionId}_${agentId}_started`
            
            // Check if session changed or was reset
            const storedStartedAt = localStorage.getItem(intelTimestampKey)
            const sessionChanged = lastSessionRef.current.id !== null && lastSessionRef.current.id !== currentSessionId
            const sessionReset = storedStartedAt && currentStartedAt && storedStartedAt !== currentStartedAt
            const sessionCleared = storedStartedAt && currentStartedAt === null
            
            // Clear localStorage if session changed or was reset
            if (sessionChanged || sessionReset || sessionCleared) {
              console.log('[INTEL-SUBMIT] Session changed or reset, clearing submission localStorage')
              localStorage.removeItem(intelSessionKey)
              localStorage.removeItem(intelTimestampKey)
              // Clear intel assignments localStorage
              localStorage.removeItem(`intel_aliases_${currentSessionId}_${agentId}`)
              localStorage.removeItem(`intel_selections_${currentSessionId}_${agentId}`)
              setHasSubmittedIntel(false)
              setIntelScore(null)
            }
            
            // Update tracked session info
            lastSessionRef.current.id = currentSessionId
            lastSessionRef.current.startedAt = currentStartedAt
            
            const votingStatus = activeSession.voting_open || false
            setVotingOpen(votingStatus)
            
            // Check if user has already submitted intel for this session
            if (votingStatus) {
              const submitted = localStorage.getItem(intelSessionKey) === 'true'
              
              if (submitted && !sessionChanged && !sessionReset && !sessionCleared) {
                // User has submitted, fetch their score
                const score = await neonApi.getUserScore(agentId)
                setHasSubmittedIntel(true)
                setIntelScore(score)
              } else {
                setHasSubmittedIntel(false)
                setIntelScore(null)
              }
            } else {
              // Voting not open, reset submission status
              setHasSubmittedIntel(false)
              setIntelScore(null)
            }
          } else {
            setVotingOpen(false)
            setHasSubmittedIntel(false)
            setIntelScore(null)
            lastSessionRef.current.id = null
            lastSessionRef.current.startedAt = null
          }
        } catch (error) {
          console.error('Error checking voting status:', error)
          setVotingOpen(false)
          setHasSubmittedIntel(false)
          setIntelScore(null)
        }
      }
    }
    
    checkVotingStatus()
    
    // Poll for voting status changes every 2 seconds when on intel tab
    let interval
    if (activeTab === 'intel' && isInActiveSession) {
      interval = setInterval(checkVotingStatus, 2000)
    }
    
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [activeTab, isInActiveSession, agentId])

  // Show initial intel modal when intel tab is first accessed
  useEffect(() => {
    const checkInitialIntel = async () => {
      if (activeTab === 'intel' && isInActiveSession && users.length > 0) {
        // Check if we've seen initial intel for this session in localStorage
        const activeSession = await neonApi.getActiveSession()
        if (activeSession) {
          const sessionKey = `initialIntel_${activeSession.id}_${agentId}`
          const sessionTimestampKey = `initialIntel_${activeSession.id}_${agentId}_started`
          const seen = localStorage.getItem(sessionKey)
          const storedStartedAt = localStorage.getItem(sessionTimestampKey)
          
          // Get current session started_at timestamp and status
          const currentStartedAt = activeSession.started_at ? String(activeSession.started_at) : null
          const currentStatus = activeSession.status
          
          // Store status along with timestamp for better detection
          const sessionStatusKey = `initialIntel_${activeSession.id}_${agentId}_status`
          const storedStatus = localStorage.getItem(sessionStatusKey)
          
          // Check if session was reset:
          // 1. If session status is 'draft' but we had seen it when it was 'active'/'paused'/'ended' (reset back to draft)
          // 2. If we had a stored started_at but now it's null (session was reset)
          // 3. If the current started_at is different from stored (session restarted with new timestamp)
          // 4. If stored status was NOT 'draft' but current status is 'active' with different started_at (reset and restarted)
          const statusChangedToDraft = storedStatus && storedStatus !== 'draft' && currentStatus === 'draft'
          const statusChangedFromActiveToActive = storedStatus === 'active' && currentStatus === 'active' && 
                                                   storedStartedAt && currentStartedAt && storedStartedAt !== currentStartedAt
          const startedAtChanged = storedStartedAt && currentStartedAt && storedStartedAt !== currentStartedAt
          const startedAtCleared = storedStartedAt && currentStartedAt === null
          
          const sessionWasReset = statusChangedToDraft || statusChangedFromActiveToActive || startedAtChanged || startedAtCleared
          
          console.log('[INITIAL-INTEL] Session check:', {
            sessionId: activeSession.id,
            storedStartedAt,
            currentStartedAt,
            storedStatus,
            currentStatus,
            statusChangedToDraft,
            statusChangedFromActiveToActive,
            startedAtChanged,
            startedAtCleared,
            sessionWasReset,
            seen
          })
          
          // Clear localStorage if session was reset
          if (sessionWasReset) {
            console.log('[INITIAL-INTEL] Session was reset, clearing localStorage')
            localStorage.removeItem(sessionKey)
            localStorage.removeItem(sessionTimestampKey)
            localStorage.removeItem(sessionStatusKey)
            setHasSeenInitialIntel(false)
          }
          
          // Show modal if not seen (or was reset)
          if (!seen || sessionWasReset) {
            // Get one red and one blue team member (exclude current user)
            const redUsers = users.filter(u => u.team === 'red' && u.id !== agentId)
            const blueUsers = users.filter(u => u.team === 'blue' && u.id !== agentId)
            
            if (redUsers.length > 0 && blueUsers.length > 0) {
              // Pick random users
              const redUser = redUsers[Math.floor(Math.random() * redUsers.length)]
              const blueUser = blueUsers[Math.floor(Math.random() * blueUsers.length)]
              
              setInitialIntelRed(`${redUser.firstname} ${redUser.lastname}`)
              setInitialIntelBlue(`${blueUser.firstname} ${blueUser.lastname}`)
              setShowInitialIntelModal(true)
              setRedRevealed(false)
              setBlueRevealed(false)
              setCountdown(null)
              
              // Mark as seen immediately to prevent duplicate modals
              setHasSeenInitialIntel(true)
              localStorage.setItem(sessionKey, 'true')
              // Store the started_at timestamp and status to detect resets
              if (currentStartedAt) {
                localStorage.setItem(sessionTimestampKey, currentStartedAt)
              }
              if (currentStatus) {
                localStorage.setItem(sessionStatusKey, currentStatus)
              }
            }
          } else {
            // Already seen for this session
            setHasSeenInitialIntel(true)
            // Update stored timestamp and status if they exist and are different (session restarted)
            if (currentStartedAt && storedStartedAt !== currentStartedAt) {
              localStorage.setItem(sessionTimestampKey, currentStartedAt)
            }
            if (currentStatus && storedStatus !== currentStatus) {
              localStorage.setItem(sessionStatusKey, currentStatus)
            }
          }
        }
      }
    }
    
    checkInitialIntel()
  }, [activeTab, isInActiveSession, users, agentId])

  // Handle countdown after reveal
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0) {
      // Close modal
      setShowInitialIntelModal(false)
      setCountdown(null)
      setRedRevealed(false)
      setBlueRevealed(false)
      setInitialIntelRed(null)
      setInitialIntelBlue(null)
    }
  }, [countdown])

  // Auto-check every 3 seconds for mission reassignments and updates
  useEffect(() => {
    // Update the refs whenever missions change
    missionIdsRef.current = new Set(missions.map(m => m.id))
    const completedMap = new Map()
    missions.forEach(m => {
      completedMap.set(m.id, m.completed || false)
    })
    completedStatusRef.current = completedMap
  }, [missions])

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
          
          // Also check if session was reset (for initial intel and intel submission clearing)
          if (userInSession && activeSession.id) {
            const sessionTimestampKey = `initialIntel_${activeSession.id}_${agentId}_started`
            const sessionStatusKey = `initialIntel_${activeSession.id}_${agentId}_status`
            const sessionKey = `initialIntel_${activeSession.id}_${agentId}`
            const intelSessionKey = `intel_submitted_${activeSession.id}_${agentId}`
            const intelTimestampKey = `intel_submitted_${activeSession.id}_${agentId}_started`
            
            const storedStartedAt = localStorage.getItem(sessionTimestampKey)
            const storedStatus = localStorage.getItem(sessionStatusKey)
            const storedIntelStartedAt = localStorage.getItem(intelTimestampKey)
            const currentStartedAt = activeSession.started_at ? String(activeSession.started_at) : null
            const currentStatus = activeSession.status
            
            // Check if session was reset
            const statusChangedToDraft = storedStatus && storedStatus !== 'draft' && currentStatus === 'draft'
            const statusChangedFromActiveToActive = storedStatus === 'active' && currentStatus === 'active' && 
                                                   storedStartedAt && currentStartedAt && storedStartedAt !== currentStartedAt
            const startedAtChanged = storedStartedAt && currentStartedAt && storedStartedAt !== currentStartedAt
            const startedAtCleared = storedStartedAt && currentStartedAt === null
            const intelStartedAtChanged = storedIntelStartedAt && currentStartedAt && storedIntelStartedAt !== currentStartedAt
            const intelStartedAtCleared = storedIntelStartedAt && currentStartedAt === null
            
            if (statusChangedToDraft || statusChangedFromActiveToActive || startedAtChanged || startedAtCleared) {
              console.log('[SESSION-CHECK] Detected session reset, clearing initial intel and intel submission localStorage')
              localStorage.removeItem(sessionKey)
              localStorage.removeItem(sessionTimestampKey)
              localStorage.removeItem(sessionStatusKey)
              localStorage.removeItem(intelSessionKey)
              localStorage.removeItem(intelTimestampKey)
              // Clear intel assignments localStorage
              localStorage.removeItem(`intel_aliases_${activeSession.id}_${agentId}`)
              localStorage.removeItem(`intel_selections_${activeSession.id}_${agentId}`)
              setHasSeenInitialIntel(false)
              setHasSubmittedIntel(false)
              setIntelScore(null)
            } else if (intelStartedAtChanged || intelStartedAtCleared) {
              // Session reset detected via intel submission timestamp
              console.log('[SESSION-CHECK] Detected session reset via intel timestamp, clearing intel submission localStorage')
              localStorage.removeItem(intelSessionKey)
              localStorage.removeItem(intelTimestampKey)
              // Clear intel assignments localStorage
              localStorage.removeItem(`intel_aliases_${activeSession.id}_${agentId}`)
              localStorage.removeItem(`intel_selections_${activeSession.id}_${agentId}`)
              setHasSubmittedIntel(false)
              setIntelScore(null)
            }
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
    }, 10000) // Check every 10 seconds
    
    return () => clearInterval(interval)
  }, [agentId, isInActiveSession])

  useEffect(() => {
    // Only auto-check missions if user is in active session
    // NOTE: This only FETCHES missions, it does NOT reassign them
    // Only admin panel can reassign missions
    if (!isInActiveSession) {
      return
    }
    
    const checkMissions = async () => {
      try {
        // Just fetch missions - don't trigger reassignment
        const newMissions = await neonApi.getAllMissionsForAgent(agentId)
        
        // Clear error if missions fetch succeeds (getAllMissionsForAgent never throws, so success)
        setError(null)
        
        // Compare mission IDs and completion status to detect changes
        // Use both refs and current state to handle race conditions during refreshes
        const currentMissionIdsFromRef = missionIdsRef.current
        const currentMissionIdsFromState = new Set(missions.map(m => m.id))
        const newMissionIds = new Set(newMissions.map(m => m.id))
        
        // Check if there's a mismatch between state and refs (indicates refresh in progress)
        const stateRefMismatch = currentMissionIdsFromRef.size !== currentMissionIdsFromState.size ||
          [...currentMissionIdsFromState].some(id => !currentMissionIdsFromRef.has(id)) ||
          [...currentMissionIdsFromRef].some(id => !currentMissionIdsFromState.has(id))
        
        // Check if mission IDs have changed (compare new missions against both state and refs)
        const missionIdsChangedFromState = 
          currentMissionIdsFromState.size !== newMissionIds.size ||
          [...newMissionIds].some(id => !currentMissionIdsFromState.has(id)) ||
          [...currentMissionIdsFromState].some(id => !newMissionIds.has(id))
        
        const missionIdsChangedFromRef = 
          currentMissionIdsFromRef.size !== newMissionIds.size ||
          [...newMissionIds].some(id => !currentMissionIdsFromRef.has(id)) ||
          [...currentMissionIdsFromRef].some(id => !newMissionIds.has(id))
        
        // If state and refs don't match, or if either shows a change, consider it changed
        const missionIdsChanged = missionIdsChangedFromState || missionIdsChangedFromRef || stateRefMismatch
        
        // Check if completion status has changed
        // Build current status from actual missions state (more reliable than ref during refresh)
        const currentCompletedStatusFromState = new Map()
        missions.forEach(m => {
          currentCompletedStatusFromState.set(m.id, m.completed || false)
        })
        const currentCompletedStatusFromRef = completedStatusRef.current
        
        let completionStatusChanged = false
        
        // Check all new missions for completion status changes
        for (const newMission of newMissions) {
          const currentCompletedFromState = currentCompletedStatusFromState.get(newMission.id) ?? false
          const currentCompletedFromRef = currentCompletedStatusFromRef.get(newMission.id) ?? false
          const newCompleted = newMission.completed || false
          
          // Check if completion status has changed (check both state and ref)
          if (currentCompletedFromState !== newCompleted || currentCompletedFromRef !== newCompleted) {
            completionStatusChanged = true
            break
          }
        }
        
        // Also check if any missions in state or refs are missing from new missions
        for (const currentId of currentMissionIdsFromState) {
          if (!newMissionIds.has(currentId)) {
            missionIdsChanged = true
            break
          }
        }
        
        // Always update if missions have changed (IDs, count, or completion status)
        // This ensures old missions disappear when they're unassigned and completion status updates
        if (missionIdsChanged || completionStatusChanged) {
          setMissions([...newMissions]) // Use spread to ensure new array reference
          // Update refs with new mission IDs and completion status
          missionIdsRef.current = newMissionIds
          const newCompletedMap = new Map()
          newMissions.forEach(m => {
            newCompletedMap.set(m.id, m.completed || false)
          })
          completedStatusRef.current = newCompletedMap
          // Update completed missions state based on new mission data
          const completedSet = new Set(newMissions.filter(m => m.completed).map(m => m.id))
          setCompletedMissions(completedSet)
          setSuccessKeys({})
        }
      } catch (error) {
        // console.error('[AUTO-CHECK] Error checking missions:', error)
        // console.error('[AUTO-CHECK] Error stack:', error.stack)
        // Silently fail - don't show errors to user
        // Only log if it's a real error (not just empty missions)
        if (error && error.message && !error.message.includes('session')) {
          console.error('[AUTO-CHECK] Error checking missions:', error)
        }
      }
    }
    
    // Initial check after 1 second (give time for initial load)
    const initialTimer = setTimeout(() => {
      checkMissions()
    }, 1000)
    
    // Then check every 3 seconds (just to refresh mission state, not reassign)
    const interval = setInterval(() => {
      checkMissions()
    }, 3000)
    
    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [agentId, isInActiveSession]) // Depend on agentId and isInActiveSession

  // Countdown timer for next mission reassignment (display only - no automatic reassignment)
  useEffect(() => {
    const updateCountdown = async () => {
      try {
        const lastAssigned = await neonApi.getLastAssignmentTimestamp()
        
        if (!lastAssigned) {
          setNextReassignmentCountdown('Unknown')
          return
        }
        
        const now = new Date()
        const lastAssignedDate = new Date(lastAssigned)
        
        // Calculate difference - handle timezone issues same way as shouldReassignMissions
        let diffMs = now.getTime() - lastAssignedDate.getTime()
        let diffMinutes = diffMs / (1000 * 60)
        
        // Handle timezone offset (same logic as shouldReassignMissions)
        if (diffMs < 0 && Math.abs(diffMinutes) > 400 && Math.abs(diffMinutes) < 500) {
          const timezoneOffsetMinutes = 480 // PST is UTC-8
          const actualElapsedMs = diffMs + (timezoneOffsetMinutes * 60 * 1000)
          diffMinutes = actualElapsedMs / (1000 * 60)
        } else if (diffMinutes < 0) {
          diffMinutes = Math.abs(diffMinutes)
        }
        
        // Get the refresh interval from the active session (default to 15 minutes if not set)
        const activeSession = await neonApi.getActiveSession()
        const reassignmentIntervalMinutes = activeSession?.mission_refresh_interval_minutes || 15
        const elapsedMinutes = diffMinutes
        const remainingMinutes = Math.max(0, reassignmentIntervalMinutes - elapsedMinutes)
        
        if (remainingMinutes <= 0) {
          setNextReassignmentCountdown('Admin can reassign')
        } else {
          const totalSeconds = Math.floor(remainingMinutes * 60)
          const minutes = Math.floor(totalSeconds / 60)
          const seconds = totalSeconds % 60
          
          if (minutes > 0) {
            setNextReassignmentCountdown(`${minutes}m ${seconds}s`)
          } else {
            setNextReassignmentCountdown(`${seconds}s`)
          }
        }
      } catch (error) {
        setNextReassignmentCountdown('Error calculating')
      }
    }
    
    // Update immediately
    updateCountdown()
    
    // Update every second
    const interval = setInterval(() => {
      updateCountdown()
    }, 1000)
    
    return () => {
      clearInterval(interval)
    }
  }, [missions, agentId]) // Reset countdown when missions change (reassignment happened)

  const fetchUsers = async () => {
    try {
      setIntelLoading(true)
      
      // Get active session to filter users
      const activeSession = await neonApi.getActiveSession()
      if (!activeSession || !activeSession.participant_user_ids) {
        setUsers([])
        setRandomizedAliases([])
        setIntelLoading(false)
        return
      }
      
      const sessionUserIds = new Set(activeSession.participant_user_ids.map(id => Number(id)))
      
      // Get all users and filter to only those in the active session
      const allUsers = await neonApi.getUsers()
      const sessionUsers = allUsers.filter(user => sessionUserIds.has(user.id))
      setUsers(sessionUsers)
      
      // Get agent's intel
      const agentIntel = await neonApi.getAgentIntel(agentId)
      
      // Initialize user selections with 'unknown' for all teams (only for session users)
      const selections = {}
      const knownAliases = {} // { userId: [alias1, alias2] }
      const lockedPositions = {} // { userId: [position0, position1] - true if locked }
      
      sessionUsers.forEach(user => {
        selections[user.id] = 'unknown'
        knownAliases[user.id] = [null, null]
        lockedPositions[user.id] = [false, false]
      })
      
      // Track team intel for aliases
      const aliasTeamMap = {}
      
      // Process agent intel to populate known aliases (only for session users)
      agentIntel.forEach(intel => {
        if (intel.intel_type === 'user' && intel.position) {
          // Find the user this intel is about (only if they're in the session)
          const userInfo = sessionUsers.find(u => u.id === Number(intel.intel_value))
          if (userInfo) {
            const positionIndex = intel.position - 1 // position is 1 or 2, array index is 0 or 1
            knownAliases[userInfo.id][positionIndex] = intel.alias
            lockedPositions[userInfo.id][positionIndex] = true
          }
        } else if (intel.intel_type === 'team') {
          // Store team affiliation for this alias
          aliasTeamMap[intel.alias] = intel.intel_value
        }
      })
      
      // Load saved assignments from localStorage
      const aliasesStorageKey = `intel_aliases_${activeSession.id}_${agentId}`
      const selectionsStorageKey = `intel_selections_${activeSession.id}_${agentId}`
      
      try {
        const savedAliases = localStorage.getItem(aliasesStorageKey)
        const savedSelections = localStorage.getItem(selectionsStorageKey)
        
        if (savedAliases) {
          const parsedAliases = JSON.parse(savedAliases)
          // Merge saved aliases with known aliases (known aliases take precedence for locked positions)
          Object.keys(parsedAliases).forEach(userId => {
            const userIdNum = Number(userId)
            if (sessionUserIds.has(userIdNum)) {
              const savedAliasPair = parsedAliases[userId] || [null, null]
              const isLocked = lockedPositions[userIdNum] || [false, false]
              
              // Merge: use known alias if locked, otherwise use saved
              knownAliases[userIdNum] = [
                isLocked[0] ? knownAliases[userIdNum][0] : (savedAliasPair[0] || null),
                isLocked[1] ? knownAliases[userIdNum][1] : (savedAliasPair[1] || null)
              ]
            }
          })
        }
        
        if (savedSelections) {
          const parsedSelections = JSON.parse(savedSelections)
          // Merge saved selections
          Object.keys(parsedSelections).forEach(userId => {
            const userIdNum = Number(userId)
            if (sessionUserIds.has(userIdNum)) {
              selections[userIdNum] = parsedSelections[userId] || 'unknown'
            }
          })
        }
      } catch (error) {
        console.error('Error loading saved intel assignments from localStorage:', error)
      }
      
      setUserSelections(selections)
      setUserAliases(knownAliases)
      setLockedAliases(lockedPositions)
      setAliasTeams(aliasTeamMap)
      
      // Randomize aliases, excluding known ones (only from session users)
      const allAliases = sessionUsers.flatMap(user => [user.alias_1, user.alias_2])
      const knownAliasSet = new Set(Object.values(knownAliases).flat().filter(a => a !== null && a !== undefined))
      const unknownAliases = allAliases.filter(alias => !knownAliasSet.has(alias))
      const shuffled = [...unknownAliases].sort(() => Math.random() - 0.5)
      setRandomizedAliases(shuffled)
      
      // Mark known aliases as used so they don't appear in the pool
      setUsedAliases(knownAliasSet)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setIntelLoading(false)
    }
  }

  const handleTeamSelection = (userId, team) => {
    setUserSelections(prev => {
      const updated = {
        ...prev,
        [userId]: team
      }
      
      return updated
    })
    
    // Save to localStorage async
    const saveToStorage = async () => {
      try {
        const activeSession = await neonApi.getActiveSession()
        if (activeSession) {
          const storageKey = `intel_selections_${activeSession.id}_${agentId}`
          setUserSelections(prev => {
            localStorage.setItem(storageKey, JSON.stringify(prev))
            return prev
          })
        }
      } catch (error) {
        console.error('Error saving team selection to localStorage:', error)
      }
    }
    saveToStorage()
    
    // Clear incorrect status for this user's team when they change their guess
    setIncorrectTeams(prev => {
      const updated = { ...prev }
      if (updated[userId]) {
        delete updated[userId]
      }
      return updated
    })
  }

  const handleDragStart = (e, alias) => {
    e.dataTransfer.setData('text/plain', alias)
    e.target.classList.add('dragging')
  }

  const handleDragOver = (e, userId, targetIndex) => {
    e.preventDefault()
    setDragOverId(`${userId}-${targetIndex}`)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging')
  }

  const handleDrop = (e, userId, targetIndex) => {
    e.preventDefault()
    
    // Prevent dropping on locked positions
    if (lockedAliases[userId]?.[targetIndex]) {
      setDragOverId(null)
      return
    }
    
    const alias = e.dataTransfer.getData('text/plain')
    
    // Remove the dragging class from all elements
    document.querySelectorAll('.alias-section .dragging').forEach(el => {
      el.classList.remove('dragging')
    })
    
    // Get the current aliases for this user
    const currentAliases = userAliases[userId] || []
    const existingAlias = currentAliases[targetIndex]
    
    // If there's already an alias in this position, return it to the alias-section
    if (existingAlias) {
      setUsedAliases(prev => {
        const updated = new Set(prev)
        updated.delete(existingAlias)
        return updated
      })
    }
    
    // Add the new alias to the drop zone
    setUserAliases(prev => {
      const current = prev[userId] || []
      const updated = [...current]
      updated[targetIndex] = alias
      const result = {
        ...prev,
        [userId]: updated
      }
      
      // Save to localStorage
      const saveToStorage = async () => {
        try {
          const activeSession = await neonApi.getActiveSession()
          if (activeSession) {
            const storageKey = `intel_aliases_${activeSession.id}_${agentId}`
            localStorage.setItem(storageKey, JSON.stringify(result))
          }
        } catch (error) {
          console.error('Error saving alias assignment to localStorage:', error)
        }
      }
      saveToStorage()
      
      return result
    })
    
    // Mark the new alias as used
    setUsedAliases(prev => new Set([...prev, alias]))
    
    // Clear incorrect status for this alias position when user changes their guess
    setIncorrectAliases(prev => {
      const updated = { ...prev }
      if (updated[userId] && updated[userId][targetIndex]) {
        updated[userId] = [...(updated[userId] || [false, false])]
        updated[userId][targetIndex] = false
      }
      return updated
    })
    
    setDragOverId(null)
  }

  const handleRemoveAlias = (userId, targetIndex) => {
    // Prevent removing locked aliases
    if (lockedAliases[userId]?.[targetIndex]) {
      return
    }
    
    const currentAliases = userAliases[userId] || []
    const aliasToRemove = currentAliases[targetIndex]
    
    if (aliasToRemove) {
      // Remove from userAliases
      setUserAliases(prev => {
        const current = prev[userId] || []
        const updated = [...current]
        updated[targetIndex] = undefined
        const result = {
          ...prev,
          [userId]: updated
        }
        
        // Save to localStorage
        const saveToStorage = async () => {
          try {
            const activeSession = await neonApi.getActiveSession()
            if (activeSession) {
              const storageKey = `intel_aliases_${activeSession.id}_${agentId}`
              localStorage.setItem(storageKey, JSON.stringify(result))
            }
          } catch (error) {
            console.error('Error saving alias removal to localStorage:', error)
          }
        }
        saveToStorage()
        
        return result
      })
      
      // Return to alias-section by removing from usedAliases
      setUsedAliases(prev => {
        const updated = new Set(prev)
        updated.delete(aliasToRemove)
        return updated
      })
      
      // Clear incorrect status for this alias position when user removes their guess
      setIncorrectAliases(prev => {
        const updated = { ...prev }
        if (updated[userId] && updated[userId][targetIndex]) {
          updated[userId] = [...(updated[userId] || [false, false])]
          updated[userId][targetIndex] = false
        }
        return updated
      })
    }
  }

  const handleClearAll = () => {
    // Reset all team selections to unknown
    const unknownSelections = {}
    users.forEach(user => {
      unknownSelections[user.id] = 'unknown'
    })
    setUserSelections(unknownSelections)
    
    // Clear all aliases except locked ones
    const clearedAliases = {}
    const allAliases = new Set()
    users.forEach(user => {
      clearedAliases[user.id] = [null, null]
      // Keep locked aliases
      if (lockedAliases[user.id]?.[0] && userAliases[user.id]?.[0]) {
        clearedAliases[user.id][0] = userAliases[user.id][0]
        allAliases.add(userAliases[user.id][0])
      }
      if (lockedAliases[user.id]?.[1] && userAliases[user.id]?.[1]) {
        clearedAliases[user.id][1] = userAliases[user.id][1]
        allAliases.add(userAliases[user.id][1])
      }
    })
    setUserAliases(clearedAliases)
    
    // Keep locked aliases marked as used, clear others
    setUsedAliases(allAliases)
  }

  // Touch handlers for mobile
  const handleTouchStart = (e, alias) => {
    e.preventDefault()
    const touch = e.touches[0]
    const target = e.currentTarget
    
    setTouchedElement({
      alias,
      element: target,
      startX: touch.clientX,
      startY: touch.clientY
    })
    
    target.classList.add('dragging')
  }

  const handleTouchMove = (e) => {
    if (!touchedElement) return
    
    e.preventDefault()
    const touch = e.touches[0]
    
    // Find the element under the touch point
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const dropZone = element?.closest('.drop-zone')
    
    if (dropZone) {
      // Extract userId and targetIndex from data attributes
      const userId = dropZone.getAttribute('data-user-id')
      const targetIndex = dropZone.getAttribute('data-target-index')
      
      if (userId && targetIndex !== null) {
        // Don't allow drag over locked positions
        const index = parseInt(targetIndex, 10)
        if (!lockedAliases[userId]?.[index]) {
          const foundId = `${userId}-${targetIndex}`
          setDragOverId(foundId)
        } else {
          setDragOverId(null)
        }
      }
    } else {
      setDragOverId(null)
    }
  }

  const handleTouchEnd = (e) => {
    if (!touchedElement) return
    
    e.preventDefault()
    const touch = e.changedTouches[0]
    
    // Remove dragging class
    touchedElement.element.classList.remove('dragging')
    
    // Find the element under the touch point
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const dropZone = element?.closest('.drop-zone')
    
    if (dropZone) {
      // Extract userId and targetIndex from data attributes
      const userId = dropZone.getAttribute('data-user-id')
      const targetIndex = parseInt(dropZone.getAttribute('data-target-index'), 10)
      
      if (userId && !isNaN(targetIndex)) {
        // Prevent dropping on locked positions
        if (lockedAliases[userId]?.[targetIndex]) {
          setTouchedElement(null)
          setDragOverId(null)
          return
        }
        
        // Use the existing handleDrop logic
        const alias = touchedElement.alias
        
        // Get the current aliases for this user
        const currentAliases = userAliases[userId] || []
        const existingAlias = currentAliases[targetIndex]
        
        // If there's already an alias in this position, return it to the alias-section
        if (existingAlias) {
          setUsedAliases(prev => {
            const updated = new Set(prev)
            updated.delete(existingAlias)
            return updated
          })
        }
        
        // Add the new alias to the drop zone
        setUserAliases(prev => {
          const current = prev[userId] || []
          const updated = [...current]
          updated[targetIndex] = alias
          return {
            ...prev,
            [userId]: updated
          }
        })
        
        // Mark the new alias as used
        setUsedAliases(prev => new Set([...prev, alias]))
        
        // Clear incorrect status for this alias position when user changes their guess
        setIncorrectAliases(prev => {
          const updated = { ...prev }
          if (updated[userId] && updated[userId][targetIndex]) {
            updated[userId] = [...(updated[userId] || [false, false])]
            updated[userId][targetIndex] = false
          }
          return updated
        })
      }
    }
    
    setTouchedElement(null)
    setDragOverId(null)
  }

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

  const fetchRandomMissions = async (doReset = false) => {
    try {
      setLoading(true)
      setError(null) // Clear any previous errors
      // NOTE: doReset parameter is ignored - only admin panel can reassign missions
      // Just fetch missions - don't attempt reassignment
      let assignedMissions = await neonApi.getAllMissionsForAgent(agentId)
      
      // getAllMissionsForAgent always returns an array (never throws)
      // Empty array is valid - means no missions assigned yet
      setMissions(assignedMissions || [])
      // Update refs with mission IDs and completion status
      missionIdsRef.current = new Set((assignedMissions || []).map(m => m.id))
      const completedMap = new Map()
      (assignedMissions || []).forEach(m => {
        completedMap.set(m.id, m.completed || false)
      })
      completedStatusRef.current = completedMap
      // Set completed missions state based on mission data
      const completedSet = new Set((assignedMissions || []).filter(m => m.completed).map(m => m.id))
      setCompletedMissions(completedSet)
      setSuccessKeys({})
      // Clear any existing errors when refreshing
      setMissionErrors({})
    } catch (error) {
      // This should rarely be hit now since getAllMissionsForAgent doesn't throw
      // But if it does, log it with details
      console.error('Error fetching missions:', error)
      console.error('Error details:', error.message, error.stack)
      // Only set error if it's a real error (not just empty missions)
      if (error && error.message) {
        setError('Failed to fetch missions: ' + error.message)
      } else {
        // Unknown error - but don't show error if missions fetch succeeded
        setError(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    onLogout()
  }

  const handleRevealAll = () => {
    // Reveal both names when reveal button is clicked
    if (!redRevealed || !blueRevealed) {
      setRedRevealed(true)
      setBlueRevealed(true)
      // Start countdown if it hasn't started yet
      if (countdown === null) {
        setCountdown(5)
      }
    }
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

  const handleSuccessKeyChange = (missionId, value) => {
    setSuccessKeys(prev => ({
      ...prev,
      [missionId]: value
    }))
    // Clear error when user starts typing
    if (missionErrors[missionId]) {
      setMissionErrors(prev => ({ ...prev, [missionId]: '' }))
    }
  }

  const handleSubmitIntel = async () => {
    try {
      // Prevent multiple submissions
      if (hasSubmittedIntel) {
        return
      }

      // Confirm submission
      if (!window.confirm('Submit your intel guesses? This will calculate your score based on correct answers. You can only submit once.')) {
        return
      }

      // Collect all guesses
      const guesses = {}
      
      // For each user in the session, collect their guesses
      users.forEach(user => {
        const userAliasGuesses = userAliases[user.id] || [null, null]
        const teamGuess = userSelections[user.id] || 'unknown'
        
        guesses[user.id] = {
          aliases: [
            userAliasGuesses[0] || null,
            userAliasGuesses[1] || null
          ],
          team: teamGuess
        }
      })

      // Submit intel
      const result = await neonApi.submitIntel(agentId, guesses)
      
      // Mark as submitted in localStorage and store session timestamp
      const activeSession = await neonApi.getActiveSession()
      if (activeSession) {
        const sessionKey = `intel_submitted_${activeSession.id}_${agentId}`
        const timestampKey = `intel_submitted_${activeSession.id}_${agentId}_started`
        localStorage.setItem(sessionKey, 'true')
        if (activeSession.started_at) {
          localStorage.setItem(timestampKey, String(activeSession.started_at))
        }
      }
      
      // Update state to show submission
      setHasSubmittedIntel(true)
      setIntelScore(result.newScore)
      
      // Process result to track incorrect guesses
      const incorrectAliasMap = {}
      const incorrectTeamMap = {}
      
      // Initialize all users as no incorrect guesses
      users.forEach(user => {
        incorrectAliasMap[user.id] = [false, false]
        incorrectTeamMap[user.id] = false
      })
      
      // Mark incorrect guesses based on result details
      if (result.details) {
        result.details.forEach(detail => {
          if (detail.type === 'alias' && !detail.correct) {
            if (!incorrectAliasMap[detail.userId]) {
              incorrectAliasMap[detail.userId] = [false, false]
            }
            incorrectAliasMap[detail.userId][detail.position] = true
          } else if (detail.type === 'team' && !detail.correct) {
            incorrectTeamMap[detail.userId] = true
          }
        })
      }
      
      // Update state to show red borders
      setIncorrectAliases(incorrectAliasMap)
      setIncorrectTeams(incorrectTeamMap)
    } catch (error) {
      console.error('Error submitting intel:', error)
      alert(`Error submitting intel: ${error.message || 'Please try again.'}`)
    }
  }

  const handleSubmitMission = async (missionId) => {
    const successKey = successKeys[missionId]
    if (!successKey) return

    // Find the mission to determine its type
    const mission = missions.find(m => m.id === missionId)
    if (!mission) {
      setMissionErrors(prev => ({ ...prev, [missionId]: 'Mission not found' }))
      return
    }

    // Clear any existing error for this mission
    setMissionErrors(prev => ({ ...prev, [missionId]: '' }))
    setShowMissionSuccess(false) // Reset success state
    setMissionIntel(null)

    try {
      let result
      
      // Route to appropriate completion function based on mission type
      if (mission.type === 'passphrase') {
        // Only receivers can complete passphrase missions
        if (mission.role !== 'receiver') {
          throw new Error('Only the receiver can complete this passphrase mission')
        }
        result = await neonApi.completePassphraseMission(missionId, successKey, agentId)
      } else if (mission.type === 'object') {
        // Object missions
        result = await neonApi.completeObjectMission(missionId, successKey, agentId)
      } else {
        // Book missions
        result = await neonApi.completeBookMission(missionId, successKey, agentId)
      }
      
      // Mission completed (or failed) - mark as completed so they can't try again
      setCompletedMissions(prev => new Set([...prev, missionId]))
      setSuccessKeys(prev => {
        const newKeys = { ...prev }
        delete newKeys[missionId]
        return newKeys
      })
      
      // Store the intel if provided
      if (result.intel) {
        setMissionIntel(result.intel)
        // Refresh intel tab data if it's already loaded
        if (users.length > 0) {
          fetchUsers()
        }
      }
      
      // Show success state only if answer was correct (or for non-passphrase missions)
      // For passphrase missions with incorrect answer, was_correct will be false
      if (selectedMissionId === missionId) {
        if (mission.type === 'passphrase' && result.was_correct === false) {
          // They were tricked - show failed state instead of input field
          setShowMissionSuccess(false)
          setShowMissionFailed(true)
          setMissionFailedMessage(result.message || 'Mission failed. You\'ve been tricked! You fell for the false intel.')
          setMissionErrors(prev => ({ ...prev, [missionId]: '' }))
        } else {
          // Correct answer or non-passphrase mission - show success
          setShowMissionSuccess(true)
          setShowMissionFailed(false)
          setMissionErrors(prev => ({ ...prev, [missionId]: '' }))
        }
      }
    } catch (error) {
      console.error('Error completing mission:', error)
      setMissionErrors(prev => ({ ...prev, [missionId]: error.message || 'Failed to complete mission. Please try again.' }))
      setShowMissionSuccess(false) // Ensure success state is not shown on error
      setMissionIntel(null)
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
            <button 
              className={`tab-button tab-intel ${activeTab === 'intel' ? 'active' : ''}`}
              onClick={() => handleTabChange('intel')}
            >
              INTEL
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
            <button 
              className={`tab-button tab-intel ${activeTab === 'intel' ? 'active' : ''}`}
              onClick={() => handleTabChange('intel')}
            >
              Intel
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
          <button 
            className={`tab-button tab-intel ${activeTab === 'intel' ? 'active' : ''}`}
            onClick={() => handleTabChange('intel')}
          >
            INTEL
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
              
              <div className="field-group">
                <div className="field-label">Team</div>
                <div className={`field-row ${teamVisible ? 'visible' : 'hidden'} team-${team}`}>
                  <span>{team} team</span>
                  <button onClick={() => setTeamVisible(!teamVisible)} className="toggle-button">
                    {teamVisible ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>
                      </svg>
                    )}
                    <span className="button-text">{teamVisible ? 'hide' : 'reveal'}</span>
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

                <div className="missions-grid">
              {missions
                .filter(mission => !completedMissions.has(mission.id))
                .map((mission, index) => (
                <div 
                  key={mission.id} 
                  className="mission-card clickable"
                  onClick={() => openMissionModal(mission.id)}
                >
                  <div className="mission-header">
                    <h3>
                      {mission.type === 'passphrase' 
                        ? mission.title 
                        : mission.type === 'object'
                        ? `Operation ${mission.title}`
                        : `Book Operation: ${mission.title}`
                      }
                    </h3>
                  </div>
                  
                    {mission.type === 'passphrase' ? (
                      (() => {
                        const lines = mission.mission_body.split('\n').filter(line => line.trim() !== '')
                        const displayLines = lines.slice(0, 3)
                        return (
                          <div>
                            <p className="mission-body-line">{displayLines[0] || ''}</p>
                            {displayLines[1] && (
                              <p className="mission-body-outline">
                                {displayLines[1]}
                              </p>
                            )}
                            {displayLines[2] && (
                              <p className="mission-body-line">{displayLines[2]}</p>
                            )}
                          </div>
                        )
                      })()
                    ) : (
                      <p style={{ whiteSpace: 'pre-line' }}>{mission.mission_body}</p>
                    )}
              </div>
              ))}
            </div>
            
            {completedMissions.size > 0 && (
              <div className="completed-missions">
                <h3>Completed Missions</h3>
                <ul>
                  {missions
                    .filter(mission => completedMissions.has(mission.id))
                    .map((mission, index) => (
                      <li 
                        key={mission.id}
                        onClick={() => openCompletedMissionModal(mission.id)}
                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {mission.type === 'passphrase' 
                          ? mission.title 
                          : mission.type === 'object'
                          ? mission.title
                          : `Book Operation: ${mission.title}`
                        }
                      </li>
                    ))}
                </ul>
              </div>
            )}
              </>
            )}
                <div className="reassignment-countdown-header">
                  <span className="countdown-label">NEW MISSIONS IN:</span>
                  <span className="countdown-time">{nextReassignmentCountdown}</span>
                </div>
              </div>
        )}

        {activeTab === 'intel' && (
          <div className="tab-content">
            {!isInActiveSession ? (
              <div className="no-session-message">
                <h2>THE PARTY HASN'T STARTED YET</h2>
                <p>Wait for the host to start a session. Once a session is active, you'll be able to access intel.</p>
              </div>
            ) : intelLoading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>LOADING INTEL...</p>
              </div>
            ) : (
              <>
                {votingOpen && (
                  <div style={{ 
                    marginBottom: 'var(--unit-base)', 
                    padding: 'var(--unit-base)',
                    backgroundColor: '#f0f8ff',
                    border: '2px solid var(--color-black)',
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}>
                    {hasSubmittedIntel ? (
                      <div style={{
                        fontSize: '1.5em',
                        fontWeight: 'bold',
                        color: 'var(--color-black)'
                      }}>
                        Your Score: {intelScore !== null ? intelScore : 0} points
                      </div>
                    ) : (
                      <button 
                        onClick={handleSubmitIntel}
                        className="button-primary"
                        style={{
                          fontSize: '1.2em',
                          padding: '12px 24px',
                          fontWeight: 'bold'
                        }}
                      >
                        Submit Intel
                      </button>
                    )}
                  </div>
                )}
                <div className="intel-container">
                  <div className="intel-section">
                    <div className="guest-list-header">
                      <h3>Guest list</h3>
                      <div className="user-filter-container">
                        <svg 
                          className="user-filter-search-icon" 
                          xmlns="http://www.w3.org/2000/svg" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        >
                          <circle cx="11" cy="11" r="8"/>
                          <path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input
                          type="text"
                          placeholder="Search"
                          value={userFilter}
                          onChange={(e) => setUserFilter(e.target.value)}
                          className="user-filter-input"
                        />
                        {userFilter && (
                          <button 
                            onClick={() => setUserFilter('')}
                            className="user-filter-clear-button"
                            type="button"
                          >
                            <img src="/svgs/X.svg" alt="Clear filter" />
                          </button>
                        )}
                      </div>
                    </div>
                    <table className="users-list">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>AKA</th>
                        <th>Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users
                        .filter(user => {
                          const fullName = `${user.firstname} ${user.lastname}`.toLowerCase()
                          return fullName.includes(userFilter.toLowerCase())
                        })
                        .map((user) => (
                        <tr key={`${user.id}-name`} data-user-id={user.id}>
                          <td 
                            data-user-id={user.id}
                          >
                            {user.firstname} {user.lastname}
                          </td>
                          <td>
                            <div className="aka-container">
                              <div 
                                onDragOver={(e) => !lockedAliases[user.id]?.[0] && handleDragOver(e, user.id, 0)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, user.id, 0)}
                                data-user-id={user.id}
                                data-target-index="0"
                                className={`drop-zone ${dragOverId === `${user.id}-0` ? 'drag-over' : ''} ${userAliases[user.id]?.[0] ? 'filled' : ''} ${lockedAliases[user.id]?.[0] ? 'locked' : ''} ${incorrectAliases[user.id]?.[0] ? 'incorrect-guess' : ''}`}
                                style={incorrectAliases[user.id]?.[0] ? { border: '3px solid #d32f2f' } : {}}
                              >
                                <span className={`alias-text ${aliasTeams[userAliases[user.id]?.[0]] ? `team-${aliasTeams[userAliases[user.id]?.[0]]}` : ''}`}>
                                  {userAliases[user.id]?.[0] || 'AKA...'}
                                </span>
                                {userAliases[user.id]?.[0] && !lockedAliases[user.id]?.[0] && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveAlias(user.id, 0)
                                    }}
                                    className="remove-alias-button"
                                  >
                                    <img src="/svgs/X.svg" alt="Remove" />
                                  </button>
                                )}
                              </div>
                              <div 
                                onDragOver={(e) => !lockedAliases[user.id]?.[1] && handleDragOver(e, user.id, 1)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, user.id, 1)}
                                data-user-id={user.id}
                                data-target-index="1"
                                className={`drop-zone ${dragOverId === `${user.id}-1` ? 'drag-over' : ''} ${userAliases[user.id]?.[1] ? 'filled' : ''} ${lockedAliases[user.id]?.[1] ? 'locked' : ''} ${incorrectAliases[user.id]?.[1] ? 'incorrect-guess' : ''}`}
                                style={incorrectAliases[user.id]?.[1] ? { border: '3px solid #d32f2f' } : {}}
                              >
                                <span className={`alias-text ${aliasTeams[userAliases[user.id]?.[1]] ? `team-${aliasTeams[userAliases[user.id]?.[1]]}` : ''}`}>
                                  {userAliases[user.id]?.[1] || 'AKA...'}
                                </span>
                                {userAliases[user.id]?.[1] && !lockedAliases[user.id]?.[1] && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveAlias(user.id, 1)
                                    }}
                                    className="remove-alias-button"
                                  >
                                    <img src="/svgs/X.svg" alt="Remove" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="team-selector">
                              <label 
                                className={`radio-label ${incorrectTeams[user.id] && userSelections[user.id] === 'red' ? 'incorrect-guess' : ''}`}
                                style={incorrectTeams[user.id] && userSelections[user.id] === 'red' ? { border: '3px solid #d32f2f', borderRadius: '4px', padding: '2px' } : {}}
                              >
                                <input
                                  type="radio"
                                  name={`team-${user.id}`}
                                  checked={userSelections[user.id] === 'red'}
                                  onChange={() => handleTeamSelection(user.id, 'red')}
                                  style={{ display: 'none' }}
                                />
                                <div className="radio-content">
                                  <img 
                                    src="/svgs/Red.svg" 
                                    alt="Red" 
                                    className="team-icon"
                                  />
                                  {userSelections[user.id] === 'red' && (
                                    <img 
                                      src="/svgs/Circle.svg" 
                                      alt="Checked" 
                                      className="circle-icon"
                                    />
                                  )}
                                </div>
                                <span className={`team-label ${userSelections[user.id] === 'red' ? 'team-red' : ''}`}>Red</span>
                              </label>
                              <label 
                                className={`radio-label ${incorrectTeams[user.id] && userSelections[user.id] === 'blue' ? 'incorrect-guess' : ''}`}
                                style={incorrectTeams[user.id] && userSelections[user.id] === 'blue' ? { border: '3px solid #d32f2f', borderRadius: '4px', padding: '2px' } : {}}
                              >
                                <input
                                  type="radio"
                                  name={`team-${user.id}`}
                                  checked={userSelections[user.id] === 'blue'}
                                  onChange={() => handleTeamSelection(user.id, 'blue')}
                                  style={{ display: 'none' }}
                                />
                                <div className="radio-content">
                                  <img 
                                    src="/svgs/Blue.svg" 
                                    alt="Blue" 
                                    className="team-icon"
                                  />
                                  {userSelections[user.id] === 'blue' && (
                                    <img 
                                      src="/svgs/Circle.svg" 
                                      alt="Checked" 
                                      className="circle-icon"
                                    />
                                  )}
                                </div>
                                <span className={`team-label ${userSelections[user.id] === 'blue' ? 'team-blue' : ''}`}>Blue</span>
                              </label>
                              <label className="radio-label">
                                <input
                                  type="radio"
                                  name={`team-${user.id}`}
                                  checked={userSelections[user.id] === 'unknown'}
                                  onChange={() => handleTeamSelection(user.id, 'unknown')}
                                  style={{ display: 'none' }}
                                />
                                <div className="radio-content">
                                  <img 
                                    src="/svgs/Question.svg" 
                                    alt="Unknown" 
                                    className="team-icon"
                                  />
                                  {userSelections[user.id] === 'unknown' && (
                                    <img 
                                      src="/svgs/Circle.svg" 
                                      alt="Checked" 
                                      className="circle-icon"
                                    />
                                  )}
                                </div>
                                <span className={`team-label ${userSelections[user.id] === 'unknown' ? 'team-unknown' : ''}`}>Unknown</span>
                              </label>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <button 
                    onClick={handleClearAll} 
                    className="clear-button"
                  >
                    Clear
                  </button>
                </div>
                </div>
                
                <div className="alias-section">
                    {randomizedAliases
                      .filter(alias => !usedAliases.has(alias))
                      .map((alias, index) => {
                        // Create a deterministic rotation based on the alias text
                        const hash = alias.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                        const rotation = ((hash % 12) - 6) * 0.5 // -3 to +3 degrees
                        const teamColor = aliasTeams[alias] ? `team-${aliasTeams[alias]}` : ''
                        return (
                          <div 
                            key={`alias-${index}`}
                            className={`alias-section-item ${teamColor}`}
                            draggable
                            data-alias={alias}
                            onDragStart={(e) => handleDragStart(e, alias)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => handleTouchStart(e, alias)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={{
                              '--rotation': `${rotation}deg`
                            }}
                          >
                            {alias}
                          </div>
                        )
                      })}
                </div>
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
          const mission = missions.find(m => m.id === selectedMissionId)
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
                    <h2>
                      {mission.type === 'passphrase' 
                        ? mission.title 
                        : mission.type === 'object'
                        ? `Operation ${mission.title}`
                        : `Book Operation: ${mission.title}`
                      }
                    </h2>
                    {mission.type !== 'passphrase' && (
                      <p style={{ whiteSpace: 'pre-line' }}>{mission.mission_body}</p>
                    )}
                    
                    {/* Only show input for book missions or passphrase receivers */}
                    {(mission.type !== 'passphrase' || mission.role === 'receiver') && (
                      <div className="field-group">
                        <label htmlFor="mission-success-key">
                          {mission.type === 'passphrase' ? 'Your Answer' : 'Success Key'}
                        </label>
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
                            placeholder={mission.type === 'passphrase' 
                              ? 'Enter the word you received...' 
                              : 'Enter success key...'}
                          />
                        </div>
                      </div>
                    )}

                    {mission.type === 'passphrase' && mission.role !== 'receiver' && (
                      <div className="field-group">
                        <p className="info-text">
                          You are a SENDER for this mission. You'll get credit for completing this mission if the receiver enters your intel.
                        </p>
                      </div>
                    )}

                    {missionErrors[selectedMissionId] && (
                      <div className="mission-error">
                        {missionErrors[selectedMissionId]}
                      </div>
                    )}
                  </div>

                  <div className="modal-footer">
                    {(mission.type !== 'passphrase' || mission.role === 'receiver') && (
                      <button 
                        onClick={() => handleSubmitMission(selectedMissionId)}
                        disabled={!successKeys[selectedMissionId]}
                        className="save-button"
                      >
                        Submit
                      </button>
                    )}
                  </div>
                </>
              ) : showMissionFailed ? (
                <>
                  <div className="modal-header">
                    <button onClick={closeMissionModal} className="close-button">
                      Close
                    </button>
                  </div>

                  <div className="modal-content">
                    <div className="mission-failed">
                      <p className="mission-failed-title">MISSION FAILED</p>
                      <h2>
                        {mission.type === 'passphrase' 
                          ? mission.title 
                          : mission.type === 'object'
                          ? mission.title
                          : `Book Operation: ${mission.title}`
                        }
                      </h2>
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
                    <button onClick={closeMissionModal} className="close-button">
                      Close
                    </button>
                  </div>

                  <div className="modal-content">
                    <div className="mission-success">
                      <p>Mission success</p>
                      <h2>
                        {mission.type === 'passphrase' 
                          ? mission.title 
                          : mission.type === 'object'
                          ? mission.title
                          : `Book Operation: ${mission.title}`
                        }
                      </h2>
                      {missionIntel && (
                        <div className="success-intel">
                          <h3>{Array.isArray(missionIntel) ? 'Your Intel:' : 'New intel:'}</h3>
                          {Array.isArray(missionIntel) ? (
                            // Display all intel
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {missionIntel.map((intel, idx) => (
                                <div key={idx}>
                                  {intel.intel_type === 'team' ? (
                                    <p>
                                      <span className="alias-container filled">{intel.alias}</span>
                                      {' is on the '}
                                      <span className={`team-${intel.intel_value}`}>{intel.intel_value}</span>
                                      {' team.'}
                                    </p>
                                  ) : intel.intel_type === 'user' && intel.user_name ? (
                                    <p>
                                      {intel.user_name}
                                      {' uses the '}
                                      <span className="alias-container filled">{intel.position === 1 ? 'first' : 'second'}</span>
                                      {' alias '}
                                      <span className="alias-container filled">{intel.alias}</span>
                                      {'.'}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            // Display single intel (from new mission completion)
                            <>
                              {missionIntel.intel_type === 'team' ? (
                                <p>
                                  <span className="alias-container filled">{missionIntel.alias}</span>
                                  {' is on the '}
                                  <span className={`team-${missionIntel.intel_value}`}>{missionIntel.intel_value}</span>
                                  {' team.'}
                                </p>
                              ) : missionIntel.intel_type === 'user' && missionIntel.user_name ? (
                                <p>
                                  {missionIntel.user_name}
                                  {' uses the '}
                                  <span className="alias-container filled">{missionIntel.position === 1 ? 'first' : 'second'}</span>
                                  {' alias '}
                                  <span className="alias-container filled">{missionIntel.alias}</span>
                                  {'.'}
                                </p>
                              ) : null}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })()}
        
        {/* Initial Secret Intel Modal */}
        {showInitialIntelModal && (
          <div className="initial-intel-modal-overlay">
            <div className="initial-intel-modal">
              <div className="initial-intel-modal-header">
                <h2>For your eyes only</h2>
              </div>
              <div className="initial-intel-modal-content">
                  <p>
                    Reveal your starting intel away from prying eyes. This message will self-destruct in 5 seconds once revealed.
                  </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
                  <div>
                    <h4>Red Team Agent:</h4>
                    {redRevealed ? (
                      <div className="initial-intel-revealed red-team">
                        {initialIntelRed}
                      </div>
                    ) : (
                      <div className="initial-intel-censor-bar">
                        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h4>Blue Team Agent:</h4>
                    {blueRevealed ? (
                      <div className="initial-intel-revealed blue-team">
                        {initialIntelBlue}
                      </div>
                    ) : (
                      <div className="initial-intel-censor-bar">
                        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
                      </div>
                    )}
                  </div>
                </div>
                
                {!redRevealed && !blueRevealed && (
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <button 
                      onClick={handleRevealAll}
                      className="initial-intel-reveal-button"
                    >
                      Reveal Intel
                    </button>
                  </div>
                )}
                
                {(redRevealed || blueRevealed) && countdown !== null && (
                  <div className="initial-intel-countdown">
                      This message will self-destruct in {countdown} seconds...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

export default Dashboard
