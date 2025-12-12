// Re-export all API functions from modular files
// This maintains backward compatibility while enabling tree-shaking

// Import from all modules
import * as users from './api/users.js';
import * as teams from './api/teams.js';
import * as auth from './api/auth.js';
import * as intel from './api/intel.js';
import * as missions from './api/missions.js';
import * as bookMissions from './api/bookMissions.js';
import * as passphraseMissions from './api/passphraseMissions.js';
import * as objectMissions from './api/objectMissions.js';
import * as sessions from './api/sessions.js';
import * as assignments from './api/assignments.js';
import * as voting from './api/voting.js';

// Assemble the neonApi object with all functions
export const neonApi = {
  // Users
  getUsers: users.getUsers,
  getRandomUser: users.getRandomUser,
  getUsersByTeam: users.getUsersByTeam,
  getRandomTeamMember: users.getRandomTeamMember,
  getUserScore: users.getUserScore,
  
  // Teams
  getTeamPoints: teams.getTeamPoints,
  updateTeamPoints: teams.updateTeamPoints,
  
  // Auth
  logLogin: auth.logLogin,
  validateAlias: auth.validateAlias,
  authenticate: auth.authenticate,
  getLoginStats: auth.getLoginStats,
  
  // Intel
  getIntel: intel.getIntel,
  getAgentIntel: intel.getAgentIntel,
  addIntel: intel.addIntel,
  clearAgentIntel: intel.clearAgentIntel,
  generateRandomIntel: intel.generateRandomIntel,
  
  // Missions (general)
  getMissions: missions.getMissions,
  getAvailableMissions: missions.getAvailableMissions,
  refreshMissions: missions.refreshMissions,
  assignMission: missions.assignMission,
  completeMission: missions.completeMission,
  getAllMissionsForAgent: missions.getAllMissionsForAgent,
  
  // Book Missions
  getBookMissionsForAgent: bookMissions.getBookMissionsForAgent,
  assignBookMissions: bookMissions.assignBookMissions,
  resetAndAssignBookMissions: bookMissions.resetAndAssignBookMissions,
  completeBookMission: bookMissions.completeBookMission,
  adminCompleteBookMission: bookMissions.adminCompleteBookMission,
  
  // Passphrase Missions
  getPassphraseMissionsForAgent: passphraseMissions.getPassphraseMissionsForAgent,
  assignPassphraseMissions: passphraseMissions.assignPassphraseMissions,
  completePassphraseMission: passphraseMissions.completePassphraseMission,
  adminCompletePassphraseMission: passphraseMissions.adminCompletePassphraseMission,
  
  // Object Missions
  getObjectMissionsForAgent: objectMissions.getObjectMissionsForAgent,
  assignObjectMissions: objectMissions.assignObjectMissions,
  completeObjectMission: objectMissions.completeObjectMission,
  adminCompleteObjectMission: objectMissions.adminCompleteObjectMission,
  
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
  openVoting: sessions.openVoting,
  closeVoting: sessions.closeVoting,
  
  // Assignments
  buildAssignmentPlan: assignments.buildAssignmentPlan,
  validateAssignmentPlan: assignments.validateAssignmentPlan,
  executeAssignmentPlan: assignments.executeAssignmentPlan,
  assignMissionsToSessionUsers: assignments.assignMissionsToSessionUsers,
  resetAndAssignAllMissions: assignments.resetAndAssignAllMissions,
  getLastAssignmentTimestamp: assignments.getLastAssignmentTimestamp,
  updateAssignmentTimestamp: assignments.updateAssignmentTimestamp,
  
  // Voting
  hasSubmittedIntel: voting.hasSubmittedIntel,
  submitIntel: voting.submitIntel,
};
