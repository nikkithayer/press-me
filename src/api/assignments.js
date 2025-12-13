import { sql, pool } from './db.js';
import { getActiveSession } from './sessions.js';

// ============================================================================
// Helper Functions
// ============================================================================

// Get mission count for a user from assignment tracking
function getUserMissionCount(userId, userAssignments) {
  const assignments = userAssignments.get(userId) || { books: [], passphrases: [], objects: [] };
  return assignments.books.length + assignments.passphrases.length + assignments.objects.length;
}

// Get mission types a user has
function getUserMissionTypes(userId, userAssignments) {
  const assignments = userAssignments.get(userId) || { books: [], passphrases: [], objects: [] };
  const types = new Set();
  if (assignments.books.length > 0) types.add('book');
  if (assignments.passphrases.length > 0) types.add('passphrase');
  if (assignments.objects.length > 0) types.add('object');
  return types;
}

// Find an available book mission for a user
function findAvailableBookMission(userId, availableMissions, userAssignments, users, redUsers, blueUsers) {
  const userTeam = users.find(u => u.id === userId)?.team;
  if (!userTeam) return null;

  const filtered = availableMissions.filter(m => {
    const prevReds = Array.isArray(m.previous_reds) ? m.previous_reds : [];
    const prevBlues = Array.isArray(m.previous_blues) ? m.previous_blues : [];
    const userPrev = userTeam === 'red' ? prevReds : prevBlues;
    return !userPrev.includes(userId) && !m.assigned_red && !m.assigned_blue;
  });

  if (filtered.length === 0) return null;

  // Sort by previous assignments (prefer missions with fewer previous assignments)
  filtered.sort((a, b) => {
    const aPrev = (Array.isArray(a.previous_reds) ? a.previous_reds.length : 0) + 
                  (Array.isArray(a.previous_blues) ? a.previous_blues.length : 0);
    const bPrev = (Array.isArray(b.previous_reds) ? b.previous_reds.length : 0) + 
                  (Array.isArray(b.previous_blues) ? b.previous_blues.length : 0);
    return aPrev - bPrev;
  });

  const partnerTeam = userTeam === 'red' ? 'blue' : 'red';
  const partnerPool = partnerTeam === 'red' ? redUsers : blueUsers;

  for (const mission of filtered) {
    const partnerPrev = userTeam === 'red' 
      ? (Array.isArray(mission.previous_blues) ? mission.previous_blues : [])
      : (Array.isArray(mission.previous_reds) ? mission.previous_reds : []);

    const availablePartners = partnerPool
      .map(partnerId => ({ partnerId, total: getUserMissionCount(partnerId, userAssignments) }))
      .filter(p => p.total < 3 && !partnerPrev.includes(p.partnerId))
      .sort((a, b) => a.total - b.total);

    if (availablePartners.length > 0) {
      return {
        mission,
        partnerId: availablePartners[0].partnerId
      };
    }
  }

  return null;
}

// Find an available passphrase mission for a user (as receiver)
function findAvailablePassphraseMission(userId, availableMissions, userAssignments, allUsers) {
  const filtered = availableMissions.filter(m => {
    const prevReceivers = Array.isArray(m.previous_receivers) ? m.previous_receivers : [];
    const prevSenders = Array.isArray(m.previous_senders) ? m.previous_senders : [];
    return !prevReceivers.includes(userId) && !prevSenders.includes(userId) &&
           !m.assigned_receiver && !m.assigned_sender_1 && !m.assigned_sender_2;
  });

  if (filtered.length === 0) return null;

  // Sort by previous assignments
  filtered.sort((a, b) => {
    const aPrev = (Array.isArray(a.previous_receivers) ? a.previous_receivers.length : 0) + 
                  (Array.isArray(a.previous_senders) ? a.previous_senders.length : 0);
    const bPrev = (Array.isArray(b.previous_receivers) ? b.previous_receivers.length : 0) + 
                  (Array.isArray(b.previous_senders) ? b.previous_senders.length : 0);
    return aPrev - bPrev;
  });

  for (const mission of filtered) {
    const prevReceivers = Array.isArray(mission.previous_receivers) ? mission.previous_receivers : [];
    const prevSenders = Array.isArray(mission.previous_senders) ? mission.previous_senders : [];

    const availableSenders = allUsers
      .map(senderId => ({ senderId, total: getUserMissionCount(senderId, userAssignments) }))
      .filter(p => p.senderId !== userId && p.total < 3 &&
                   !prevReceivers.includes(p.senderId) && !prevSenders.includes(p.senderId))
      .sort((a, b) => a.total - b.total);

    if (availableSenders.length >= 2) {
      return {
        mission,
        sender1Id: availableSenders[0].senderId,
        sender2Id: availableSenders[1].senderId
      };
    }
  }

  return null;
}

