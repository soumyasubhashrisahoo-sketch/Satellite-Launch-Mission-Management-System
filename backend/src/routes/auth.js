import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, signToken, wrap } from '../middleware/auth.js';

const r = Router();
// password verified inside PostgreSQL with pgcrypto - the hash never reaches Node
r.post('/login', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, role FROM users WHERE lower(email) = lower($1) AND password_hash = crypt($2, password_hash)`,
    [req.body.email || '', req.body.password || '']);
  if (!rows[0]) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: signToken(rows[0]), user: rows[0] });
}));
r.get('/me', authenticate, (req, res) => res.json(req.user));
export default r;
