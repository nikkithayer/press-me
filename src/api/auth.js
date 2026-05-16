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
      SELECT id, firstname, lastname, alias_1, alias_2, passphrase, is_admin
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
      SELECT id, firstname, lastname, alias_1, alias_2, passphrase, is_admin
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
          alias_1: user.alias_1,
          alias_2: user.alias_2,
          codename: `${user.alias_1} ${user.alias_2}`,
          is_admin: user.is_admin || false
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

// Validate admin name (check if it exists without requiring passphrase)
// Accepts: "firstname lastname" (case-insensitive)
// Only returns valid if user is an admin
// Returns passphrase hint (all words except last word)
export async function validateAdminName(name) {
  try {
    // Split name into firstname and lastname
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length < 2) {
      return { valid: false, message: 'Please enter your full name (first and last)' };
    }
    
    const firstname = nameParts[0];
    const lastname = nameParts.slice(1).join(' '); // Handle multi-word last names
    
    // Check for firstname and lastname (case-insensitive) and ensure user is admin
    const userResult = await sql`
      SELECT id, firstname, lastname, alias_1, alias_2, passphrase, is_admin
      FROM users 
      WHERE LOWER(firstname) = LOWER(${firstname})
        AND LOWER(lastname) = LOWER(${lastname})
        AND ishere = true
        AND is_admin = true
    `;
    
    if (userResult.length === 0) {
      return { valid: false, message: 'Admin not found' };
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
        firstname: userResult[0].firstname,
        lastname: userResult[0].lastname,
        alias_1: userResult[0].alias_1,
        alias_2: userResult[0].alias_2,
        codename: `${userResult[0].alias_1} ${userResult[0].alias_2}`
      },
      passphraseHint
    };
  } catch (error) {
    console.error('Error validating admin name:', error);
    throw error;
  }
}

// Admin authentication by real name
// Accepts: "firstname lastname" (case-insensitive)
// Only authenticates if user is an admin
export async function authenticateAdmin(name, passphrase, ipAddress, userAgent) {
  try {
    // Split name into firstname and lastname
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length < 2) {
      await logLogin(name, false, ipAddress, userAgent);
      return { success: false, message: 'Please enter your full name (first and last)' };
    }
    
    const firstname = nameParts[0];
    const lastname = nameParts.slice(1).join(' '); // Handle multi-word last names
    
    // Check for firstname and lastname (case-insensitive) and ensure user is admin
    const userResult = await sql`
      SELECT id, firstname, lastname, alias_1, alias_2, passphrase, is_admin
      FROM users 
      WHERE LOWER(firstname) = LOWER(${firstname})
        AND LOWER(lastname) = LOWER(${lastname})
        AND ishere = true
        AND is_admin = true
    `;
    
    if (userResult.length === 0) {
      // User not found or not an admin
      await logLogin(name, false, ipAddress, userAgent);
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
      await logLogin(name, true, ipAddress, userAgent);
      return {
        success: true,
        message: 'Authentication successful',
        user: {
          id: user.id,
          firstname: user.firstname,
          lastname: user.lastname,
          alias_1: user.alias_1,
          alias_2: user.alias_2,
          codename: `${user.alias_1} ${user.alias_2}`,
          is_admin: user.is_admin || false
        }
      };
    } else {
      // Passphrase incorrect
      await logLogin(name, false, ipAddress, userAgent);
      return { success: false, message: 'Invalid credentials' };
    }
  } catch (error) {
    console.error('Admin authentication error:', error);
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

