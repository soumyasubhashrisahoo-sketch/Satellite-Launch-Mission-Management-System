import jwt from 'jsonwebtoken';

export const signToken = (u) =>
  jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
export const verifyToken = (t) => jwt.verify(t, process.env.JWT_SECRET);

export function authenticate(req, res, next) {
  try { req.user = verifyToken((req.headers.authorization || '').replace('Bearer ', '')); next(); }
  catch { res.status(401).json({ error: 'Not authenticated' }); }
}
// application-level gate (the database enforces the same rule again through GRANTs)
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });

export const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function errorHandler(err, req, res, _next) {
  const map = { '42501': 403, '23505': 409, '23503': 409, '23514': 400, '23502': 400, '22P02': 400, '22007': 400, '22023': 400, 'P0001': 400 };
  const status = map[err.code] || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: err.code === '42501' ? 'Permission denied for your database role' : err.code === '23505' ? (err.detail || err.message) : err.message,
    code: err.code,
  });
}
