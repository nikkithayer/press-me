import { sql } from './db.js';
import { generateRandomIntel } from './intel.js';

// Get book missions for a specific agent
export async function getBookMissionsForAgent(agentId) {
  try {
    const rows = await sql`
      SELECT id, book, clue_red, clue_blue, assigned_red, assigned_blue, red_completed, blue_completed
      FROM book_missions
      WHERE assigned_red = ${agentId} OR assigned_blue = ${agentId}
      ORDER BY id
    `;
    // Return all fields needed for admin view, preserving book, clue_red, and clue_blue
    return rows.map(r => {
      const isRed = r.assigned_red === agentId;
      return {
        id: r.id,
        book: r.book,
        clue_red: r.clue_red,
        clue_blue: r.clue_blue,
        title: r.book, // Keep for compatibility
        mission_body: isRed ? r.clue_red : r.clue_blue, // Keep for compatibility
        color: isRed ? 'red' : 'blue',
        completed: isRed ? r.red_completed : r.blue_completed // Include completion status
      };
    });
  } catch (error) {
    console.error('Error fetching book missions for agent:', error);
    throw error;
  }
}

// Assign book missions serverlessly via Neon (fallback if none assigned)
export async function assignBookMissions() {
  try {
    // Get available agents per team
    const redUsers = (await sql`SELECT id FROM users WHERE team = 'red' AND ishere = true`).map(u => u.id)
    const blueUsers = (await sql`SELECT id FROM users WHERE team = 'blue' AND ishere = true`).map(u => u.id)
    if (redUsers.length === 0 || blueUsers.length === 0) return { assigned: 0 }

    // Fetch missions with previous assignments
    const missions = await sql`SELECT id, previous_reds, previous_blues FROM book_missions ORDER BY id`

    // Current assignment counts per user (cap at 3)
    const redCounts = await sql`SELECT assigned_red AS user_id, COUNT(*)::int AS cnt FROM book_missions WHERE assigned_red IS NOT NULL GROUP BY assigned_red`
    const blueCounts = await sql`SELECT assigned_blue AS user_id, COUNT(*)::int AS cnt FROM book_missions WHERE assigned_blue IS NOT NULL GROUP BY assigned_blue`
    const redCountMap = new Map(redCounts.map(r => [r.user_id, Number(r.cnt)]))
    const blueCountMap = new Map(blueCounts.map(r => [r.user_id, Number(r.cnt)]))

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
    let updates = 0

    for (const m of missions) {
      const prevReds = Array.isArray(m.previous_reds) ? m.previous_reds : []
      const prevBlues = Array.isArray(m.previous_blues) ? m.previous_blues : []
      const eligibleReds = redUsers.filter(id => !prevReds.includes(id) && (redCountMap.get(id) || 0) < 3)
      const eligibleBlues = blueUsers.filter(id => !prevBlues.includes(id) && (blueCountMap.get(id) || 0) < 3)
      const redId = eligibleReds.length ? pick(eligibleReds) : null
      const blueId = eligibleBlues.length ? pick(eligibleBlues) : null

      if (redId !== null && blueId !== null) {
        await sql`
          UPDATE book_missions
          SET assigned_red = ${redId},
              assigned_blue = ${blueId},
              previous_reds = array_append(COALESCE(previous_reds, ARRAY[]::integer[]), ${redId}),
              previous_blues = array_append(COALESCE(previous_blues, ARRAY[]::integer[]), ${blueId})
          WHERE id = ${m.id}
        `
        updates++
        redCountMap.set(redId, (redCountMap.get(redId) || 0) + 1)
        blueCountMap.set(blueId, (blueCountMap.get(blueId) || 0) + 1)
      } else if (redId !== null) {
        await sql`
          UPDATE book_missions
          SET assigned_red = ${redId},
              previous_reds = array_append(COALESCE(previous_reds, ARRAY[]::integer[]), ${redId})
          WHERE id = ${m.id}
        `
        updates++
        redCountMap.set(redId, (redCountMap.get(redId) || 0) + 1)
      } else if (blueId !== null) {
        await sql`
          UPDATE book_missions
          SET assigned_blue = ${blueId},
              previous_blues = array_append(COALESCE(previous_blues, ARRAY[]::integer[]), ${blueId})
          WHERE id = ${m.id}
        `
        updates++
        blueCountMap.set(blueId, (blueCountMap.get(blueId) || 0) + 1)
      }
    }

    return { assigned: updates }
  } catch (error) {
    console.error('Error assigning book missions (Neon):', error)
    throw error
  }
}

