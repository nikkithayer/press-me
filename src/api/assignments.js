import { sql } from './db.js';
import { getActiveSession } from './sessions.js';

// ============================================================================
// Helper Functions
// ============================================================================

// Acquire lock with retry logic
async function acquireLock(maxRetries = 5) {
  const baseDelayMs = 100
  
  // Quick early check
  const quickCheck = await sql`
    SELECT currently_updating FROM assignment_timestamp WHERE id = 1
  `
  if (quickCheck.length > 0 && quickCheck[0].currently_updating === true) {
    return { acquired: false, timestamp: null }
  }
  
  let timestampValue = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const timestampCheck = await sql`
      SELECT last_assigned_at, currently_updating FROM assignment_timestamp WHERE id = 1
    `
    
    if (timestampCheck.length > 0 && timestampCheck[0].currently_updating === true) {
      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      return { acquired: false, timestamp: null }
    }
    
    timestampValue = timestampCheck.length > 0 ? timestampCheck[0].last_assigned_at : null
    
    await sql`
      INSERT INTO assignment_timestamp (id, last_assigned_at, currently_updating)
      VALUES (1, NOW(), false)
      ON CONFLICT (id) DO NOTHING
    `
    
    const lockResult = timestampValue 
      ? await sql`
          UPDATE assignment_timestamp 
          SET currently_updating = true
          WHERE id = 1 
            AND currently_updating = false
            AND last_assigned_at = ${timestampValue}
          RETURNING id, last_assigned_at, currently_updating
        `
      : await sql`
          UPDATE assignment_timestamp 
          SET currently_updating = true
          WHERE id = 1 
            AND currently_updating = false
            AND last_assigned_at IS NULL
          RETURNING id, last_assigned_at, currently_updating
        `
    
    if (lockResult.length > 0 && lockResult[0].currently_updating === true) {
      return { acquired: true, timestamp: timestampValue }
    }
    
    if (attempt < maxRetries - 1) {
      const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  return { acquired: false, timestamp: null }
}

// Release lock
async function releaseLock() {
  try {
    await sql`UPDATE assignment_timestamp SET currently_updating = false WHERE id = 1`
  } catch (error) {
    console.error('Error releasing lock:', error)
  }
}

// Unassign all missions for given user IDs
async function unassignUserMissions(userIds) {
  await sql`
    UPDATE book_missions
    SET assigned_red = NULL,
        assigned_blue = NULL,
        red_completed = false,
        blue_completed = false
    WHERE assigned_red = ANY(${userIds}::integer[]) OR assigned_blue = ANY(${userIds}::integer[])
  `
  
  await sql`
    UPDATE passphrase_missions
    SET assigned_receiver = NULL,
        assigned_sender_1 = NULL,
        assigned_sender_2 = NULL,
        completed = false
    WHERE assigned_receiver = ANY(${userIds}::integer[]) 
       OR assigned_sender_1 = ANY(${userIds}::integer[])
       OR assigned_sender_2 = ANY(${userIds}::integer[])
  `
  
  await sql`
    UPDATE object_missions
    SET assigned_agent = NULL,
        assigned_now = false,
        completed = false
    WHERE assigned_agent = ANY(${userIds}::integer[])
  `
}

// Get total mission count for a user
function getUserMissionCount(userId, userAssignments) {
  const assignments = userAssignments.get(userId)
  return assignments.books.length + assignments.passphrases.length + assignments.objects.length
}

// Get set of mission types a user has
function getUserMissionTypes(userId, userAssignments) {
  const assignments = userAssignments.get(userId)
  const types = new Set()
  if (assignments.books.length > 0) types.add('book')
  if (assignments.passphrases.length > 0) types.add('passphrase')
  if (assignments.objects.length > 0) types.add('object')
  return types
}

// Get next mission type to assign (simplified diversity logic)
function getNextMissionType(userId, userAssignments) {
  const assignments = userAssignments.get(userId)
  const total = getUserMissionCount(userId, userAssignments)
  const types = getUserMissionTypes(userId, userAssignments)
  
  if (total === 0) return 'book'
  if (total === 3) return null
  
  // If user has only one type, prioritize different type
  if (types.size === 1) {
    const currentType = Array.from(types)[0]
    if (currentType === 'book') return 'passphrase'
    if (currentType === 'passphrase') return 'object'
    return 'book'
  }
  
  // If user has 2 types, get the missing one
  if (types.size === 2) {
    const allTypes = ['book', 'passphrase', 'object']
    const missing = allTypes.find(t => !types.has(t))
    return missing || 'book'
  }
  
  // User has all types, assign any
  return 'book'
}

// ============================================================================
// Assignment Logic
// ============================================================================

// Assign a book mission (requires red/blue pair)
function assignBookMission(userId, availableMissions, userAssignments, users, redUsers, blueUsers) {
  const userTeam = users.find(u => u.id === userId)?.team
  if (!userTeam) return false
  
  const filtered = availableMissions.filter(m => {
    const prevReds = Array.isArray(m.previous_reds) ? m.previous_reds : []
    const prevBlues = Array.isArray(m.previous_blues) ? m.previous_blues : []
    const userPrev = userTeam === 'red' ? prevReds : prevBlues
    return !userPrev.includes(userId) && !m.assigned_red && !m.assigned_blue
  })
  
  if (filtered.length === 0) return false
  
  // Sort by previous assignments (prefer missions with fewer previous assignments)
  filtered.sort((a, b) => {
    const aPrev = (Array.isArray(a.previous_reds) ? a.previous_reds.length : 0) + 
                  (Array.isArray(a.previous_blues) ? a.previous_blues.length : 0)
    const bPrev = (Array.isArray(b.previous_reds) ? b.previous_reds.length : 0) + 
                  (Array.isArray(b.previous_blues) ? b.previous_blues.length : 0)
    return aPrev - bPrev
  })
  
  const partnerTeam = userTeam === 'red' ? 'blue' : 'red'
  const partnerPool = partnerTeam === 'red' ? redUsers : blueUsers
  
  for (const mission of filtered) {
    const partnerPrev = userTeam === 'red' 
      ? (Array.isArray(mission.previous_blues) ? mission.previous_blues : [])
      : (Array.isArray(mission.previous_reds) ? mission.previous_reds : [])
    
    const availablePartners = partnerPool
      .map(partnerId => ({ partnerId, total: getUserMissionCount(partnerId, userAssignments) }))
      .filter(p => p.total < 3 && !partnerPrev.includes(p.partnerId))
      .sort((a, b) => a.total - b.total)
    
    if (availablePartners.length > 0) {
      const partner = availablePartners[0].partnerId
      const assignments = userAssignments.get(userId)
      const partnerAssignments = userAssignments.get(partner)
      
      assignments.books.push({ missionId: mission.id, partnerId: partner })
      partnerAssignments.books.push({ missionId: mission.id, partnerId: userId })
      mission.assigned_red = userTeam === 'red' ? userId : partner
      mission.assigned_blue = userTeam === 'blue' ? userId : partner
      return true
    }
  }
  
  return false
}

// Assign a passphrase mission (requires receiver + 2 senders)
function assignPassphraseMission(userId, availableMissions, userAssignments, allUsers) {
  const filtered = availableMissions.filter(m => {
    const prevReceivers = Array.isArray(m.previous_receivers) ? m.previous_receivers : []
    const prevSenders = Array.isArray(m.previous_senders) ? m.previous_senders : []
    return !prevReceivers.includes(userId) && !prevSenders.includes(userId) &&
           !m.assigned_receiver && !m.assigned_sender_1 && !m.assigned_sender_2
  })
  
  if (filtered.length === 0) return false
  
  // Sort by previous assignments
  filtered.sort((a, b) => {
    const aPrev = (Array.isArray(a.previous_receivers) ? a.previous_receivers.length : 0) + 
                  (Array.isArray(a.previous_senders) ? a.previous_senders.length : 0)
    const bPrev = (Array.isArray(b.previous_receivers) ? b.previous_receivers.length : 0) + 
                  (Array.isArray(b.previous_senders) ? b.previous_senders.length : 0)
    return aPrev - bPrev
  })
  
  for (const mission of filtered) {
    const prevReceivers = Array.isArray(mission.previous_receivers) ? mission.previous_receivers : []
    const prevSenders = Array.isArray(mission.previous_senders) ? mission.previous_senders : []
    
    const availableSenders = allUsers
      .map(senderId => ({ senderId, total: getUserMissionCount(senderId, userAssignments) }))
      .filter(p => p.senderId !== userId && p.total < 3 &&
                   !prevReceivers.includes(p.senderId) && !prevSenders.includes(p.senderId))
      .sort((a, b) => a.total - b.total)
    
    if (availableSenders.length >= 2) {
      const sender1 = availableSenders[0].senderId
      const sender2 = availableSenders[1].senderId
      
      const assignments = userAssignments.get(userId)
      const sender1Assignments = userAssignments.get(sender1)
      const sender2Assignments = userAssignments.get(sender2)
      
      assignments.passphrases.push({ missionId: mission.id, sender1Id: sender1, sender2Id: sender2 })
      sender1Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true })
      sender2Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true })
      mission.assigned_receiver = userId
      mission.assigned_sender_1 = sender1
      mission.assigned_sender_2 = sender2
      return true
    }
  }
  
  return false
}

