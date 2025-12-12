import { sql } from './db.js';
import { getActiveSession } from './sessions.js';
import { getUsers } from './users.js';
import { getUserScore } from './users.js';

// Re-export getUserScore for convenience
export { getUserScore };

// Check if user has already submitted intel (for current voting period)
export async function hasSubmittedIntel(agentId) {
  try {
    const activeSession = await getActiveSession()
    if (!activeSession || !activeSession.voting_open) {
      return false
    }

    // If voting is open, check if they have a score set
    // We'll use a simple check: if voting is open and they have submitted,
    // we track it via checking their score
    // For now, we'll check if their score is set (including 0)
    const score = await getUserScore(agentId)
    // If voting is open and they previously submitted, their score would be set
    // We'll use localStorage to track submission per session to be more reliable
    return false // This will be handled client-side with localStorage
  } catch (error) {
    console.error('Error checking submission status:', error)
    return false
  }
}

// Submit intel and calculate score
// guesses format: { userId: { aliases: [alias1, alias2], team: 'red'|'blue'|'unknown' } }
export async function submitIntel(agentId, guesses) {
  try {
    if (!agentId) {
      throw new Error('Agent ID required')
    }

    // Check if voting is open
    const activeSession = await getActiveSession()
    if (!activeSession || !activeSession.voting_open) {
      throw new Error('Voting is not currently open')
    }

    // Check if agent is in the session
    if (!activeSession.participant_user_ids.includes(agentId)) {
      throw new Error('You are not in the active session')
    }

    // Get all users in the session
    const sessionUserIds = new Set(activeSession.participant_user_ids.map(id => Number(id)))
    const allUsers = await getUsers()
    const sessionUsers = allUsers.filter(user => sessionUserIds.has(user.id))
    
    // Calculate score changes
    let totalScoreChange = 0
    const scoreDetails = []

    // Process each user guess
    for (const [userIdStr, guess] of Object.entries(guesses)) {
      const userId = Number(userIdStr)
      const actualUser = sessionUsers.find(u => u.id === userId)
      
      if (!actualUser) {
        continue // Skip if user not in session
      }

      // Check alias guesses (position 0 and 1)
      if (guess.aliases && Array.isArray(guess.aliases)) {
        // Position 0 (first alias)
        const alias0 = guess.aliases[0]
        if (alias0 !== null && alias0 !== undefined && alias0 !== '') {
          const isCorrect = alias0.trim().toLowerCase() === actualUser.alias_1.trim().toLowerCase()
          if (isCorrect) {
            totalScoreChange += 1
            scoreDetails.push({ userId, type: 'alias', position: 0, correct: true, points: 1 })
          } else {
            // No penalty for incorrect alias guesses - just track for UI feedback
            scoreDetails.push({ userId, type: 'alias', position: 0, correct: false, points: 0 })
          }
        }

        // Position 1 (second alias)
        const alias1 = guess.aliases[1]
        if (alias1 !== null && alias1 !== undefined && alias1 !== '') {
          const isCorrect = alias1.trim().toLowerCase() === actualUser.alias_2.trim().toLowerCase()
          if (isCorrect) {
            totalScoreChange += 1
            scoreDetails.push({ userId, type: 'alias', position: 1, correct: true, points: 1 })
          } else {
            // No penalty for incorrect alias guesses - just track for UI feedback
            scoreDetails.push({ userId, type: 'alias', position: 1, correct: false, points: 0 })
          }
        }
      }

      // Check team guess
      if (guess.team && guess.team !== 'unknown') {
        const isCorrect = guess.team === actualUser.team
        if (isCorrect) {
          totalScoreChange += 3
          scoreDetails.push({ userId, type: 'team', correct: true, points: 3 })
        } else {
          totalScoreChange -= 3
          scoreDetails.push({ userId, type: 'team', correct: false, points: -3 })
        }
      }
    }

    // Update agent's score
    const currentUser = sessionUsers.find(u => u.id === agentId)
    if (!currentUser) {
      throw new Error('Agent not found in session')
    }

    // Reset score to 0, then apply score changes
    // Score is not additive - it's calculated fresh each time
    const newScore = totalScoreChange

    // Update score
    await sql`
      UPDATE users 
      SET score = ${newScore}
      WHERE id = ${agentId}
    `

    return {
      success: true,
      scoreChange: totalScoreChange,
      newScore: newScore,
      details: scoreDetails,
      message: `Score: ${newScore} points (${totalScoreChange >= 0 ? '+' : ''}${totalScoreChange})`
    }
  } catch (error) {
    console.error('Error submitting intel:', error)
    throw error
  }
}

