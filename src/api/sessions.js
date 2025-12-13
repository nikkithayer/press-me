import { sql } from './db.js';
import { assignMissionsToSessionUsers } from './assignments.js';

// Get all sessions
export async function getAllSessions() {
  try {
    const sessions = await sql`
      SELECT * FROM sessions ORDER BY created_at DESC
    `
    return sessions
  } catch (error) {
    console.error('Error fetching sessions:', error)
    throw error
  }
}

// Get active session
export async function getActiveSession() {
  try {
    const result = await sql`
      SELECT * FROM sessions WHERE status = 'active' LIMIT 1
    `
    return result.length > 0 ? result[0] : null
  } catch (error) {
    console.error('Error fetching active session:', error)
    throw error
  }
}

// Create a new session (draft status - missions not assigned yet)
export async function createSession({ name, userIds, createdBy, refreshIntervalMinutes }) {
  try {
    if (!name || !userIds || userIds.length === 0) {
      throw new Error('Session name and at least one user ID required')
    }

    const userIdsArray = userIds.map(id => Number(id))
    const refreshInterval = refreshIntervalMinutes || 15 // Default to 15 minutes
    
    // Create session record in database
    const result = await sql`
      INSERT INTO sessions (name, status, participant_user_ids, created_by, mission_refresh_interval_minutes)
      VALUES (${name.trim()}, 'draft', ${userIdsArray}::integer[], ${createdBy || null}, ${refreshInterval})
      RETURNING *
    `
    
    return {
      success: true,
      session: result[0]
    }
  } catch (error) {
    console.error('Error creating session:', error)
    throw error
  }
}

// Update a session (only allowed for draft, paused, or ended sessions)
export async function updateSession(sessionId, { name, userIds, refreshIntervalMinutes }) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required')
    }

    // Get the session to check its status
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }
    
    const currentStatus = session[0].status
    
    // Only allow editing draft, paused, or ended sessions
    if (currentStatus === 'active') {
      throw new Error('Cannot edit an active session. Pause or end it first.')
    }

    // Validate inputs
    if (name !== undefined && !name?.trim()) {
      throw new Error('Session name cannot be empty')
    }
    
    if (userIds !== undefined && (!Array.isArray(userIds) || userIds.length === 0)) {
      throw new Error('At least one user ID required')
    }

    if (refreshIntervalMinutes !== undefined && (typeof refreshIntervalMinutes !== 'number' || refreshIntervalMinutes < 1)) {
      throw new Error('Refresh interval must be a positive number (minutes)')
    }

    // Build update fields dynamically
    let result
    if (name !== undefined && userIds !== undefined && refreshIntervalMinutes !== undefined) {
      result = await sql`
        UPDATE sessions
        SET name = ${name.trim()}, 
            participant_user_ids = ${userIds.map(id => Number(id))}::integer[],
            mission_refresh_interval_minutes = ${refreshIntervalMinutes}
        WHERE id = ${sessionId}
        RETURNING *
      `
    } else if (name !== undefined && userIds !== undefined) {
      result = await sql`
        UPDATE sessions
        SET name = ${name.trim()}, 
            participant_user_ids = ${userIds.map(id => Number(id))}::integer[]
        WHERE id = ${sessionId}
        RETURNING *
      `
    } else if (name !== undefined && refreshIntervalMinutes !== undefined) {
      result = await sql`
        UPDATE sessions
        SET name = ${name.trim()}, 
            mission_refresh_interval_minutes = ${refreshIntervalMinutes}
        WHERE id = ${sessionId}
        RETURNING *
      `
    } else if (userIds !== undefined && refreshIntervalMinutes !== undefined) {
      result = await sql`
        UPDATE sessions
        SET participant_user_ids = ${userIds.map(id => Number(id))}::integer[],
            mission_refresh_interval_minutes = ${refreshIntervalMinutes}
        WHERE id = ${sessionId}
        RETURNING *
      `
    } else if (name !== undefined) {
      result = await sql`
        UPDATE sessions
        SET name = ${name.trim()}
        WHERE id = ${sessionId}
        RETURNING *
      `
    } else if (userIds !== undefined) {
      result = await sql`
        UPDATE sessions
        SET participant_user_ids = ${userIds.map(id => Number(id))}::integer[]
        WHERE id = ${sessionId}
        RETURNING *
      `
    } else if (refreshIntervalMinutes !== undefined) {
      result = await sql`
        UPDATE sessions
        SET mission_refresh_interval_minutes = ${refreshIntervalMinutes}
        WHERE id = ${sessionId}
        RETURNING *
      `
    }

    return {
      success: true,
      session: result[0]
    }
  } catch (error) {
    console.error('Error updating session:', error)
    throw error
  }
}

