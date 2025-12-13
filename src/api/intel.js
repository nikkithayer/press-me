import { sql } from './db.js';
import { getActiveSession } from './sessions.js';

// Get all intel for a specific agent (from agent_intel table)
export async function getAgentIntel(agentId) {
  try {
    const result = await sql`
      SELECT alias, intel_type, intel_value, position
      FROM agent_intel
      WHERE agent_id = ${agentId}
      ORDER BY alias, intel_type
    `;
    return result;
  } catch (error) {
    console.error('Error fetching agent intel:', error);
    throw error;
  }
}

// Add intel clue
export async function addIntel(clueText, agentsWhoKnow = []) {
  try {
    const result = await sql`INSERT INTO intel (clue_text, agents_who_know) VALUES ($1, $2) RETURNING *`;
    return result[0];
  } catch (error) {
    console.error('Error adding intel:', error);
    throw error;
  }
}

// Clear all intel for a specific agent
export async function clearAgentIntel(agentId) {
  try {
    await sql`
      DELETE FROM agent_intel WHERE agent_id = ${agentId}
    `
  } catch (error) {
    console.error('Error clearing agent intel:', error)
    throw error
  }
}

// Generate and award random unknown intel to an agent
export async function generateRandomIntel(agentId) {
  try {
    // Check if there's an active session and get session users
    const activeSession = await getActiveSession()
    if (!activeSession || !activeSession.participant_user_ids || activeSession.participant_user_ids.length === 0) {
      // No active session - return null (no intel generated)
      return null
    }
    
    const sessionUserIds = activeSession.participant_user_ids.map(id => Number(id))
    
    // Get only users in the active session
    const users = await sql`
      SELECT id, firstname, lastname, alias_1, alias_2, team 
      FROM users 
      WHERE ishere = true AND id = ANY(${sessionUserIds}::integer[])
    `

    // Get the agent's own user info to exclude their own aliases
    const agentUser = users.find(u => u.id === agentId)
    const agentAliases = agentUser ? new Set([agentUser.alias_1, agentUser.alias_2]) : new Set()

    // Get what intel this agent already has
    const existingIntel = await sql`
      SELECT alias, intel_type FROM agent_intel WHERE agent_id = ${agentId}
    `
    const knownMap = new Map()
    existingIntel.forEach(i => {
      const key = `${i.alias}_${i.intel_type}`
      knownMap.set(key, true)
    })

    // Build list of possible intel (excluding agent's own aliases)
    const possibleIntel = []

    for (const user of users) {
      // Skip intel about the agent's own aliases
      if (agentAliases.has(user.alias_1) || agentAliases.has(user.alias_2)) {
        continue
      }
      // Check alias_1 team intel
      const alias1TeamKey = `${user.alias_1}_team`
      if (!knownMap.has(alias1TeamKey)) {
        possibleIntel.push({
          alias: user.alias_1,
          intel_type: 'team',
          intel_value: user.team,
          position: null
        })
      }

      // Check alias_2 team intel
      const alias2TeamKey = `${user.alias_2}_team`
      if (!knownMap.has(alias2TeamKey)) {
        possibleIntel.push({
          alias: user.alias_2,
          intel_type: 'team',
          intel_value: user.team,
          position: null
        })
      }

      // Check alias_1 user intel
      const alias1UserKey = `${user.alias_1}_user`
      if (!knownMap.has(alias1UserKey)) {
        possibleIntel.push({
          alias: user.alias_1,
          intel_type: 'user',
          intel_value: String(user.id),
          position: 1
        })
      }

      // Check alias_2 user intel
      const alias2UserKey = `${user.alias_2}_user`
      if (!knownMap.has(alias2UserKey)) {
        possibleIntel.push({
          alias: user.alias_2,
          intel_type: 'user',
          intel_value: String(user.id),
          position: 2
        })
      }
    }

    if (possibleIntel.length === 0) {
      return null // Agent already knows everything
    }

    // Pick random intel
    const selectedIntel = possibleIntel[Math.floor(Math.random() * possibleIntel.length)]

    // Store it in agent_intel
    await sql`
      INSERT INTO agent_intel (agent_id, alias, intel_type, intel_value, position)
      VALUES (${agentId}, ${selectedIntel.alias}, ${selectedIntel.intel_type}, ${selectedIntel.intel_value}, ${selectedIntel.position})
      ON CONFLICT (agent_id, alias, intel_type) DO NOTHING
    `

    // Get user info for display (if intel_type is 'user')
    let user_name = null
    if (selectedIntel.intel_type === 'user') {
      const userInfo = users.find(u => u.id === Number(selectedIntel.intel_value))
      if (userInfo) {
        user_name = `${userInfo.firstname} ${userInfo.lastname}`
      }
    }

    return {
      alias: selectedIntel.alias,
      intel_type: selectedIntel.intel_type,
      intel_value: selectedIntel.intel_value,
      position: selectedIntel.position,
      user_name: user_name
    }
  } catch (error) {
    console.error('Error generating random intel:', error)
    throw error
  }
}

