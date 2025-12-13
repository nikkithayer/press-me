import { sql } from './db.js';
import { generateRandomIntel } from './intel.js';

// Get passphrase missions for a specific agent
export async function getPassphraseMissionsForAgent(agentId) {
  try {
    const rows = await sql`
      SELECT id, passphrase_template, correct_answer, incorrect_answer, assigned_receiver, assigned_sender_1, assigned_sender_2, completed
      FROM passphrase_missions
      WHERE assigned_receiver = ${agentId} OR assigned_sender_1 = ${agentId} OR assigned_sender_2 = ${agentId}
      ORDER BY id
    `
    // Return all fields needed for admin view, preserving passphrase_template, correct_answer, incorrect_answer
    return rows.map(r => {
      const isReceiver = r.assigned_receiver === agentId
      const isSender1 = r.assigned_sender_1 === agentId
      const isSender2 = r.assigned_sender_2 === agentId
      
      let mission_body = ''
      if (isReceiver) {
        mission_body = `Agents are looking to have you complete the passphrase:\n${r.passphrase_template}\nOne agent is trying to pass the correct intel while another is looking to pass incorrect intel. When you're ready, type in what you believe is the correct answer.`
      } else if (isSender1) {
        // Sender 1 passes TRUE (correct) intel
        const passphraseWithWord = r.passphrase_template.replace(/___/g, r.correct_answer)
        mission_body = `You are looking to pass the following TRUE intel to a receiver:\n"${passphraseWithWord}"\nBe cautious, another agent is trying to pass FALSE intel.`
      } else if (isSender2) {
        // Sender 2 passes FALSE (incorrect) intel
        const passphraseWithWord = r.passphrase_template.replace(/___/g, r.incorrect_answer)
        mission_body = `You are looking to pass the following FALSE intel to a receiver:\n"${passphraseWithWord}"\nBe cautious, another agent is trying to pass TRUE intel.`
      }
      
      return {
        id: r.id,
        type: 'passphrase',
        title: 'Passphrase Mission',
        mission_body: mission_body, // Keep for compatibility
        passphrase_template: r.passphrase_template, // Preserve for admin view
        correct_answer: r.correct_answer, // Preserve for admin view
        incorrect_answer: r.incorrect_answer, // Preserve for admin view
        assigned_receiver: r.assigned_receiver, // Preserve for admin view
        assigned_sender_1: r.assigned_sender_1, // Preserve for admin view
        assigned_sender_2: r.assigned_sender_2, // Preserve for admin view
        role: isReceiver ? 'receiver' : (isSender1 ? 'sender1' : 'sender2'),
        completed: r.completed
      }
    })
  } catch (error) {
    console.error('Error fetching passphrase missions for agent:', error)
    throw error
  }
}

// Complete a passphrase mission (only receivers can complete)
export async function completePassphraseMission(missionId, answer, agentId) {
  try {
    // Get the passphrase mission
    const missionResult = await sql`
      SELECT id, correct_answer, incorrect_answer, assigned_receiver, assigned_sender_1, assigned_sender_2, completed
      FROM passphrase_missions
      WHERE id = ${missionId}
    `

    if (missionResult.length === 0) {
      throw new Error('Mission not found')
    }

    const mission = missionResult[0]

    // Only receivers can complete passphrase missions
    if (mission.assigned_receiver !== agentId) {
      throw new Error('Only the receiver can complete this mission')
    }

    // Check if already completed
    if (mission.completed) {
      throw new Error('Mission already completed')
    }

    // Validate answer (case-insensitive, flexible matching)
    const answerLower = answer?.toLowerCase().trim()
    const correctAnswerLower = mission.correct_answer?.toLowerCase().trim()
    const incorrectAnswerLower = mission.incorrect_answer?.toLowerCase().trim()

    if (!answerLower || !correctAnswerLower) {
      throw new Error('Answer required')
    }

    // Check if answer matches correct or incorrect
    const isCorrect = correctAnswerLower === answerLower ||
                     correctAnswerLower.includes(answerLower) ||
                     answerLower.includes(correctAnswerLower)

    const isIncorrect = incorrectAnswerLower === answerLower ||
                        incorrectAnswerLower.includes(answerLower) ||
                        answerLower.includes(incorrectAnswerLower)

    if (!isCorrect && !isIncorrect) {
      throw new Error('Answer does not match the correct or incorrect option. Try again or talk to your handler.')
    }

    // Mark mission as completed (regardless of whether answer was correct or incorrect)
    await sql`
      UPDATE passphrase_missions
      SET completed = true
      WHERE id = ${missionId}
    `

    // Only generate and award intel if they got the correct answer
    let newIntel = null
    if (isCorrect) {
      newIntel = await generateRandomIntel(agentId)
    }

    return { 
      message: isCorrect 
        ? 'Mission completed successfully! You chose the correct answer.'
        : 'Mission failed. You\'ve been tricked! You fell for the false intel.',
      intel: newIntel,
      was_correct: isCorrect
    }
  } catch (error) {
    console.error('Error completing passphrase mission:', error)
    throw error
  }
}

// Admin function to manually complete a passphrase mission (no validation)
export async function adminCompletePassphraseMission(missionId, userId) {
  try {
    // Get the passphrase mission
    const missionResult = await sql`
      SELECT id, assigned_receiver, assigned_sender_1, assigned_sender_2, completed
      FROM passphrase_missions
      WHERE id = ${missionId}
    `

    if (missionResult.length === 0) {
      throw new Error('Mission not found')
    }

    const mission = missionResult[0]

    // Check if user is involved in this mission
    const isInvolved = mission.assigned_receiver === userId ||
                      mission.assigned_sender_1 === userId ||
                      mission.assigned_sender_2 === userId

    if (!isInvolved) {
      throw new Error('User not involved in this mission')
    }

    // Check if already completed
    if (mission.completed) {
      throw new Error('Mission already completed')
    }

    // Mark mission as completed
    await sql`
      UPDATE passphrase_missions
      SET completed = true
      WHERE id = ${missionId}
    `

    // Only award intel if they were the receiver (passphrase missions only give intel to receivers)
    let newIntel = null
    if (mission.assigned_receiver === userId) {
      // For receivers, we assume they got it correct when admin completes
      newIntel = await generateRandomIntel(userId)
    }

    return { 
      success: true,
      message: 'Mission completed successfully',
      intel: newIntel
    }
  } catch (error) {
    console.error('Error admin completing passphrase mission:', error)
    throw error
  }
}