// Find an available object mission for a user
function findAvailableObjectMission(userId, availableMissions, userAssignments) {
  const filtered = availableMissions.filter(m => {
    const prev = Array.isArray(m.past_assigned_agents) ? m.past_assigned_agents : [];
    return !prev.includes(userId) && !m.assigned_agent;
  });

  if (filtered.length === 0) return null;

  // Sort by previous assignments
  filtered.sort((a, b) => {
    const aPrev = Array.isArray(a.past_assigned_agents) ? a.past_assigned_agents.length : 0;
    const bPrev = Array.isArray(b.past_assigned_agents) ? b.past_assigned_agents.length : 0;
    return aPrev - bPrev;
  });

  return { mission: filtered[0] };
}

// ============================================================================
// Assignment Plan Builder
// ============================================================================

export async function buildAssignmentPlan(userIdsArray) {
  // Get users with their teams
  const users = await sql`
    SELECT id, team FROM users WHERE id = ANY(${userIdsArray}::integer[]) AND ishere = true
  `;

  if (users.length === 0) {
    throw new Error('No valid users selected');
  }

  const redUsers = users.filter(u => u.team === 'red').map(u => u.id);
  const blueUsers = users.filter(u => u.team === 'blue').map(u => u.id);
  const allUsers = users.map(u => u.id);

  // Load all available missions (exclude completed ones)
  const bookMissions = await sql`
    SELECT id, previous_reds, previous_blues FROM book_missions 
    WHERE assigned_red IS NULL AND assigned_blue IS NULL
      AND red_completed = false AND blue_completed = false
    ORDER BY id
  `;

  const passphraseMissions = await sql`
    SELECT id, previous_receivers, previous_senders FROM passphrase_missions
    WHERE assigned_receiver IS NULL AND assigned_sender_1 IS NULL AND assigned_sender_2 IS NULL
      AND completed = false
    ORDER BY id
  `;

  const objectMissions = await sql`
    SELECT id, past_assigned_agents FROM object_missions
    WHERE assigned_agent IS NULL AND completed = false
    ORDER BY id
  `;

  // Track assignments per user
  const userAssignments = new Map();
  allUsers.forEach(userId => {
    userAssignments.set(userId, { books: [], passphrases: [], objects: [] });
  });

  // Track which missions have been assigned in this plan
  const assignedBookMissions = new Set();
  const assignedPassphraseMissions = new Set();
  const assignedObjectMissions = new Set();

  // Phase 1 & 2: Assign first 2 missions (prioritize passphrase + book)
  for (const userId of allUsers) {
    if (getUserMissionCount(userId, userAssignments) >= 2) continue;

    const assignments = userAssignments.get(userId);
    const hasPassphrase = assignments.passphrases.length > 0;
    const hasBook = assignments.books.length > 0;

    // Try passphrase first (as receiver) if user doesn't have one yet
    if (!hasPassphrase) {
      const passphraseResult = findAvailablePassphraseMission(
        userId,
        passphraseMissions.filter(m => !assignedPassphraseMissions.has(m.id)),
        userAssignments,
        allUsers
      );

      if (passphraseResult) {
        const { mission, sender1Id, sender2Id } = passphraseResult;
        const sender1Assignments = userAssignments.get(sender1Id);
        const sender2Assignments = userAssignments.get(sender2Id);

        assignments.passphrases.push({ missionId: mission.id, sender1Id, sender2Id });
        sender1Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true });
        sender2Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true });
        mission.assigned_receiver = userId;
        mission.assigned_sender_1 = sender1Id;
        mission.assigned_sender_2 = sender2Id;
        assignedPassphraseMissions.add(mission.id);
      }
    }

    // Try book mission if user doesn't have one yet and still needs missions
    if (getUserMissionCount(userId, userAssignments) < 2 && !hasBook) {
      const bookResult = findAvailableBookMission(
        userId,
        bookMissions.filter(m => !assignedBookMissions.has(m.id)),
        userAssignments,
        users,
        redUsers,
        blueUsers
      );

      if (bookResult) {
        const { mission, partnerId } = bookResult;
        const userTeam = users.find(u => u.id === userId)?.team;
        const partnerAssignments = userAssignments.get(partnerId);

        assignments.books.push({ missionId: mission.id, partnerId });
        partnerAssignments.books.push({ missionId: mission.id, partnerId: userId });
        mission.assigned_red = userTeam === 'red' ? userId : partnerId;
        mission.assigned_blue = userTeam === 'blue' ? userId : partnerId;
        assignedBookMissions.add(mission.id);
      }
    }

    // If still missing missions, try object mission as fallback
    if (getUserMissionCount(userId, userAssignments) < 2) {
      const objectResult = findAvailableObjectMission(
        userId,
        objectMissions.filter(m => !assignedObjectMissions.has(m.id)),
        userAssignments
      );

      if (objectResult) {
        const { mission } = objectResult;
        assignments.objects.push({ missionId: mission.id });
        mission.assigned_agent = userId;
        assignedObjectMissions.add(mission.id);
      }
    }
  }

  // Phase 3: Assign third mission (any type, prioritize diversity)
  for (const userId of allUsers) {
    if (getUserMissionCount(userId, userAssignments) >= 3) continue;

    const assignments = userAssignments.get(userId);
    const userTypes = getUserMissionTypes(userId, userAssignments);
    const bookCount = assignments.books.length;
    const passphraseCount = assignments.passphrases.length;
    let assigned = false;

    // Try missing types first
    if (!userTypes.has('passphrase')) {
      const passphraseResult = findAvailablePassphraseMission(
        userId,
        passphraseMissions.filter(m => !assignedPassphraseMissions.has(m.id)),
        userAssignments,
        allUsers
      );

      if (passphraseResult) {
        const { mission, sender1Id, sender2Id } = passphraseResult;
        const sender1Assignments = userAssignments.get(sender1Id);
        const sender2Assignments = userAssignments.get(sender2Id);

        assignments.passphrases.push({ missionId: mission.id, sender1Id, sender2Id });
        sender1Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true });
        sender2Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true });
        mission.assigned_receiver = userId;
        mission.assigned_sender_1 = sender1Id;
        mission.assigned_sender_2 = sender2Id;
        assignedPassphraseMissions.add(mission.id);
        assigned = true;
      }
    }

    if (!assigned && !userTypes.has('book')) {
      const bookResult = findAvailableBookMission(
        userId,
        bookMissions.filter(m => !assignedBookMissions.has(m.id)),
        userAssignments,
        users,
        redUsers,
        blueUsers
      );

      if (bookResult) {
        const { mission, partnerId } = bookResult;
        const userTeam = users.find(u => u.id === userId)?.team;
        const partnerAssignments = userAssignments.get(partnerId);

        assignments.books.push({ missionId: mission.id, partnerId });
        partnerAssignments.books.push({ missionId: mission.id, partnerId: userId });
        mission.assigned_red = userTeam === 'red' ? userId : partnerId;
        mission.assigned_blue = userTeam === 'blue' ? userId : partnerId;
        assignedBookMissions.add(mission.id);
        assigned = true;
      }
    }

    // Fallback: if user already has 2 of a type, prioritize object missions
    if (!assigned) {
      if (bookCount >= 2 || passphraseCount >= 2) {
        const objectResult = findAvailableObjectMission(
          userId,
          objectMissions.filter(m => !assignedObjectMissions.has(m.id)),
          userAssignments
        );

        if (objectResult) {
          const { mission } = objectResult;
          assignments.objects.push({ missionId: mission.id });
          mission.assigned_agent = userId;
          assignedObjectMissions.add(mission.id);
          assigned = true;
        }
      }
      
      // If still not assigned, try passphrase or book (but not if user already has 2)
      if (!assigned) {
        if (passphraseCount < 2) {
          const passphraseResult = findAvailablePassphraseMission(
            userId,
            passphraseMissions.filter(m => !assignedPassphraseMissions.has(m.id)),
            userAssignments,
            allUsers
          );

          if (passphraseResult) {
            const { mission, sender1Id, sender2Id } = passphraseResult;
            const sender1Assignments = userAssignments.get(sender1Id);
            const sender2Assignments = userAssignments.get(sender2Id);

            assignments.passphrases.push({ missionId: mission.id, sender1Id, sender2Id });
            sender1Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true });
            sender2Assignments.passphrases.push({ missionId: mission.id, receiverId: userId, isSender: true });
            mission.assigned_receiver = userId;
            mission.assigned_sender_1 = sender1Id;
            mission.assigned_sender_2 = sender2Id;
            assignedPassphraseMissions.add(mission.id);
            assigned = true;
          }
        }
        
        if (!assigned && bookCount < 2) {
          const bookResult = findAvailableBookMission(
            userId,
            bookMissions.filter(m => !assignedBookMissions.has(m.id)),
            userAssignments,
            users,
            redUsers,
            blueUsers
          );

          if (bookResult) {
            const { mission, partnerId } = bookResult;
            const userTeam = users.find(u => u.id === userId)?.team;
            const partnerAssignments = userAssignments.get(partnerId);

            assignments.books.push({ missionId: mission.id, partnerId });
            partnerAssignments.books.push({ missionId: mission.id, partnerId: userId });
            mission.assigned_red = userTeam === 'red' ? userId : partnerId;
            mission.assigned_blue = userTeam === 'blue' ? userId : partnerId;
            assignedBookMissions.add(mission.id);
            assigned = true;
          }
        }
        
        // Last resort: object mission
        if (!assigned) {
          const objectResult = findAvailableObjectMission(
            userId,
            objectMissions.filter(m => !assignedObjectMissions.has(m.id)),
            userAssignments
          );

          if (objectResult) {
            const { mission } = objectResult;
            assignments.objects.push({ missionId: mission.id });
            mission.assigned_agent = userId;
            assignedObjectMissions.add(mission.id);
            assigned = true;
          }
        }
      }
    }
  }

  // Build final plan structure
  const plan = {
    books: [],
    passphrases: [],
    objects: []
  };

  // Collect book assignments (avoid duplicates)
  const bookAssignmentsSet = new Set();
  for (const [userId, assignments] of userAssignments) {
    for (const book of assignments.books) {
      const key = `${book.missionId}`;
      if (!bookAssignmentsSet.has(key)) {
        const userTeam = users.find(u => u.id === userId)?.team;
        plan.books.push({
          missionId: book.missionId,
          redUserId: userTeam === 'red' ? userId : book.partnerId,
          blueUserId: userTeam === 'blue' ? userId : book.partnerId
        });
        bookAssignmentsSet.add(key);
      }
    }
  }

  // Collect passphrase assignments (avoid duplicates)
  const passphraseAssignmentsSet = new Set();
  for (const [userId, assignments] of userAssignments) {
    for (const passphrase of assignments.passphrases) {
      if (!passphrase.isSender) {
        const key = `${passphrase.missionId}`;
        if (!passphraseAssignmentsSet.has(key)) {
          plan.passphrases.push({
            missionId: passphrase.missionId,
            receiverId: userId,
            sender1Id: passphrase.sender1Id,
            sender2Id: passphrase.sender2Id
          });
          passphraseAssignmentsSet.add(key);
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
      });
    }
  }

  return plan;
}

