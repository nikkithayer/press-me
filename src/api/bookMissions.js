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

