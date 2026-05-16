// Re-export all API functions from modular files
// This maintains backward compatibility while enabling tree-shaking

// Import from all modules
import * as users from './api/users.js';
import * as auth from './api/auth.js';
import * as sessions from './api/sessions.js';
import * as phaseMissions from './api/phaseMissions.js';

// Assemble the neonApi object with all functions
export const neonApi = {
  // Users
  getUsers: users.getUsers,
  getUserScore: users.getUserScore,
  createUser: users.createUser,
  
  // Auth
  logLogin: auth.logLogin,
  validateAlias: auth.validateAlias,
  authenticate: auth.authenticate,
  validateAdminName: auth.validateAdminName,
  authenticateAdmin: auth.authenticateAdmin,
  getLoginStats: auth.getLoginStats,
  
  // Sessions
  getAllSessions: sessions.getAllSessions,
  getActiveSession: sessions.getActiveSession,
  createSession: sessions.createSession,
  updateSession: sessions.updateSession,
  startSession: sessions.startSession,
  pauseSession: sessions.pauseSession,
  resumeSession: sessions.resumeSession,
  endSession: sessions.endSession,
  clearMissionsForNonSessionUsers: sessions.clearMissionsForNonSessionUsers,
  canAssignMissions: sessions.canAssignMissions,
  resetSession: sessions.resetSession,

  // Phase Missions
  createPhaseMission: phaseMissions.createPhaseMission,
  getPhaseMissions: phaseMissions.getPhaseMissions,
  updatePhaseMission: phaseMissions.updatePhaseMission,
  deletePhaseMission: phaseMissions.deletePhaseMission,
  assignPhaseToPlayers: phaseMissions.assignPhaseToPlayers,
  getPlayerMissions: phaseMissions.getPlayerMissions,
  getSessionParticipants: phaseMissions.getSessionParticipants,
  completePhaseMission: phaseMissions.completePhaseMission,
  signOffMission: phaseMissions.signOffMission,
  adminCompletePhaseMission: phaseMissions.adminCompletePhaseMission,
  getAllPlayerMissionsForSession: phaseMissions.getAllPlayerMissionsForSession,
  markBountyPaid: phaseMissions.markBountyPaid,

  // Sessions (new)
  advancePhase: sessions.advancePhase,
};