// Assign an object mission
function assignObjectMission(userId, availableMissions, userAssignments) {
  const filtered = availableMissions.filter(m => {
    const prev = Array.isArray(m.past_assigned_agents) ? m.past_assigned_agents : []
    return !prev.includes(userId) && !m.assigned_agent
  })
  
  if (filtered.length === 0) return false
  
  // Sort by previous assignments
  filtered.sort((a, b) => {
    const aPrev = Array.isArray(a.past_assigned_agents) ? a.past_assigned_agents.length : 0
    const bPrev = Array.isArray(b.past_assigned_agents) ? b.past_assigned_agents.length : 0
    return aPrev - bPrev
  })
  
  const mission = filtered[0]
  const assignments = userAssignments.get(userId)
  assignments.objects.push({ missionId: mission.id })
  mission.assigned_agent = userId
  return true
}

// ============================================================================
// Main Assignment Plan Builder
// ============================================================================

export async function buildAssignmentPlan(userIdsArray) {
  // Get users with their teams
  const users = await sql`
    SELECT id, team FROM users WHERE id = ANY(${userIdsArray}::integer[]) AND ishere = true
  `
  
  if (users.length === 0) {
    throw new Error('No valid users selected')
  }

  const redUsers = users.filter(u => u.team === 'red').map(u => u.id)
  const blueUsers = users.filter(u => u.team === 'blue').map(u => u.id)
  const allUsers = users.map(u => u.id)
  
  // Load all available missions (exclude completed ones)
  const bookMissions = await sql`
    SELECT id, previous_reds, previous_blues FROM book_missions 
    WHERE assigned_red IS NULL AND assigned_blue IS NULL
      AND red_completed = false AND blue_completed = false
    ORDER BY id
  `
  
  const passphraseMissions = await sql`
    SELECT id, previous_receivers, previous_senders FROM passphrase_missions
    WHERE assigned_receiver IS NULL AND assigned_sender_1 IS NULL AND assigned_sender_2 IS NULL
      AND completed = false
    ORDER BY id
  `
  
  const objectMissions = await sql`
    SELECT id, past_assigned_agents FROM object_missions
    WHERE assigned_agent IS NULL AND completed = false
    ORDER BY id
  `

  // Track assignments per user
  const userAssignments = new Map()
  allUsers.forEach(userId => {
    userAssignments.set(userId, { books: [], passphrases: [], objects: [] })
  })
  
  // Assign missions until all users have exactly 3 missions
  let iterations = 0
  const maxIterations = allUsers.length * 20
  
  while (iterations < maxIterations) {
    const usersNeedingMissions = allUsers
      .map(userId => ({ userId, total: getUserMissionCount(userId, userAssignments) }))
      .filter(u => u.total < 3)
      .sort((a, b) => a.total - b.total)
    
    if (usersNeedingMissions.length === 0) break
    
    let anyAssignment = false
    
    for (const { userId } of usersNeedingMissions) {
      if (getUserMissionCount(userId, userAssignments) >= 3) continue
      
      const nextType = getNextMissionType(userId, userAssignments)
      if (!nextType) continue
      
      let assigned = false
      
      if (nextType === 'book') {
        assigned = assignBookMission(userId, bookMissions, userAssignments, users, redUsers, blueUsers)
      } else if (nextType === 'passphrase') {
        assigned = assignPassphraseMission(userId, passphraseMissions, userAssignments, allUsers)
      } else if (nextType === 'object') {
        assigned = assignObjectMission(userId, objectMissions, userAssignments)
      }
      
      if (assigned) {
        anyAssignment = true
      }
    }
    
    if (!anyAssignment) {
      console.warn(`No assignments made in iteration ${iterations}, but users still need missions`)
      break
    }
    iterations++
  }
  
  // Build final plan structure
  const plan = {
    books: [],
    passphrases: [],
    objects: []
  }
  
  // Collect book assignments (avoid duplicates)
  const bookAssignmentsSet = new Set()
  for (const [userId, assignments] of userAssignments) {
    for (const book of assignments.books) {
      const key = `${book.missionId}`
      if (!bookAssignmentsSet.has(key)) {
        const userTeam = users.find(u => u.id === userId)?.team
        plan.books.push({
          missionId: book.missionId,
          redUserId: userTeam === 'red' ? userId : book.partnerId,
          blueUserId: userTeam === 'blue' ? userId : book.partnerId
        })
        bookAssignmentsSet.add(key)
      }
    }
  }
  
  // Collect passphrase assignments (avoid duplicates)
  const passphraseAssignmentsSet = new Set()
  for (const [userId, assignments] of userAssignments) {
    for (const passphrase of assignments.passphrases) {
      if (!passphrase.isSender) {
        const key = `${passphrase.missionId}`
        if (!passphraseAssignmentsSet.has(key)) {
          plan.passphrases.push({
            missionId: passphrase.missionId,
            receiverId: userId,
            sender1Id: passphrase.sender1Id,
            sender2Id: passphrase.sender2Id
          })
          passphraseAssignmentsSet.add(key)
        }
      }
    }
  }
  
  // Collect object assignments
  for (const [userId, assignments] of userAssignments) {
    for (const object of assignments.objects) {
      plan.objects.push({
        missionId: object.missionId,
        agentId: userId
      })
    }
  }
  
  return plan
}