// Reset all book mission assignments and completion flags, then reassign
export async function resetAndAssignBookMissions() {
  try {
    await sql`
      UPDATE book_missions
      SET assigned_red = NULL,
          assigned_blue = NULL,
          previous_reds = ARRAY[]::integer[],
          previous_blues = ARRAY[]::integer[],
          red_completed = false,
          blue_completed = false
    `
    return await assignBookMissions()
  } catch (error) {
    console.error('Error resetting and assigning book missions (Neon):', error)
    throw error
  }
}

// Complete a book mission
export async function completeBookMission(missionId, answer, agentId) {
  try {
    // Get the book mission
    const missionResult = await sql`
      SELECT id, answer_red, answer_blue, assigned_red, assigned_blue, red_completed, blue_completed
      FROM book_missions
      WHERE id = ${missionId}
    `

    if (missionResult.length === 0) {
      throw new Error('Mission not found')
    }

    const mission = missionResult[0]
    const isAssignedRed = mission.assigned_red === agentId
    const isAssignedBlue = mission.assigned_blue === agentId

    if (!isAssignedRed && !isAssignedBlue) {
      throw new Error('Mission not assigned to you')
    }

    // Check if already completed for this agent
    if ((isAssignedRed && mission.red_completed) || (isAssignedBlue && mission.blue_completed)) {
      throw new Error('Mission already completed')
    }

    // Get the correct answer
    const correctAnswer = isAssignedRed ? mission.answer_red : mission.answer_blue
    const answerLower = answer?.toLowerCase().trim()
    const correctAnswerLower = correctAnswer?.toLowerCase().trim()

    // Validate answer (case-insensitive, flexible matching)
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
    if (isAssignedRed) {
      await sql`
        UPDATE book_missions
        SET red_completed = true
        WHERE id = ${missionId}
      `
    } else {
      await sql`
        UPDATE book_missions
        SET blue_completed = true
        WHERE id = ${missionId}
      `
    }

    // Generate and award random intel
    const newIntel = await generateRandomIntel(agentId)

    return { 
      message: 'Mission completed successfully',
      intel: newIntel
    }
  } catch (error) {
    console.error('Error completing book mission:', error)
    throw error
  }
}

// Admin function to manually complete a book mission (no validation)
export async function adminCompleteBookMission(missionId, userId) {
  try {
    // Get the book mission
    const missionResult = await sql`
      SELECT id, assigned_red, assigned_blue, red_completed, blue_completed
      FROM book_missions
      WHERE id = ${missionId}
    `

    if (missionResult.length === 0) {
      throw new Error('Mission not found')
    }

    const mission = missionResult[0]
    const isAssignedRed = mission.assigned_red === userId
    const isAssignedBlue = mission.assigned_blue === userId

    if (!isAssignedRed && !isAssignedBlue) {
      throw new Error('Mission not assigned to this user')
    }

    // Check if already completed for this user
    if ((isAssignedRed && mission.red_completed) || (isAssignedBlue && mission.blue_completed)) {
      throw new Error('Mission already completed')
    }

    // Mark mission as completed
    if (isAssignedRed) {
      await sql`
        UPDATE book_missions
        SET red_completed = true
        WHERE id = ${missionId}
      `
    } else {
      await sql`
        UPDATE book_missions
        SET blue_completed = true
        WHERE id = ${missionId}
      `
    }

    // Generate and award random intel
    const newIntel = await generateRandomIntel(userId)

    return { 
      success: true,
      message: 'Mission completed successfully',
      intel: newIntel
    }
  } catch (error) {
    console.error('Error admin completing book mission:', error)
    throw error
  }
}

