import { sql } from './db.js';
import { generateRandomIntel } from './intel.js';

// Get object missions for a specific agent
export async function getObjectMissionsForAgent(agentId) {
  try {
    const rows = await sql`
      SELECT id, title, mission_body, success_key, completed, assigned_agent
      FROM object_missions
      WHERE assigned_agent = ${agentId}
      ORDER BY id
    `
    return rows.map(r => ({
      id: r.id,
      type: 'object',
      title: r.title,
      mission_body: r.mission_body,
      success_key: r.success_key,
      completed: r.completed || false
    }))
  } catch (error) {
    console.error('Error fetching object missions for agent:', error)
    throw error
  }
}

// Assign object missions - similar pattern to book/passphrase missions
export async function assignObjectMissions() {
  try {
    // Get available agents
    const users = (await sql`SELECT id FROM users WHERE ishere = true`).map(u => u.id)
    if (users.length === 0) return { assigned: 0 }

    // Fetch missions with previous assignments
    const missions = await sql`SELECT id, past_assigned_agents FROM object_missions WHERE completed = false ORDER BY id`

    // Current assignment counts per user (cap at 3 total across all mission types)
    const objectCounts = await sql`SELECT assigned_agent AS user_id, COUNT(*)::int AS cnt FROM object_missions WHERE assigned_agent IS NOT NULL AND completed = false GROUP BY assigned_agent`
    const objectCountMap = new Map(objectCounts.map(r => [r.user_id, Number(r.cnt)]))

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
    let updates = 0

    for (const m of missions) {
      const prevAssigned = Array.isArray(m.past_assigned_agents) ? m.past_assigned_agents : []
      
      // Check if mission is already assigned
      const currentAssignment = await sql`SELECT assigned_agent FROM object_missions WHERE id = ${m.id}`
      if (currentAssignment[0]?.assigned_agent) {
        continue // Skip if already assigned
      }

      const eligibleUsers = users.filter(id => !prevAssigned.includes(id) && (objectCountMap.get(id) || 0) < 3)
      
      if (eligibleUsers.length > 0) {
        const userId = pick(eligibleUsers)
        
        await sql`
          UPDATE object_missions
          SET assigned_agent = ${userId},
              past_assigned_agents = array_append(COALESCE(past_assigned_agents, ARRAY[]::integer[]), ${userId}),
              assigned_now = true
          WHERE id = ${m.id}
        `
        updates++
        objectCountMap.set(userId, (objectCountMap.get(userId) || 0) + 1)
      }
    }

    return { assigned: updates }
  } catch (error) {
    console.error('Error assigning object missions (Neon):', error)
    throw error
  }
}

// Complete an object mission
export async function completeObjectMission(missionId, answer, agentId) {
  try {
    // Get the object mission
    const missionResult = await sql`
      SELECT id, success_key, assigned_agent, completed
      FROM object_missions
      WHERE id = ${missionId}
    `

    if (missionResult.length === 0) {
      throw new Error('Mission not found')
    }

    const mission = missionResult[0]

    // Check if mission is assigned to this agent
    if (mission.assigned_agent !== agentId) {
      throw new Error('Mission not assigned to you')
    }

    // Check if already completed
    if (mission.completed) {
      throw new Error('Mission already completed')
    }

    // Validate answer (case-insensitive, flexible matching)
    const answerLower = answer?.toLowerCase().trim()
    const correctAnswerLower = mission.success_key?.toLowerCase().trim()

    if (!answerLower || !correctAnswerLower) {
      throw new Error('Answer required')
    }

    const isCorrect = correctAnswerLower === answerLower ||
                     correctAnswerLower.includes(answerLower) ||
                     answerLower.includes(correctAnswerLower)

    if (!isCorrect) {
      throw new Error('Incorrect answer. Try again or talk to your handler.')
    }

    // Mark mission as completed
    await sql`
      UPDATE object_missions
      SET completed = true,
          assigned_now = false
      WHERE id = ${missionId}
    `

    // Generate and award random intel
    const newIntel = await generateRandomIntel(agentId)

    return { 
      message: 'Mission completed successfully',
      intel: newIntel
    }
  } catch (error) {
    console.error('Error completing object mission:', error)
    throw error
  }
}

// Admin function to manually complete an object mission (no validation)
export async function adminCompleteObjectMission(missionId, userId) {
  try {
    // Get the object mission
    const missionResult = await sql`
      SELECT id, assigned_agent, completed
      FROM object_missions
      WHERE id = ${missionId}
    `

    if (missionResult.length === 0) {
      throw new Error('Mission not found')
    }

    const mission = missionResult[0]

    // Check if mission is assigned to this user
    if (mission.assigned_agent !== userId) {
      throw new Error('Mission not assigned to this user')
    }

    // Check if already completed
    if (mission.completed) {
      throw new Error('Mission already completed')
    }

    // Mark mission as completed
    await sql`
      UPDATE object_missions
      SET completed = true,
          assigned_now = false
      WHERE id = ${missionId}
    `

    // Generate and award random intel
    const newIntel = await generateRandomIntel(userId)

    return { 
      success: true,
      message: 'Mission completed successfully',
      intel: newIntel
    }
  } catch (error) {
    console.error('Error admin completing object mission:', error)
    throw error
  }
}