// ============================================================================
// Validation
// ============================================================================

export function validateAssignmentPlan(plan, userIdsArray) {
  const errors = [];
  const userStats = new Map();

  userIdsArray.forEach(userId => {
    userStats.set(userId, { count: 0, types: new Set() });
  });

  // Count assignments
  for (const book of plan.books) {
    if (book.redUserId) {
      const stats = userStats.get(book.redUserId);
      if (stats) {
        stats.count++;
        stats.types.add('book');
      }
    }
    if (book.blueUserId) {
      const stats = userStats.get(book.blueUserId);
      if (stats) {
        stats.count++;
        stats.types.add('book');
      }
    }
  }

  for (const passphrase of plan.passphrases) {
    if (passphrase.receiverId) {
      const stats = userStats.get(passphrase.receiverId);
      if (stats) {
        stats.count++;
        stats.types.add('passphrase');
      }
    }
    if (passphrase.sender1Id) {
      const stats = userStats.get(passphrase.sender1Id);
      if (stats) {
        stats.count++;
        stats.types.add('passphrase');
      }
    }
    if (passphrase.sender2Id) {
      const stats = userStats.get(passphrase.sender2Id);
      if (stats) {
        stats.count++;
        stats.types.add('passphrase');
      }
    }
  }

  for (const object of plan.objects) {
    if (object.agentId) {
      const stats = userStats.get(object.agentId);
      if (stats) {
        stats.count++;
        stats.types.add('object');
      }
    }
  }

  // Validate counts
  for (const userId of userIdsArray) {
    const stats = userStats.get(userId);
    if (!stats) continue;

    if (stats.count !== 3) {
      errors.push(`User ${userId} has ${stats.count} missions (expected 3)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// Execution
// ============================================================================

export async function executeAssignmentPlan(client, plan, userIdsArray) {
  // Unassign missions first
  await client.query({
    text: `
      UPDATE book_missions
      SET assigned_red = NULL,
          assigned_blue = NULL,
          red_completed = false,
          blue_completed = false
      WHERE assigned_red = ANY($1::integer[]) OR assigned_blue = ANY($1::integer[])
    `,
    values: [userIdsArray]
  });

  await client.query({
    text: `
      UPDATE passphrase_missions
      SET assigned_receiver = NULL,
          assigned_sender_1 = NULL,
          assigned_sender_2 = NULL,
          completed = false
      WHERE assigned_receiver = ANY($1::integer[]) 
         OR assigned_sender_1 = ANY($1::integer[])
         OR assigned_sender_2 = ANY($1::integer[])
    `,
    values: [userIdsArray]
  });

  await client.query({
    text: `
      UPDATE object_missions
      SET assigned_agent = NULL,
          assigned_now = false,
          completed = false
      WHERE assigned_agent = ANY($1::integer[])
    `,
    values: [userIdsArray]
  });

  // Execute all book assignments atomically using CTE
  if (plan.books.length > 0) {
    const bookValues = plan.books.map(book => 
      `(${book.missionId}::integer, ${book.redUserId}::integer, ${book.blueUserId}::integer)`
    ).join(', ');

    await client.query(`
      WITH assignment_plan AS (
        SELECT * FROM (VALUES ${bookValues}) AS t(mission_id, red_user_id, blue_user_id)
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
      RETURNING book_missions.id
    `);
  }

  // Execute all passphrase assignments atomically using CTE
  if (plan.passphrases.length > 0) {
    const passphraseValues = plan.passphrases.map(p => 
      `(${p.missionId}::integer, ${p.receiverId}::integer, ${p.sender1Id}::integer, ${p.sender2Id}::integer)`
    ).join(', ');

    await client.query(`
      WITH assignment_plan AS (
        SELECT * FROM (VALUES ${passphraseValues}) AS t(mission_id, receiver_id, sender1_id, sender2_id)
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
      RETURNING passphrase_missions.id
    `);
  }

  // Execute all object assignments atomically using CTE
  if (plan.objects.length > 0) {
    const objectValues = plan.objects.map(obj => 
      `(${obj.missionId}::integer, ${obj.agentId}::integer)`
    ).join(', ');

    await client.query(`
      WITH assignment_plan AS (
        SELECT * FROM (VALUES ${objectValues}) AS t(mission_id, agent_id)
      )
      UPDATE object_missions
      SET assigned_agent = assignment_plan.agent_id,
          past_assigned_agents = array_append(COALESCE(object_missions.past_assigned_agents, ARRAY[]::integer[]), assignment_plan.agent_id),
          assigned_now = true
      FROM assignment_plan
      WHERE object_missions.id = assignment_plan.mission_id
        AND object_missions.assigned_agent IS NULL
      RETURNING object_missions.id
    `);
  }

  // Update timestamp
  await client.query(
    'UPDATE assignment_timestamp SET last_assigned_at = NOW() WHERE id = 1'
  );
}

// ============================================================================
// Main Assignment Functions
// ============================================================================

export async function assignMissionsToSessionUsers(userIdsArray) {
  try {
    // Build and validate assignment plan
    const plan = await buildAssignmentPlan(userIdsArray);
    const validation = validateAssignmentPlan(plan, userIdsArray);

    if (!validation.valid) {
      throw new Error(`Assignment plan invalid: ${validation.errors.join(', ')}`);
    }

    const totalMissions = plan.books.length + plan.passphrases.length + plan.objects.length;

    // Execute within transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await executeAssignmentPlan(client, plan, userIdsArray);
      await client.query('COMMIT');

      return {
        success: true,
        assigned: totalMissions,
        usersAssigned: userIdsArray.length,
        missionsAssigned: totalMissions
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error assigning missions:', error);
    return {
      success: false,
      assigned: 0,
      reason: error.message
    };
  }
}

export async function resetAndAssignAllMissions() {
  const activeSession = await getActiveSession();
  if (!activeSession) {
    throw new Error('No active session. Cannot assign missions.');
  }
  const userIdsArray = activeSession.participant_user_ids || [];
  if (userIdsArray.length === 0) {
    throw new Error('No participants in active session');
  }
  return await assignMissionsToSessionUsers(userIdsArray);
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
    `;

    if (result.length === 0) {
      return null;
    }

    const timestamp = result[0].last_assigned_at;
    return timestamp instanceof Date ? timestamp : new Date(timestamp);
  } catch (error) {
    return null;
  }
}

export async function updateAssignmentTimestamp() {
  try {
    await sql`
      INSERT INTO assignment_timestamp (id, last_assigned_at)
      VALUES (1, NOW())
      ON CONFLICT (id) 
      DO UPDATE SET last_assigned_at = NOW()
    `;
    return true;
  } catch (error) {
    throw error;
  }
}