// ============================================================================
// Validation
// ============================================================================

export function validateAssignmentPlan(plan, userIdsArray) {
  const errors = []
  const userStats = new Map()
  
  userIdsArray.forEach(userId => {
    userStats.set(userId, { count: 0, types: new Set() })
  })
  
  // Count assignments in a single pass
  for (const book of plan.books) {
    if (book.redUserId) {
      const stats = userStats.get(book.redUserId)
      if (stats) {
        stats.count++
        stats.types.add('book')
      }
    }
    if (book.blueUserId) {
      const stats = userStats.get(book.blueUserId)
      if (stats) {
        stats.count++
        stats.types.add('book')
      }
    }
  }
  
  for (const passphrase of plan.passphrases) {
    if (passphrase.receiverId) {
      const stats = userStats.get(passphrase.receiverId)
      if (stats) {
        stats.count++
        stats.types.add('passphrase')
      }
    }
    if (passphrase.sender1Id) {
      const stats = userStats.get(passphrase.sender1Id)
      if (stats) {
        stats.count++
        stats.types.add('passphrase')
      }
    }
    if (passphrase.sender2Id) {
      const stats = userStats.get(passphrase.sender2Id)
      if (stats) {
        stats.count++
        stats.types.add('passphrase')
      }
    }
  }
  
  for (const object of plan.objects) {
    if (object.agentId) {
      const stats = userStats.get(object.agentId)
      if (stats) {
        stats.count++
        stats.types.add('object')
      }
    }
  }
  
  // Validate counts and diversity
  for (const userId of userIdsArray) {
    const stats = userStats.get(userId)
    if (!stats) continue
    
    if (stats.count !== 3) {
      errors.push(`User ${userId} has ${stats.count} missions (expected 3)`)
    }
    
    if (stats.count === 3 && stats.types.size < 2) {
      errors.push(`User ${userId} has ${stats.count} missions but only ${stats.types.size} different types (need at least 2)`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// ============================================================================
// Execution
// ============================================================================

export async function executeAssignmentPlan(plan, userIdsArray, expectedTimestamp = null) {
  // Verify lock is still held
  const lockCheck = await sql`
    SELECT currently_updating FROM assignment_timestamp WHERE id = 1
  `
  if (!lockCheck.length || !lockCheck[0].currently_updating) {
    throw new Error('Lock not held - another process may be updating assignments')
  }
  
  // Verify timestamp hasn't changed
  if (expectedTimestamp !== null) {
    const currentTimestamp = await sql`
      SELECT last_assigned_at FROM assignment_timestamp WHERE id = 1
    `
    const currentValue = currentTimestamp.length > 0 ? currentTimestamp[0].last_assigned_at : null
    
    if (currentValue === null && expectedTimestamp !== null) {
      throw new Error('Assignments were updated by another process before execution')
    }
    if (currentValue !== null && expectedTimestamp !== null) {
      const currentTime = currentValue instanceof Date ? currentValue.getTime() : new Date(currentValue).getTime()
      const expectedTime = expectedTimestamp instanceof Date ? expectedTimestamp.getTime() : new Date(expectedTimestamp).getTime()
      if (currentTime !== expectedTime) {
        throw new Error('Assignments were updated by another process before execution')
      }
    }
  }
  
  // Execute all book assignments atomically using CTE
  if (plan.books.length > 0) {
    const bookValues = plan.books.map(book => 
      `(${book.missionId}::integer, ${book.redUserId}::integer, ${book.blueUserId}::integer)`
    ).join(', ')
    
    await sql`
      WITH assignment_plan AS (
        SELECT * FROM (VALUES ${sql.unsafe(bookValues)}) AS t(mission_id, red_user_id, blue_user_id)
      )
      UPDATE book_missions
      SET assigned_red = assignment_plan.red_user_id,
          assigned_blue = assignment_plan.blue_user_id,
          previous_reds = array_append(COALESCE(book_missions.previous_reds, ARRAY[]::integer[]), assignment_plan.red_user_id),
          previous_blues = array_append(COALESCE(book_missions.previous_blues, ARRAY[]::integer[]), assignment_plan.blue_user_id)
      FROM assignment_plan
      WHERE book_missions.id = assignment_plan.mission_id
        AND book_missions.assigned_red IS NULL
        AND book_missions.assigned_blue IS NULL
        AND EXISTS (SELECT 1 FROM assignment_timestamp WHERE id = 1 AND currently_updating = true)
      RETURNING book_missions.id
    `
  }
  
  // Execute all passphrase assignments atomically using CTE
  if (plan.passphrases.length > 0) {
    const passphraseValues = plan.passphrases.map(p => 
      `(${p.missionId}::integer, ${p.receiverId}::integer, ${p.sender1Id}::integer, ${p.sender2Id}::integer)`
    ).join(', ')
    
    await sql`
      WITH assignment_plan AS (
        SELECT * FROM (VALUES ${sql.unsafe(passphraseValues)}) AS t(mission_id, receiver_id, sender1_id, sender2_id)
      )
      UPDATE passphrase_missions
      SET assigned_receiver = assignment_plan.receiver_id,
          assigned_sender_1 = assignment_plan.sender1_id,
          assigned_sender_2 = assignment_plan.sender2_id,
          previous_receivers = array_append(COALESCE(passphrase_missions.previous_receivers, ARRAY[]::integer[]), assignment_plan.receiver_id),
          previous_senders = array_append(
            array_append(COALESCE(passphrase_missions.previous_senders, ARRAY[]::integer[]), assignment_plan.sender1_id),
            assignment_plan.sender2_id
          )
      FROM assignment_plan
      WHERE passphrase_missions.id = assignment_plan.mission_id
        AND passphrase_missions.assigned_receiver IS NULL
        AND passphrase_missions.assigned_sender_1 IS NULL
        AND passphrase_missions.assigned_sender_2 IS NULL
        AND EXISTS (SELECT 1 FROM assignment_timestamp WHERE id = 1 AND currently_updating = true)
      RETURNING passphrase_missions.id
    `
  }
  
  // Execute all object assignments atomically using CTE
  if (plan.objects.length > 0) {
    const objectValues = plan.objects.map(obj => 
      `(${obj.missionId}::integer, ${obj.agentId}::integer)`
    ).join(', ')
    
    await sql`
      WITH assignment_plan AS (
        SELECT * FROM (VALUES ${sql.unsafe(objectValues)}) AS t(mission_id, agent_id)
      )
      UPDATE object_missions
      SET assigned_agent = assignment_plan.agent_id,
          past_assigned_agents = array_append(COALESCE(object_missions.past_assigned_agents, ARRAY[]::integer[]), assignment_plan.agent_id),
          assigned_now = true
      FROM assignment_plan
      WHERE object_missions.id = assignment_plan.mission_id
        AND object_missions.assigned_agent IS NULL
        AND EXISTS (SELECT 1 FROM assignment_timestamp WHERE id = 1 AND currently_updating = true)
      RETURNING object_missions.id
    `
  }
}

// ============================================================================
// Main Assignment Functions
// ============================================================================

// Unified function to assign missions (replaces both resetAndAssignAllMissions and assignMissionsToSessionUsers)
async function assignMissions(userIds, options = {}) {
  const { getUsersFromSession = false } = options
  const functionCallId = `assign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  let lockAcquired = false
  
  try {
    // Get user IDs
    let finalUserIds = userIds
    if (getUsersFromSession) {
      const activeSession = await getActiveSession()
      if (!activeSession) {
        throw new Error('No active session. Cannot assign missions.')
      }
      finalUserIds = activeSession.participant_user_ids || []
      if (finalUserIds.length === 0) {
        throw new Error('No participants in active session')
      }
    }
    
    // Acquire lock
    const lockResult = await acquireLock()
    if (!lockResult.acquired) {
      return { success: false, assigned: 0, reason: 'Failed to acquire lock' }
    }
    lockAcquired = true
    
    // Unassign all missions for users
    await unassignUserMissions(finalUserIds)
    
    // Build and validate assignment plan
    let plan = null
    let validation = null
    const maxRetries = 50
    let retryCount = 0
    
    while (retryCount < maxRetries) {
      plan = await buildAssignmentPlan(finalUserIds)
      validation = validateAssignmentPlan(plan, finalUserIds)
      
      if (validation.valid) {
        break
      }
      
      retryCount++
      if (retryCount >= maxRetries) {
        throw new Error(`Assignment plan invalid after ${maxRetries} attempts: ${validation.errors.join(', ')}`)
      }
    }
    
    const totalMissions = plan.books.length + plan.passphrases.length + plan.objects.length
    
    // Execute plan
    await executeAssignmentPlan(plan, finalUserIds, lockResult.timestamp)
    
    // Update timestamp
    await updateAssignmentTimestamp()
    
    return {
      success: true,
      assigned: totalMissions,
      usersAssigned: finalUserIds.length,
      missionsAssigned: totalMissions
    }
  } catch (error) {
    console.error(`[${functionCallId}] Error assigning missions:`, error)
    throw error
  } finally {
    if (lockAcquired) {
      await releaseLock()
    }
  }
}

// Reset all missions and assign (uses active session)
export async function resetAndAssignAllMissions() {
  return await assignMissions([], { getUsersFromSession: true })
}

// Assign missions to specific users
export async function assignMissionsToSessionUsers(userIdsArray) {
  return await assignMissions(userIdsArray, { getUsersFromSession: false })
}

// ============================================================================
// Timestamp Utilities
// ============================================================================

export async function getLastAssignmentTimestamp() {
  try {
    const result = await sql`
      SELECT last_assigned_at 
      FROM assignment_timestamp 
      WHERE id = 1
    `
    
    if (result.length === 0) {
      return null
    }
    
    const timestamp = result[0].last_assigned_at
    return timestamp instanceof Date ? timestamp : new Date(timestamp)
  } catch (error) {
    return null
  }
}

export async function updateAssignmentTimestamp() {
  try {
    const nowUTC = new Date().toISOString()
    await sql`
      INSERT INTO assignment_timestamp (id, last_assigned_at)
      VALUES (1, ${nowUTC}::timestamptz AT TIME ZONE 'UTC')
      ON CONFLICT (id) 
      DO UPDATE SET last_assigned_at = ${nowUTC}::timestamptz AT TIME ZONE 'UTC'
    `
    return true
  } catch (error) {
    // Try simpler fallback
    try {
      await sql`
        INSERT INTO assignment_timestamp (id, last_assigned_at)
        VALUES (1, NOW())
        ON CONFLICT (id) 
        DO UPDATE SET last_assigned_at = NOW()
      `
      return true
    } catch (fallbackError) {
      throw error
    }
  }
}
