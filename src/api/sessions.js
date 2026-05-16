import { sql } from './db.js';
import { assignPhaseToPlayers } from './phaseMissions.js';

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
export async function createSession({ name, userIds, createdBy }) {
  try {
    if (!name || !userIds || userIds.length === 0) {
      throw new Error('Session name and at least one user ID required')
    }

    const userIdsArray = userIds.map(id => Number(id))

    const result = await sql`
      INSERT INTO sessions (name, status, participant_user_ids, created_by)
      VALUES (${name.trim()}, 'draft', ${userIdsArray}::integer[], ${createdBy || null})
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
export async function updateSession(sessionId, { name, userIds }) {
  try {
    if (!sessionId) {
      throw new Error('Session ID required')
    }

    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `

    if (session.length === 0) {
      throw new Error('Session not found')
    }

    const currentStatus = session[0].status

    if (currentStatus === 'active') {
      throw new Error('Cannot edit an active session. Pause or end it first.')
    }

    if (name !== undefined && !name?.trim()) {
      throw new Error('Session name cannot be empty')
    }

    if (userIds !== undefined && (!Array.isArray(userIds) || userIds.length === 0)) {
      throw new Error('At least one user ID required')
    }

    let result
    if (name !== undefined && userIds !== undefined) {
      result = await sql`
        UPDATE sessions
        SET name = ${name.trim()},
            participant_user_ids = ${userIds.map(id => Number(id))}::integer[]
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

// Start a session (changes status to active and assigns phase 1 missions)
export async function startSession(sessionId) {
  try {
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `

    if (session.length === 0) {
      throw new Error('Session not found')
    }

    if (session[0].status !== 'draft') {
      throw new Error(`Session is already ${session[0].status}`)
    }

    const activeSession = await getActiveSession()
    if (activeSession) {
      throw new Error('There is already an active session. End it before starting a new one.')
    }

    await sql`
      UPDATE sessions
      SET status = 'active', started_at = NOW(), current_phase = 0
      WHERE id = ${sessionId}
    `

    try {
      await assignPhaseToPlayers(sessionId, 0)
    } catch (assignError) {
      await sql`
        UPDATE sessions
        SET status = 'draft', started_at = NULL, current_phase = 0
        WHERE id = ${sessionId}
      `
      throw new Error(`Failed to assign phase 1 missions: ${assignError.message}`)
    }

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

// Advance to the next phase
export async function advancePhase(sessionId) {
  try {
    const session = await sql`
      SELECT * FROM sessions WHERE id = ${sessionId}
    `

    if (session.length === 0) throw new Error('Session not found')
    if (session[0].status !== 'active') throw new Error('Session is not active')

    const currentPhase = session[0].current_phase || 0
    if (currentPhase >= 3) throw new Error('Already at the final phase')

    const nextPhase = currentPhase + 1

    const result = await sql`
      UPDATE sessions
      SET current_phase = ${nextPhase}
      WHERE id = ${sessionId}
      RETURNING *
    `

    await assignPhaseToPlayers(sessionId, nextPhase)

    return {
      success: true,
      session: result[0],
      newPhase: nextPhase
    }
  } catch (error) {
    console.error('Error advancing phase:', error)
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

// Clear missions for users not in the active session (legacy tables removed)
export async function clearMissionsForNonSessionUsers() {
  return { success: true }
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
    
    // Clear player_missions for this session
    await sql`
      DELETE FROM player_missions WHERE session_id = ${sessionId}
    `

    // Clear all agent intel for session users
    await sql`
      DELETE FROM agent_intel
      WHERE agent_id = ANY(${sessionUserIds}::integer[])
    `

    // Reset session status back to 'draft' and clear timestamps and phase
    await sql`
      UPDATE sessions
      SET status = 'draft',
          started_at = NULL,
          paused_at = NULL,
          ended_at = NULL,
          current_phase = 0
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