// Start a session (changes status to active and assigns missions)
export async function startSession(sessionId) {
  try {
    // Check if session exists and is in draft status
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }
    
    if (session[0].status !== 'draft') {
      throw new Error(`Session is already ${session[0].status}`)
    }

    // Check if there's already an active session
    const activeSession = await getActiveSession()
    if (activeSession) {
      throw new Error('There is already an active session. End it before starting a new one.')
    }

    const userIdsArray = session[0].participant_user_ids
    
    // First, clear missions for users NOT in this session
    await clearMissionsForNonSessionUsers()
    
    // Update session status to active and set started_at
    await sql`
      UPDATE sessions
      SET status = 'active', started_at = NOW()
      WHERE id = ${sessionId}
    `

    // Now assign missions to the selected users
    // Retry assignment if lock is held (up to 5 times with exponential backoff)
    let assignmentResult = null
    let retries = 0
    const maxRetries = 5
    const baseDelayMs = 200
    
    while (retries < maxRetries) {
      assignmentResult = await assignMissionsToSessionUsers(userIdsArray)
      
      if (assignmentResult.success) {
        break
      }
      
      // If lock is held, wait and retry
      if (assignmentResult.reason?.includes('lock')) {
        retries++
        if (retries < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, retries - 1)
          console.log(`Lock held, retrying assignment in ${delayMs}ms (attempt ${retries + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
      }
      
      // For other errors, break immediately
      break
    }
    
    // Check if missions were actually assigned
    if (!assignmentResult.success) {
      // Rollback session status if mission assignment failed
      await sql`
        UPDATE sessions
        SET status = 'draft', started_at = NULL
        WHERE id = ${sessionId}
      `
      throw new Error(`Failed to assign missions after ${retries} retries: ${assignmentResult.reason || 'Unknown error'}`)
    }
    
    if (assignmentResult.missionsAssigned === 0) {
      // Rollback session status if no missions were assigned
      await sql`
        UPDATE sessions
        SET status = 'draft', started_at = NULL
        WHERE id = ${sessionId}
      `
      throw new Error('No missions were assigned. Please check that there are available missions.')
    }
    
    // Get updated session
    const updatedSession = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    return {
      success: true,
      session: updatedSession[0]
    }
  } catch (error) {
    console.error('Error starting session:', error)
    throw error
  }
}

// Pause a session
export async function pauseSession(sessionId) {
  try {
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }
    
    if (session[0].status !== 'active') {
      throw new Error(`Session is not active (current status: ${session[0].status})`)
    }

    await sql`
      UPDATE sessions
      SET status = 'paused', paused_at = NOW()
      WHERE id = ${sessionId}
    `
    
    return { success: true }
  } catch (error) {
    console.error('Error pausing session:', error)
    throw error
  }
}

// Resume a paused session
export async function resumeSession(sessionId) {
  try {
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }
    
    if (session[0].status !== 'paused') {
      throw new Error(`Session is not paused (current status: ${session[0].status})`)
    }

    await sql`
      UPDATE sessions
      SET status = 'active', paused_at = NULL
      WHERE id = ${sessionId}
    `
    
    return { success: true }
  } catch (error) {
    console.error('Error resuming session:', error)
    throw error
  }
}

// End a session
export async function endSession(sessionId) {
  try {
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }
    
    if (session[0].status === 'ended') {
      throw new Error('Session is already ended')
    }

    // Update session status to ended
    await sql`
      UPDATE sessions
      SET status = 'ended', ended_at = NOW()
      WHERE id = ${sessionId}
    `
    
    // Clear missions for all users (no active session exists now)
    await clearMissionsForNonSessionUsers()
    
    return { success: true }
  } catch (error) {
    console.error('Error ending session:', error)
    throw error
  }
}

// Clear missions for users not in the active session
export async function clearMissionsForNonSessionUsers() {
  try {
    const activeSession = await getActiveSession()
    
    if (!activeSession) {
      // No active session - clear missions for all users
      await sql`
        UPDATE book_missions
        SET assigned_red = NULL,
            assigned_blue = NULL,
            previous_reds = ARRAY[]::integer[],
            previous_blues = ARRAY[]::integer[],
            red_completed = false,
            blue_completed = false
      `
      
      await sql`
        UPDATE passphrase_missions
        SET assigned_receiver = NULL,
            assigned_sender_1 = NULL,
            assigned_sender_2 = NULL,
            previous_receivers = ARRAY[]::integer[],
            previous_senders = ARRAY[]::integer[],
            completed = false
      `
      
      await sql`
        UPDATE object_missions
        SET assigned_agent = NULL,
            past_assigned_agents = ARRAY[]::integer[],
            assigned_now = false,
            completed = false
      `
      
      return { success: true, cleared: 'all' }
    }
    
    // Clear missions for users NOT in the active session
    const sessionUserIds = activeSession.participant_user_ids || []
    const allUsers = (await sql`SELECT id FROM users WHERE ishere = true`).map(u => u.id)
    const nonSessionUsers = allUsers.filter(id => !sessionUserIds.includes(id))
    
    if (nonSessionUsers.length === 0) {
      return { success: true, cleared: 'none' }
    }
    
    // Clear book missions
    await sql`
      UPDATE book_missions
      SET assigned_red = CASE WHEN assigned_red = ANY(${nonSessionUsers}::integer[]) THEN NULL ELSE assigned_red END,
          assigned_blue = CASE WHEN assigned_blue = ANY(${nonSessionUsers}::integer[]) THEN NULL ELSE assigned_blue END,
          previous_reds = array(SELECT unnest(previous_reds) EXCEPT SELECT unnest(${nonSessionUsers}::integer[])),
          previous_blues = array(SELECT unnest(previous_blues) EXCEPT SELECT unnest(${nonSessionUsers}::integer[]))
      WHERE assigned_red = ANY(${nonSessionUsers}::integer[]) OR assigned_blue = ANY(${nonSessionUsers}::integer[])
    `
    
    // Clear passphrase missions
    await sql`
      UPDATE passphrase_missions
      SET assigned_receiver = CASE WHEN assigned_receiver = ANY(${nonSessionUsers}::integer[]) THEN NULL ELSE assigned_receiver END,
          assigned_sender_1 = CASE WHEN assigned_sender_1 = ANY(${nonSessionUsers}::integer[]) THEN NULL ELSE assigned_sender_1 END,
          assigned_sender_2 = CASE WHEN assigned_sender_2 = ANY(${nonSessionUsers}::integer[]) THEN NULL ELSE assigned_sender_2 END,
          previous_receivers = array(SELECT unnest(previous_receivers) EXCEPT SELECT unnest(${nonSessionUsers}::integer[])),
          previous_senders = array(SELECT unnest(previous_senders) EXCEPT SELECT unnest(${nonSessionUsers}::integer[]))
      WHERE assigned_receiver = ANY(${nonSessionUsers}::integer[]) 
         OR assigned_sender_1 = ANY(${nonSessionUsers}::integer[])
         OR assigned_sender_2 = ANY(${nonSessionUsers}::integer[])
    `
    
    // Clear object missions
    await sql`
      UPDATE object_missions
      SET assigned_agent = CASE WHEN assigned_agent = ANY(${nonSessionUsers}::integer[]) THEN NULL ELSE assigned_agent END,
          past_assigned_agents = array(SELECT unnest(past_assigned_agents) EXCEPT SELECT unnest(${nonSessionUsers}::integer[])),
          assigned_now = CASE WHEN assigned_agent = ANY(${nonSessionUsers}::integer[]) THEN false ELSE assigned_now END
      WHERE assigned_agent = ANY(${nonSessionUsers}::integer[])
    `
    
    return { success: true, cleared: nonSessionUsers.length }
  } catch (error) {
    console.error('Error clearing missions for non-session users:', error)
    throw error
  }
}

// Check if missions can be assigned (only if there's an active session)
export async function canAssignMissions() {
  try {
    const activeSession = await getActiveSession()
    return activeSession !== null
  } catch (error) {
    console.error('Error checking if missions can be assigned:', error)
    return false
  }
}

// Reset a session: clear all mission assignments, completions, and intel for session participants
// Works for paused or ended sessions (does not require active session)
export async function resetSession(sessionId) {
  try {
    // Get the session to find participants
    const sessionResult = await sql`
      SELECT id, participant_user_ids, status
      FROM sessions
      WHERE id = ${sessionId}
    `
    
    if (sessionResult.length === 0) {
      throw new Error('Session not found')
    }
    
    const session = sessionResult[0]
    
    // Only allow reset for paused or ended sessions
    if (session.status !== 'paused' && session.status !== 'ended') {
      throw new Error('Can only reset paused or ended sessions')
    }
    
    const sessionUserIds = session.participant_user_ids || []
    if (sessionUserIds.length === 0) {
      throw new Error('No participants in session')
    }
    
    // Clear all mission assignments, completions, and history for session users
    // Reset book missions for session users
    await sql`
      UPDATE book_missions
      SET assigned_red = CASE WHEN assigned_red = ANY(${sessionUserIds}::integer[]) THEN NULL ELSE assigned_red END,
          assigned_blue = CASE WHEN assigned_blue = ANY(${sessionUserIds}::integer[]) THEN NULL ELSE assigned_blue END,
          red_completed = CASE WHEN assigned_red = ANY(${sessionUserIds}::integer[]) THEN false ELSE red_completed END,
          blue_completed = CASE WHEN assigned_blue = ANY(${sessionUserIds}::integer[]) THEN false ELSE blue_completed END,
          previous_reds = ARRAY(
            SELECT unnest(COALESCE(previous_reds, ARRAY[]::integer[]))
            EXCEPT
            SELECT unnest(${sessionUserIds}::integer[])
          ),
          previous_blues = ARRAY(
            SELECT unnest(COALESCE(previous_blues, ARRAY[]::integer[]))
            EXCEPT
            SELECT unnest(${sessionUserIds}::integer[])
          )
      WHERE assigned_red = ANY(${sessionUserIds}::integer[]) 
         OR assigned_blue = ANY(${sessionUserIds}::integer[])
         OR previous_reds && ${sessionUserIds}::integer[]
         OR previous_blues && ${sessionUserIds}::integer[]
    `
    
    // Reset passphrase missions for session users
    await sql`
      UPDATE passphrase_missions
      SET assigned_receiver = CASE WHEN assigned_receiver = ANY(${sessionUserIds}::integer[]) THEN NULL ELSE assigned_receiver END,
          assigned_sender_1 = CASE WHEN assigned_sender_1 = ANY(${sessionUserIds}::integer[]) THEN NULL ELSE assigned_sender_1 END,
          assigned_sender_2 = CASE WHEN assigned_sender_2 = ANY(${sessionUserIds}::integer[]) THEN NULL ELSE assigned_sender_2 END,
          completed = CASE WHEN assigned_receiver = ANY(${sessionUserIds}::integer[]) 
                            OR assigned_sender_1 = ANY(${sessionUserIds}::integer[])
                            OR assigned_sender_2 = ANY(${sessionUserIds}::integer[])
                       THEN false ELSE completed END,
          previous_receivers = ARRAY(
            SELECT unnest(COALESCE(previous_receivers, ARRAY[]::integer[]))
            EXCEPT
            SELECT unnest(${sessionUserIds}::integer[])
          ),
          previous_senders = ARRAY(
            SELECT unnest(COALESCE(previous_senders, ARRAY[]::integer[]))
            EXCEPT
            SELECT unnest(${sessionUserIds}::integer[])
          )
      WHERE assigned_receiver = ANY(${sessionUserIds}::integer[]) 
         OR assigned_sender_1 = ANY(${sessionUserIds}::integer[])
         OR assigned_sender_2 = ANY(${sessionUserIds}::integer[])
         OR previous_receivers && ${sessionUserIds}::integer[]
         OR previous_senders && ${sessionUserIds}::integer[]
    `
    
    // Reset object missions for session users
    await sql`
      UPDATE object_missions
      SET assigned_agent = CASE WHEN assigned_agent = ANY(${sessionUserIds}::integer[]) THEN NULL ELSE assigned_agent END,
          assigned_now = CASE WHEN assigned_agent = ANY(${sessionUserIds}::integer[]) THEN false ELSE assigned_now END,
          completed = CASE WHEN assigned_agent = ANY(${sessionUserIds}::integer[]) THEN false ELSE completed END,
          past_assigned_agents = ARRAY(
            SELECT unnest(COALESCE(past_assigned_agents, ARRAY[]::integer[]))
            EXCEPT
            SELECT unnest(${sessionUserIds}::integer[])
          )
      WHERE assigned_agent = ANY(${sessionUserIds}::integer[])
         OR past_assigned_agents && ${sessionUserIds}::integer[]
    `
    
    // Clear all agent intel for session users
    await sql`
      DELETE FROM agent_intel 
      WHERE agent_id = ANY(${sessionUserIds}::integer[])
    `
    
    // Reset session status back to 'draft' and clear timestamps
    await sql`
      UPDATE sessions
      SET status = 'draft',
          started_at = NULL,
          paused_at = NULL,
          ended_at = NULL
      WHERE id = ${sessionId}
    `
    
    return { 
      success: true,
      message: 'Session reset successfully. All missions and intel cleared for participants. Session status reset to draft.'
    }
  } catch (error) {
    console.error('Error resetting session:', error)
    throw error
  }
}

// Open voting for a session
export async function openVoting(sessionId) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required')
    }

    // Check if session exists
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }

    // Update voting_open to true
    const result = await sql`
      UPDATE sessions
      SET voting_open = true
      WHERE id = ${sessionId}
      RETURNING *
    `

    return {
      success: true,
      session: result[0]
    }
  } catch (error) {
    console.error('Error opening voting:', error)
    throw error
  }
}

// Close voting for a session
export async function closeVoting(sessionId) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required')
    }

    // Check if session exists
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `
    
    if (session.length === 0) {
      throw new Error('Session not found')
    }

    // Update voting_open to false
    const result = await sql`
      UPDATE sessions
      SET voting_open = false
      WHERE id = ${sessionId}
      RETURNING *
    `

    return {
      success: true,
      session: result[0]
    }
  } catch (error) {
    console.error('Error closing voting:', error)
    throw error
  }
}

