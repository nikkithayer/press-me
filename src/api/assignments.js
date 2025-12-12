import { sql } from './db.js';
import { getActiveSession } from './sessions.js';
import { getUsers } from './users.js';

// Build assignment plan for users
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
  
  // Load all available missions
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
  const userAssignments = new Map() // userId -> { books: [], passphrases: [], objects: [] }
  allUsers.forEach(userId => {
    userAssignments.set(userId, { books: [], passphrases: [], objects: [] })
  })
  
  // Helper to check if user has had this mission before
  const userHadBookMission = (userId, mission) => {
    const prevReds = Array.isArray(mission.previous_reds) ? mission.previous_reds : []
    const prevBlues = Array.isArray(mission.previous_blues) ? mission.previous_blues : []
    const userTeam = users.find(u => u.id === userId)?.team
    return userTeam === 'red' ? prevReds.includes(userId) : prevBlues.includes(userId)
  }

  const userHadPassphraseMission = (userId, mission) => {
    const prevReceivers = Array.isArray(mission.previous_receivers) ? mission.previous_receivers : []
    const prevSenders = Array.isArray(mission.previous_senders) ? mission.previous_senders : []
    return prevReceivers.includes(userId) || prevSenders.includes(userId)
  }

  const userHadObjectMission = (userId, mission) => {
    const prev = Array.isArray(mission.past_assigned_agents) ? mission.past_assigned_agents : []
    return prev.includes(userId)
  }

  // Helper to get needed mission type for a user (deterministic, prioritizes diversity)
  const getNeededMissionType = (userId) => {
    const assignments = userAssignments.get(userId)
    const total = assignments.books.length + assignments.passphrases.length + assignments.objects.length
    const types = []
    if (assignments.books.length > 0) types.push('book')
    if (assignments.passphrases.length > 0) types.push('passphrase')
    if (assignments.objects.length > 0) types.push('object')
    const uniqueTypes = new Set(types)
    
    if (total === 0) {
      return 'book' // Start with book missions
    } else if (total === 1) {
      const usedType = types[0]
      if (usedType === 'book') return 'passphrase'
      if (usedType === 'passphrase') return 'object'
      return 'book'
    } else if (total === 2) {
      if (uniqueTypes.size === 1) {
        const currentType = types[0]
        if (currentType === 'book') return 'passphrase'
        if (currentType === 'passphrase') return 'object'
        return 'book'
      } else {
        const missingTypes = ['book', 'passphrase', 'object'].filter(t => !types.includes(t))
        if (missingTypes.length > 0) return missingTypes[0]
        return 'object'
      }
    }
    return null // User has 3 missions
  }

  // Helper to check if user needs a specific type for diversity
  const needsTypeForDiversity = (userId) => {
    const assignments = userAssignments.get(userId)
    const total = assignments.books.length + assignments.passphrases.length + assignments.objects.length
    const bookCount = assignments.books.length
    const passphraseCount = assignments.passphrases.length
    const objectCount = assignments.objects.length
    
    const uniqueTypes = new Set()
    if (bookCount > 0) uniqueTypes.add('book')
    if (passphraseCount > 0) uniqueTypes.add('passphrase')
    if (objectCount > 0) uniqueTypes.add('object')
    
    if (total === 0) {
      return ['book', 'passphrase', 'object']
    }
    
    if (total === 1) {
      if (bookCount > 0) return ['passphrase', 'object']
      if (passphraseCount > 0) return ['book', 'object']
      if (objectCount > 0) return ['book', 'passphrase']
    }
    
    if (total === 2) {
      if (uniqueTypes.size === 1) {
        if (bookCount === 2) return ['passphrase', 'object']
        if (passphraseCount === 2) return ['book', 'object']
        if (objectCount === 2) return ['book', 'passphrase']
      }
      if (uniqueTypes.size === 2) {
        return ['book', 'passphrase', 'object']
      }
    }
    
    return []
  }
  
  // Helper to count missions for a user (all roles count)
  const countUserMissions = (userId) => {
    const assignments = userAssignments.get(userId)
    return assignments.books.length + assignments.passphrases.length + assignments.objects.length
  }
  
  // Assign missions until all users have exactly 3 missions
  let iterations = 0
  const maxIterations = allUsers.length * 20
  
  while (iterations < maxIterations) {
    const usersNeedingMissions = allUsers
      .map(userId => ({ userId, total: countUserMissions(userId) }))
      .filter(u => u.total < 3)
      .sort((a, b) => a.total - b.total)
    
    if (usersNeedingMissions.length === 0) {
      break
    }
    
    let anyAssignment = false
    
    for (const { userId } of usersNeedingMissions) {
      const assignments = userAssignments.get(userId)
      const total = countUserMissions(userId)
      
      if (total >= 3) continue
      
      const neededTypes = needsTypeForDiversity(userId)
      const neededType = getNeededMissionType(userId)
      const typesToTry = neededType && neededTypes.includes(neededType) 
        ? [neededType, ...neededTypes.filter(t => t !== neededType)]
        : neededTypes
      
      let assigned = false
      
      for (const typeToTry of typesToTry) {
        if (assigned || countUserMissions(userId) >= 3) break
        
        if (typeToTry === 'book') {
          const userTeam = users.find(u => u.id === userId)?.team
          if (!userTeam) continue
          
          const availableMissions = bookMissions.filter(m => {
            if (userHadBookMission(userId, m)) return false
            if (m.assigned_red || m.assigned_blue) return false
            return true
          })
          
          if (availableMissions.length > 0) {
            availableMissions.sort((a, b) => {
              const aPrev = (Array.isArray(a.previous_reds) ? a.previous_reds.length : 0) + 
                            (Array.isArray(a.previous_blues) ? a.previous_blues.length : 0)
              const bPrev = (Array.isArray(b.previous_reds) ? b.previous_reds.length : 0) + 
                            (Array.isArray(b.previous_blues) ? b.previous_blues.length : 0)
              return aPrev - bPrev
            })
            
            for (const mission of availableMissions) {
              const partnerTeam = userTeam === 'red' ? 'blue' : 'red'
              const partnerPool = partnerTeam === 'red' ? redUsers : blueUsers
              
              const availablePartners = partnerPool
                .map(partnerId => ({ partnerId, total: countUserMissions(partnerId) }))
                .filter(p => {
                  if (p.total >= 3) return false
                  const prev = userTeam === 'red' 
                    ? (Array.isArray(mission.previous_blues) ? mission.previous_blues : [])
                    : (Array.isArray(mission.previous_reds) ? mission.previous_reds : [])
                  return !prev.includes(p.partnerId)
                })
                .sort((a, b) => a.total - b.total)
              
              if (availablePartners.length > 0) {
                const partner = availablePartners[0].partnerId
                const partnerTotal = countUserMissions(partner)
                
                if (partnerTotal < 3) {
                  assignments.books.push({ missionId: mission.id, partnerId: partner })
                  userAssignments.get(partner).books.push({ missionId: mission.id, partnerId: userId })
                  mission.assigned_red = userTeam === 'red' ? userId : partner
                  mission.assigned_blue = userTeam === 'blue' ? userId : partner
                  assigned = true
                  anyAssignment = true
                  break
                }
              }
            }
          }
        } else if (typeToTry === 'passphrase') {
          const availableMissions = passphraseMissions.filter(m => {
            if (userHadPassphraseMission(userId, m)) return false
            if (m.assigned_receiver || m.assigned_sender_1 || m.assigned_sender_2) return false
            return true
          })
          
          if (availableMissions.length > 0) {
            availableMissions.sort((a, b) => {
              const aPrev = (Array.isArray(a.previous_receivers) ? a.previous_receivers.length : 0) + 
                            (Array.isArray(a.previous_senders) ? a.previous_senders.length : 0)
              const bPrev = (Array.isArray(b.previous_receivers) ? b.previous_receivers.length : 0) + 
                            (Array.isArray(b.previous_senders) ? b.previous_senders.length : 0)
              return aPrev - bPrev
            })
            
            for (const mission of availableMissions) {
              const availableSenders = allUsers
                .map(senderId => ({ senderId, total: countUserMissions(senderId) }))
                .filter(p => {
                  if (p.senderId === userId || p.total >= 3) return false
                  const prevReceivers = Array.isArray(mission.previous_receivers) ? mission.previous_receivers : []
                  const prevSenders = Array.isArray(mission.previous_senders) ? mission.previous_senders : []
                  return !prevReceivers.includes(p.senderId) && !prevSenders.includes(p.senderId)
                })
                .sort((a, b) => a.total - b.total)
              
              if (availableSenders.length >= 2) {
                const sender1 = availableSenders[0].senderId
                const sender2 = availableSenders[1].senderId
                const sender1Total = countUserMissions(sender1)
                const sender2Total = countUserMissions(sender2)
                
                if (sender1Total < 3 && sender2Total < 3) {
                  assignments.passphrases.push({ missionId: mission.id, sender1Id: sender1, sender2Id: sender2 })
                  userAssignments.get(sender1).passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true })
                  userAssignments.get(sender2).passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true })
                  mission.assigned_receiver = userId
                  mission.assigned_sender_1 = sender1
                  mission.assigned_sender_2 = sender2
                  assigned = true
                  anyAssignment = true
                  break
                }
              }
            }
          }
        } else if (typeToTry === 'object') {
          const availableMissions = objectMissions.filter(m => {
            if (userHadObjectMission(userId, m)) return false
            if (m.assigned_agent) return false
            return true
          })
          
          if (availableMissions.length > 0) {
            availableMissions.sort((a, b) => {
              const aPrev = Array.isArray(a.past_assigned_agents) ? a.past_assigned_agents.length : 0
              const bPrev = Array.isArray(b.past_assigned_agents) ? b.past_assigned_agents.length : 0
              return aPrev - bPrev
            })
            
            const mission = availableMissions[0]
            assignments.objects.push({ missionId: mission.id })
            mission.assigned_agent = userId
            assigned = true
            anyAssignment = true
          }
        }
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
  
  // Collect all book assignments (avoid duplicates by mission ID)
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
  
  // Collect all passphrase assignments (avoid duplicates by mission ID)
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
  
  // Collect all object assignments
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

