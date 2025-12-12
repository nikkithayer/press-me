import { sql } from './db.js';
import { getActiveSession } from './sessions.js';
import { getBookMissionsForAgent } from './bookMissions.js';
import { getPassphraseMissionsForAgent } from './passphraseMissions.js';
import { getObjectMissionsForAgent } from './objectMissions.js';

// Get all missions
export async function getMissions() {
  try {
    const result = await sql`SELECT * FROM missions ORDER BY id`;
    return result;
  } catch (error) {
    console.error('Error fetching missions:', error);
    throw error;
  }
}

// Get available missions
export async function getAvailableMissions() {
  try {
    const result = await sql`SELECT * FROM missions WHERE assigned_now = false ORDER BY id`;
    return result;
  } catch (error) {
    console.error('Error fetching available missions:', error);
    throw error;
  }
}

// Refresh missions (assign 3 random missions to agent)
export async function refreshMissions(agentId) {
  try {
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    // Reset all missions to available
    await sql`UPDATE missions SET completed = false, assigned_now = false, assigned_agent = null, past_assigned_agents = array[]::integer[], mission_expires = null`;

    // Calculate expiration time (15 minutes from now)
    const expirationTime = new Date(Date.now() + 15 * 60 * 1000);

    // Get 3 random available missions
    const availableMissions = await sql`SELECT * FROM missions WHERE assigned_now = false ORDER BY RANDOM() LIMIT 3`;

    // Assign each mission to the agent
    const assignedMissions = [];
    for (const mission of availableMissions) {
      const result = await sql`
        UPDATE missions 
        SET assigned_agent = ${agentId}, assigned_now = true, past_assigned_agents = array_append(past_assigned_agents, ${agentId}), mission_expires = ${expirationTime}
        WHERE id = ${mission.id} RETURNING *
      `;
      assignedMissions.push(result[0]);
    }

    return assignedMissions;
  } catch (error) {
    console.error('Error refreshing missions:', error);
    throw error;
  }
}

// Assign mission to agent
export async function assignMission(missionId, agentId) {
  try {
    const expirationTime = new Date(Date.now() + 15 * 60 * 1000);
    
    const result = await sql`
      UPDATE missions 
      SET assigned_agent = $1, assigned_now = true, past_assigned_agents = array_append(past_assigned_agents, $1), mission_expires = $2
      WHERE id = $3 RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error assigning mission:', error);
    throw error;
  }
}

// Complete mission
export async function completeMission(missionId, successKey, teamPoints) {
  try {
    // Get the mission to check the success key
    const missionResult = await sql`SELECT * FROM missions WHERE id = ${missionId}`;
    
    if (missionResult.length === 0) {
      throw new Error('Mission not found');
    }
    
    const mission = missionResult[0];
    
    if (mission.completed) {
      throw new Error('Mission already completed');
    }
    
    // Validate success key (case-insensitive comparison)
    const expectedKey = mission.success_key?.toLowerCase().trim();
    const providedKey = successKey?.toLowerCase().trim();
    
    if (!expectedKey || !providedKey) {
      throw new Error('No dice, buddy. Try again or talk to your handler.');
    }
    
    // Check if success key matches
    const isCorrect = expectedKey === providedKey || 
                     expectedKey.includes(providedKey) || 
                     providedKey.includes(expectedKey) ||
                     (expectedKey.startsWith('[') && expectedKey.endsWith(']'));
    
    if (!isCorrect) {
      throw new Error('No dice, buddy. Try again or talk to your handler.');
    }
    
    // Mark mission as completed
    await sql`UPDATE missions SET completed = true, assigned_now = false WHERE id = ${missionId}`;
    
    // Update team points if provided
    if (teamPoints && teamPoints.team) {
      await sql`UPDATE teams SET points = points + ${teamPoints.points} WHERE name = ${teamPoints.team}`;
    }
    
    return { message: 'Mission completed successfully' };
  } catch (error) {
    console.error('Error completing mission:', error);
    throw error;
  }
}

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

