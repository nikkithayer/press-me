import { sql } from './db.js';

// Get team points
export async function getTeamPoints(team) {
  try {
    const result = await sql`SELECT points FROM teams WHERE name = $1`;
    return result[0] || { points: 0 };
  } catch (error) {
    console.error('Error fetching team points:', error);
    throw error;
  }
}

// Update team points
export async function updateTeamPoints(team, points) {
  try {
    const result = await sql`UPDATE teams SET points = $1 WHERE name = $2 RETURNING *`;
    return result[0];
  } catch (error) {
    console.error('Error updating team points:', error);
    throw error;
  }
}

