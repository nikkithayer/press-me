/**
 * Admin utility functions
 * Centralized helper for checking admin status
 */

/**
 * Check if a user is an admin
 * @param {Object} user - User object with is_admin property
 * @returns {boolean} - True if user is admin, false otherwise
 */
export function isAdmin(user) {
  if (!user) {
    return false;
  }
  
  // Check if user has is_admin property set to true
  return user.is_admin === true;
}
