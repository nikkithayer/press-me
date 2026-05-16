import { sql } from './db.js';

// Get all users
export async function getUsers() {
  try {
    const result = await sql`SELECT id, firstname, lastname, alias_1, alias_2, passphrase, ishere, is_admin FROM users ORDER BY firstname`;
    return result;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

// Create a new user
export async function createUser({ firstname, lastname, alias_1, alias_2, passphrase, is_admin = false }) {
  try {
    const result = await sql`
      INSERT INTO users (id, firstname, lastname, team, ishere, alias_1, alias_2, passphrase, is_admin, score)
      VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM users),
        ${firstname}, ${lastname}, 'none', true,
        ${alias_1}, ${alias_2}, ${passphrase},
        ${is_admin}, 0
      )
      RETURNING id, firstname, lastname, alias_1, alias_2, ishere, is_admin
    `
    return result[0]
  } catch (error) {
    console.error('Error creating user:', error)
    throw error
  }
}

// Get a user's passphrase by ID
export async function getUserPassphrase(userId) {
  try {
    const result = await sql`SELECT passphrase FROM users WHERE id = ${userId}`
    return result[0]?.passphrase || null
  } catch (error) {
    console.error('Error fetching user passphrase:', error)
    throw error
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

