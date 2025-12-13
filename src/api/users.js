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

