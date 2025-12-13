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

