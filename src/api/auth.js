import { sql } from './db.js';

// Log login attempt
export async function logLogin(agentName, success, ipAddress, userAgent) {
  try {
    const result = await sql`
      INSERT INTO login_logs (agent_name, success, ip_address, user_agent, timestamp) 
      VALUES (${agentName}, ${success}, ${ipAddress}, ${userAgent}, NOW()) RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error logging login attempt:', error);
    throw error;
  }
}

// Validate alias (check if it exists without requiring passphrase)
// ONLY accepts: "alias_1 alias_2" (with space, underscore, or concatenated) in that order
// Case-insensitive comparison
// Returns passphrase hint (all words except last word)
export async function validateAlias(alias) {
  try {
    // Check for alias_1 followed by alias_2 with space, underscore, or no separator (case-insensitive)
    const userResult = await sql`
      SELECT id, firstname, lastname, team, alias_1, alias_2, passphrase
      FROM users 
      WHERE (
        LOWER(alias_1 || ' ' || alias_2) = LOWER(${alias})
        OR LOWER(alias_1 || '_' || alias_2) = LOWER(${alias})
        OR LOWER(alias_1 || alias_2) = LOWER(${alias})
      ) AND ishere = true
    `;
    
    if (userResult.length === 0) {
      return { valid: false, message: 'Alias not found' };
    }
    
    // Get passphrase hint (all words except last word)
    const passphrase = userResult[0].passphrase || '';
    const passphraseWords = passphrase.trim().split(/\s+/);
    const passphraseHint = passphraseWords.length > 1 
      ? passphraseWords.slice(0, -1).join(' ')
      : '';
    
    return {
      valid: true,
      user: {
        alias_1: userResult[0].alias_1,
        alias_2: userResult[0].alias_2,
        codename: `${userResult[0].alias_1} ${userResult[0].alias_2}`
      },
      passphraseHint
    };
  } catch (error) {
    console.error('Error validating alias:', error);
    throw error;
  }
}

// Authentication
// ONLY accepts: "alias_1 alias_2" (with space, underscore, or concatenated) in that order
// Case-insensitive comparison
export async function authenticate(alias, passphrase, ipAddress, userAgent) {
  try {
    // Check for alias_1 followed by alias_2 with space, underscore, or no separator (case-insensitive)
    const userResult = await sql`
      SELECT id, firstname, lastname, team, alias_1, alias_2, passphrase
      FROM users 
      WHERE (
        LOWER(alias_1 || ' ' || alias_2) = LOWER(${alias})
        OR LOWER(alias_1 || '_' || alias_2) = LOWER(${alias})
        OR LOWER(alias_1 || alias_2) = LOWER(${alias})
      ) AND ishere = true
    `;
    
    if (userResult.length === 0) {
      // User not found
      await logLogin(alias, false, ipAddress, userAgent);
      return { success: false, message: 'Invalid credentials' };
    }
    
    const user = userResult[0];
    
    // Normalize passphrases (remove punctuation, lowercase, trim whitespace)
    const normalizePassphrase = (phrase) => {
      return phrase.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    };
    
    const storedPassphrase = normalizePassphrase(user.passphrase);
    const enteredPassphrase = normalizePassphrase(passphrase);
    
    // Get last word from stored passphrase
    const storedWords = storedPassphrase.split(/\s+/);
    const lastWord = storedWords.length > 0 ? storedWords[storedWords.length - 1] : '';
    
    // Check if entered passphrase matches full passphrase or just the last word
    if (enteredPassphrase === storedPassphrase || enteredPassphrase === lastWord) {
      // Passphrase correct
      await logLogin(alias, true, ipAddress, userAgent);
      return {
        success: true,
        message: 'Authentication successful',
        user: {
          id: user.id,
          firstname: user.firstname,
          lastname: user.lastname,
          team: user.team,
          alias_1: user.alias_1,
          alias_2: user.alias_2,
          codename: `${user.alias_1} ${user.alias_2}`
        }
      };
    } else {
      // Passphrase incorrect
      await logLogin(alias, false, ipAddress, userAgent);
      return { success: false, message: 'Invalid credentials' };
    }
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Get login statistics
export async function getLoginStats() {
  try {
    const result = await sql`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_logins,
        COUNT(CASE WHEN success = false THEN 1 END) as failed_attempts
      FROM login_logs
    `;
    return result[0];
  } catch (error) {
    console.error('Error fetching login stats:', error);
    throw error;
  }
}

