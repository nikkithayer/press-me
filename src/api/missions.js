import { sql } from './db.js';
import { getActiveSession } from './sessions.js';
import { getBookMissionsForAgent } from './bookMissions.js';
import { getPassphraseMissionsForAgent } from './passphraseMissions.js';
import { getObjectMissionsForAgent } from './objectMissions.js';

// Get all missions (both book, passphrase, and object) for a specific agent
// Only returns missions if agent is in an active session
export async function getAllMissionsForAgent(agentId) {
  try {
    // Check if there's an active session and if user is in it
    let activeSession = null
    try {
      activeSession = await getActiveSession()
    } catch (error) {
      // If getting active session fails, log but don't throw - just return empty array
      console.error('Error fetching active session in getAllMissionsForAgent:', error)
      return []
    }
    
    if (!activeSession) {
      // No active session - return empty array
      return []
    }
    
    // Convert agentId to number for comparison
    const agentIdNum = Number(agentId)
    const participantIds = (activeSession.participant_user_ids || []).map(id => Number(id))
    
    if (!participantIds.includes(agentIdNum)) {
      // User is not in active session - return empty array
      return []
    }
    
    // Fetch missions for each type, handling errors gracefully
    let bookMissions = []
    let passphraseMissions = []
    let objectMissions = []
    
    try {
      bookMissions = await getBookMissionsForAgent(agentId)
    } catch (error) {
      console.error('Error fetching book missions:', error)
      // Continue with other mission types
    }
    
    try {
      passphraseMissions = await getPassphraseMissionsForAgent(agentId)
    } catch (error) {
      console.error('Error fetching passphrase missions:', error)
      // Continue with other mission types
    }
    
    try {
      objectMissions = await getObjectMissionsForAgent(agentId)
    } catch (error) {
      console.error('Error fetching object missions:', error)
      // Continue with other mission types
    }
    
    // Add type field to book missions if not present
    const bookMissionsWithType = bookMissions.map(m => ({
      ...m,
      type: 'book'
    }))
    
    // Combine and return
    return [...bookMissionsWithType, ...passphraseMissions, ...objectMissions]
  } catch (error) {
    // This catch should rarely be hit now since we handle errors above
    // But if something unexpected happens, log it and return empty array instead of throwing
    console.error('Unexpected error in getAllMissionsForAgent:', error)
    return []
  }
}

