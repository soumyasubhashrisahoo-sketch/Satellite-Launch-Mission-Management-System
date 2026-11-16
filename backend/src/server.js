import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { authenticate, errorHandler } from './middleware/auth.js';
import auth from './routes/auth.js';
import dashboard from './routes/dashboard.js';
import satellites from './routes/satellites.js';
import launches from './routes/launches.js';
import missions from './routes/missions.js';
import command from './routes/command.js';


import { groundStations, alerts, telemetry } from './routes/misc.js';
import { attachRealtime } from './realtime.js';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api/dashboard', authenticate, dashboard);
app.use('/api/satellites', authenticate, satellites);
app.use('/api/launches', authenticate, launches);
app.use('/api/missions', authenticate, missions);
app.use('/api/ground-stations', authenticate, groundStations);
app.use('/api/alerts', authenticate, alerts);
app.use('/api/telemetry', authenticate, telemetry);
app.use('/api/command-center', authenticate, command);
app.use(errorHandler);

const server = http.createServer(app);
attachRealtime(server);
const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`OrbitalOps API on http://localhost:${port}`));
