import { sql } from './db.js';

// Get all users
export async function getUsers() {
  try {
    const result = await sql`SELECT id, firstname, lastname, team, alias_1, alias_2, ishere FROM users ORDER BY firstname`;
    return result;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

// Get random user alias
export async function getRandomUser() {
  try {
    const result = await sql`SELECT alias_1, alias_2 FROM users WHERE ishere = true ORDER BY RANDOM() LIMIT 1`;
    const user = result[0];
    if (user) {
      return {
        codename: `${user.alias_1} ${user.alias_2}`,
        alias_1: user.alias_1,
        alias_2: user.alias_2
      };
    } else {
      return { codename: 'AGENT', alias_1: 'Unknown', alias_2: 'Agent' };
    }
  } catch (error) {
    console.error('Error fetching random user:', error);
    throw error;
  }
}

// Get users by team
export async function getUsersByTeam(team) {
  try {
    const result = await sql`SELECT id, firstname, lastname, team, alias_1, alias_2 FROM users WHERE team = $1 AND ishere = true ORDER BY firstname`;
    return result;
  } catch (error) {
    console.error('Error fetching users by team:', error);
    throw error;
  }
}

// Get random team member
export async function getRandomTeamMember(team) {
  try {
    if (!['red', 'blue'].includes(team)) {
      throw new Error('Team must be "red" or "blue"');
    }
    
    const result = await sql`SELECT firstname, lastname, alias_1, alias_2 FROM users WHERE team = $1 AND ishere = true ORDER BY RANDOM() LIMIT 1`;
    
    if (result.length === 0) {
      throw new Error(`No users found for team ${team}`);
    }
    
    const user = result[0];
    return {
      firstname: user.firstname,
      lastname: user.lastname,
      alias_1: user.alias_1,
      alias_2: user.alias_2,
      codename: `${user.alias_1} ${user.alias_2}`
    };
  } catch (error) {
    console.error('Error fetching random team member:', error);
    throw error;
  }
}

// Get user score
export async function getUserScore(userId) {
  try {
    const result = await sql`
      SELECT COALESCE(score, 0) as score FROM users WHERE id = ${userId}
    `
    return result[0]?.score || 0
  } catch (error) {
    console.error('Error fetching user score:', error)
    throw error
  }
}