// Validates an assignment plan
export function validateAssignmentPlan(plan, userIdsArray) {
  const errors = []
  const userCounts = new Map()
  const userTypes = new Map()
  
  userIdsArray.forEach(userId => {
    userCounts.set(userId, 0)
    userTypes.set(userId, { books: 0, passphrases: 0, objects: 0 })
  })
  
  // Count book assignments
  for (const book of plan.books) {
    if (book.redUserId) {
      const count = userCounts.get(book.redUserId) || 0
      userCounts.set(book.redUserId, count + 1)
      const types = userTypes.get(book.redUserId) || { books: 0, passphrases: 0, objects: 0 }
      types.books++
      userTypes.set(book.redUserId, types)
    }
    if (book.blueUserId) {
      const count = userCounts.get(book.blueUserId) || 0
      userCounts.set(book.blueUserId, count + 1)
      const types = userTypes.get(book.blueUserId) || { books: 0, passphrases: 0, objects: 0 }
      types.books++
      userTypes.set(book.blueUserId, types)
    }
  }
  
  // Count passphrase assignments
  for (const passphrase of plan.passphrases) {
    if (passphrase.receiverId) {
      const count = userCounts.get(passphrase.receiverId) || 0
      userCounts.set(passphrase.receiverId, count + 1)
      const types = userTypes.get(passphrase.receiverId) || { books: 0, passphrases: 0, objects: 0 }
      types.passphrases++
      userTypes.set(passphrase.receiverId, types)
    }
    if (passphrase.sender1Id) {
      const count = userCounts.get(passphrase.sender1Id) || 0
      userCounts.set(passphrase.sender1Id, count + 1)
      const types = userTypes.get(passphrase.sender1Id) || { books: 0, passphrases: 0, objects: 0 }
      types.passphrases++
      userTypes.set(passphrase.sender1Id, types)
    }
    if (passphrase.sender2Id) {
      const count = userCounts.get(passphrase.sender2Id) || 0
      userCounts.set(passphrase.sender2Id, count + 1)
      const types = userTypes.get(passphrase.sender2Id) || { books: 0, passphrases: 0, objects: 0 }
      types.passphrases++
      userTypes.set(passphrase.sender2Id, types)
    }
  }
  
  // Count object assignments
  for (const object of plan.objects) {
    if (object.agentId) {
      const count = userCounts.get(object.agentId) || 0
      userCounts.set(object.agentId, count + 1)
      const types = userTypes.get(object.agentId) || { books: 0, passphrases: 0, objects: 0 }
      types.objects++
      userTypes.set(object.agentId, types)
    }
  }
  
  // Validate counts
  for (const userId of userIdsArray) {
    const count = userCounts.get(userId) || 0
    if (count !== 3) {
      errors.push(`User ${userId} has ${count} missions (expected 3)`)
    }
    
    const types = userTypes.get(userId) || { books: 0, passphrases: 0, objects: 0 }
    const typeCount = (types.books > 0 ? 1 : 0) + (types.passphrases > 0 ? 1 : 0) + (types.objects > 0 ? 1 : 0)
    if (typeCount < 2 && count === 3) {
      errors.push(`User ${userId} has ${count} missions but only ${typeCount} different types (need at least 2)`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Executes an assignment plan atomically using CTE-based batch updates
export async function executeAssignmentPlan(plan, userIdsArray, expectedTimestamp = null) {
  const execId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  console.log(`[${execId}] executeAssignmentPlan called with ${plan.books.length} books, ${plan.passphrases.length} passphrases, ${plan.objects.length} objects`)
  
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

// Reset all missions and assign until each user has 3 missions total
export async function resetAndAssignAllMissions() {
  const functionCallId = `reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  console.log(`[${functionCallId}] resetAndAssignAllMissions called`)
  
  let lockAcquired = false
  const maxLockRetries = 5
  const baseDelayMs = 100
  
  try {
    // Quick early check - if lock is held, return immediately
    const quickCheck = await sql`
      SELECT currently_updating FROM assignment_timestamp WHERE id = 1
    `
    if (quickCheck.length > 0 && quickCheck[0].currently_updating === true) {
      return { assigned: 0, reason: 'Lock already held' }
    }
    
    const activeSession = await getActiveSession()
    if (!activeSession) {
      throw new Error('No active session. Cannot assign missions.')
    }
    
    const sessionUserIds = activeSession.participant_user_ids || []
    if (sessionUserIds.length === 0) {
      throw new Error('No participants in active session')
    }
    
    // Try to acquire lock with retry logic
    let lockResult = null
    let timestampValue = null
    
    for (let attempt = 0; attempt < maxLockRetries; attempt++) {
      const timestampCheck = await sql`
        SELECT last_assigned_at, currently_updating FROM assignment_timestamp WHERE id = 1
      `
      
      if (timestampCheck.length > 0 && timestampCheck[0].currently_updating === true) {
        if (attempt < maxLockRetries - 1) {
          const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        } else {
          return { assigned: 0, reason: 'Lock held after retries' }
        }
      }
      
      timestampValue = timestampCheck.length > 0 ? timestampCheck[0].last_assigned_at : null
      
      await sql`
        INSERT INTO assignment_timestamp (id, last_assigned_at, currently_updating)
        VALUES (1, NOW(), false)
        ON CONFLICT (id) DO NOTHING
      `
      
      lockResult = timestampValue 
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
        lockAcquired = true
        break
      }
      
      if (attempt < maxLockRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    
    if (!lockAcquired || !lockResult || lockResult.length === 0) {
      return { assigned: 0, reason: 'Failed to acquire lock after retries' }
    }
    
    // Unassign all missions for session users BEFORE building plan
    await sql`
      UPDATE book_missions
      SET assigned_red = NULL,
          assigned_blue = NULL,
          red_completed = false,
          blue_completed = false
      WHERE assigned_red = ANY(${sessionUserIds}::integer[]) OR assigned_blue = ANY(${sessionUserIds}::integer[])
    `
    
    await sql`
      UPDATE passphrase_missions
      SET assigned_receiver = NULL,
          assigned_sender_1 = NULL,
          assigned_sender_2 = NULL,
          completed = false
      WHERE assigned_receiver = ANY(${sessionUserIds}::integer[]) 
         OR assigned_sender_1 = ANY(${sessionUserIds}::integer[])
         OR assigned_sender_2 = ANY(${sessionUserIds}::integer[])
    `
    
    await sql`
      UPDATE object_missions
      SET assigned_agent = NULL,
          assigned_now = false,
          completed = false
      WHERE assigned_agent = ANY(${sessionUserIds}::integer[])
    `
    
    // Build and validate assignment plan
    let plan = null
    let validation = null
    const maxPlanRetries = 50
    let retryCount = 0
    
    while (retryCount < maxPlanRetries) {
      plan = await buildAssignmentPlan(sessionUserIds)
      validation = validateAssignmentPlan(plan, sessionUserIds)
      
      if (validation.valid) {
        break
      }
      
      retryCount++
      if (retryCount >= maxPlanRetries) {
        throw new Error(`Assignment plan invalid after ${maxPlanRetries} attempts: ${validation.errors.join(', ')}`)
      }
    }
    
    const totalMissions = plan.books.length + plan.passphrases.length + plan.objects.length
    
    // Execute plan
    await executeAssignmentPlan(plan, sessionUserIds, timestampValue)
    
    // Update timestamp BEFORE releasing lock
    await updateAssignmentTimestamp()
    
    return {
      success: true,
      assigned: totalMissions,
      usersAssigned: sessionUserIds.length
    }
  } catch (error) {
    console.error(`[${functionCallId}] Error in resetAndAssignAllMissions:`, error)
    throw error
  } finally {
    if (lockAcquired) {
      try {
        await sql`UPDATE assignment_timestamp SET currently_updating = false WHERE id = 1`
      } catch (clearError) {
        console.error(`[${functionCallId}] Error clearing currently_updating flag:`, clearError)
      }
    }
  }
}

// Assign missions to users (internal helper function)
export async function assignMissionsToSessionUsers(userIdsArray) {
  let lockAcquired = false
  try {
    const timestampBefore = await sql`
      SELECT last_assigned_at FROM assignment_timestamp WHERE id = 1
    `
    const timestampValue = timestampBefore.length > 0 ? timestampBefore[0].last_assigned_at : null
    
    // Build and validate assignment plan
    let plan = null
    let validation = null
    const maxRetries = 50
    let retryCount = 0
    
    while (retryCount < maxRetries) {
      plan = await buildAssignmentPlan(userIdsArray)
      validation = validateAssignmentPlan(plan, userIdsArray)
      
      if (validation.valid) {
        break
      }
      
      retryCount++
      if (retryCount >= maxRetries) {
        throw new Error(`Assignment plan invalid after ${maxRetries} attempts: ${validation.errors.join(', ')}`)
      }
    }
    
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
    
    if (lockResult.length === 0 || !lockResult[0].currently_updating) {
      return { success: false, assigned: 0 }
    }
    
    lockAcquired = true
    
    // Unassign all missions for selected users
    await sql`
      UPDATE book_missions
      SET assigned_red = NULL,
          assigned_blue = NULL,
          red_completed = false,
          blue_completed = false
      WHERE assigned_red = ANY(${userIdsArray}::integer[]) OR assigned_blue = ANY(${userIdsArray}::integer[])
    `
    
    await sql`
      UPDATE passphrase_missions
      SET assigned_receiver = NULL,
          assigned_sender_1 = NULL,
          assigned_sender_2 = NULL,
          completed = false
      WHERE assigned_receiver = ANY(${userIdsArray}::integer[]) 
         OR assigned_sender_1 = ANY(${userIdsArray}::integer[])
         OR assigned_sender_2 = ANY(${userIdsArray}::integer[])
    `
    
    await sql`
      UPDATE object_missions
      SET assigned_agent = NULL,
          assigned_now = false,
          completed = false
      WHERE assigned_agent = ANY(${userIdsArray}::integer[])
    `
    
    await executeAssignmentPlan(plan, userIdsArray, timestampValue)
    await updateAssignmentTimestamp()
    
    const totalMissions = plan.books.length + plan.passphrases.length + plan.objects.length
    return {
      success: true,
      usersAssigned: userIdsArray.length,
      missionsAssigned: totalMissions
    }
  } catch (error) {
    console.error('Error assigning missions to session users:', error)
    throw error
  } finally {
    if (lockAcquired) {
      try {
        await sql`UPDATE assignment_timestamp SET currently_updating = false WHERE id = 1`
      } catch (clearError) {
        console.error('Error clearing currently_updating flag:', clearError)
      }
    }
  }
}

// Get the last mission assignment timestamp
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

// Update the last mission assignment timestamp
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
