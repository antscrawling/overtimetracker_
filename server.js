const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const DB_PATH = path.join(ROOT_DIR, 'src', 'overtime.db');
const LEGACY_JSON = path.join(ROOT_DIR, 'src', 'mydata.json');
const CRITERIA_HOURS = 7;

app.use(express.json());
app.use('/static', express.static(FRONTEND_DIR));

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('MEETING', 'LEAVE')),
    title TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_hours REAL NOT NULL DEFAULT 0,
    leave_days REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_slot
  ON events(event_date, start_time, end_time)
  WHERE event_type = 'MEETING';
`);

const parseDate = (dateInput) => {
  const parts = String(dateInput || '').trim().split('-');
  if (parts.length !== 3) {
    throw new Error('Invalid date format. Use dd-mm-yyyy.');
  }

  const [dayRaw, monthRaw, yearRaw] = parts;
  let monthNum;
  if (/^\d+$/.test(monthRaw)) {
    monthNum = Number(monthRaw);
  } else {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const index = months.indexOf(monthRaw.toLowerCase());
    if (index === -1) {
      throw new Error('Unknown month. Use number or short month name.');
    }
    monthNum = index + 1;
  }

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const candidate = new Date(year, monthNum - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== monthNum - 1 ||
    candidate.getDate() !== day
  ) {
    throw new Error('Invalid date.');
  }

  return `${String(day).padStart(2, '0')}-${String(monthNum).padStart(2, '0')}-${String(year).padStart(4, '0')}`;
};

const parseTime = (timeInput) => {
  const match = /^([0-2]\d)\.([0-5]\d)$/.exec(String(timeInput || '').trim());
  if (!match) {
    throw new Error('Invalid time format. Use hh.mm.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23) {
    throw new Error('Invalid time format. Use hh.mm.');
  }

  return `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;
};

const timeToMinutes = (timeStr) => {
  const [hourStr, minuteStr] = String(timeStr).split('.');
  return Number(hourStr) * 60 + Number(minuteStr);
};

const rowToEvent = (row) => ({
  id: row.id,
  event_date: row.event_date,
  event_type: row.event_type,
  title: row.title,
  start_time: row.start_time,
  end_time: row.end_time,
  duration_hours: Number(row.duration_hours),
  leave_days: Number(row.leave_days),
  created_at: row.created_at,
});

const getSummary = () => {
  const totalMeetingHours = db.prepare(
    "SELECT COALESCE(SUM(duration_hours), 0) AS total FROM events WHERE event_type = 'MEETING'"
  ).get().total;
  const leaveDaysTaken = db.prepare(
    "SELECT COALESCE(SUM(leave_days), 0) AS total FROM events WHERE event_type = 'LEAVE'"
  ).get().total;
  const earnedLeaveDays = Math.floor(Number(totalMeetingHours) / CRITERIA_HOURS);
  const availableLeaveDays = earnedLeaveDays - Number(leaveDaysTaken);

  return {
    criteria_hours_per_leave_day: CRITERIA_HOURS,
    total_meeting_hours: Number(totalMeetingHours),
    earned_leave_days: Number(earnedLeaveDays),
    leave_days_taken: Number(leaveDaysTaken),
    available_leave_days: Number(availableLeaveDays),
  };
};

const hasMeetingOverlap = (meetingDate, startTime, endTime, excludeId = null) => {
  const query = excludeId === null
    ? `SELECT id, start_time, end_time FROM events WHERE event_type = 'MEETING' AND event_date = ?`
    : `SELECT id, start_time, end_time FROM events WHERE event_type = 'MEETING' AND event_date = ? AND id != ?`;

  const rows = excludeId === null
    ? db.prepare(query).all(meetingDate)
    : db.prepare(query).all(meetingDate, excludeId);

  const newStart = timeToMinutes(startTime);
  const newEnd = timeToMinutes(endTime);

  return rows.some((row) => {
    const existingStart = timeToMinutes(row.start_time);
    const existingEnd = timeToMinutes(row.end_time);
    return newStart < existingEnd && newEnd > existingStart;
  });
};

const initLegacyImport = () => {
  if (!fs.existsSync(LEGACY_JSON)) {
    return;
  }

  const count = db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  if (count > 0) {
    return;
  }

  try {
    const legacyData = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
    const insert = db.prepare(`
      INSERT INTO events(event_date, event_type, title, start_time, end_time, duration_hours, leave_days)
      VALUES (?, 'MEETING', ?, ?, ?, ?, 0)
    `);

    const transaction = db.transaction((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        const [eventDate, startTime, endTime] = key.split(':');
        if (!eventDate || !startTime || !endTime) {
          continue;
        }
        insert.run(eventDate, String(value.a || 'Meeting'), startTime, endTime, Number(value.b || 0));
      }
    });

    transaction(legacyData);
  } catch (error) {
    console.warn('Legacy data import skipped:', error.message);
  }
};

const listEvents = () => db.prepare(`
  SELECT id, event_date, event_type, title, start_time, end_time, duration_hours, leave_days, created_at
  FROM events
  ORDER BY substr(event_date, 7, 4), substr(event_date, 4, 2), substr(event_date, 1, 2), id
`).all().map(rowToEvent);

const getEvent = (id) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) {
    throw new Error('Event not found.');
  }
  return rowToEvent(row);
};

const createMeeting = ({ event_date, start_time, end_time, title }) => {
  const meetingDate = parseDate(event_date);
  const startTime = parseTime(start_time);
  const endTime = parseTime(end_time);

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new Error('End time must be later than start time.');
  }

  if (hasMeetingOverlap(meetingDate, startTime, endTime)) {
    throw new Error(`Meeting overlap detected for ${meetingDate} between ${startTime} and ${endTime}.`);
  }

  const duration = (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;
  const meetingTitle = String(title || 'Meeting').trim() || 'Meeting';
  const info = db.prepare(`
    INSERT INTO events(event_date, event_type, title, start_time, end_time, duration_hours, leave_days)
    VALUES (?, 'MEETING', ?, ?, ?, ?, 0)
  `).run(meetingDate, meetingTitle, startTime, endTime, duration);

  return getEvent(info.lastInsertRowid);
};

const createLeave = ({ event_date, leave_days }) => {
  const leaveDate = parseDate(event_date);
  const leaveDays = Number(leave_days);
  if (!Number.isFinite(leaveDays) || leaveDays <= 0) {
    throw new Error('Leave days must be greater than zero.');
  }

  const summary = getSummary();
  if (leaveDays > summary.available_leave_days) {
    throw new Error(`Insufficient leave balance. Available leave days: ${summary.available_leave_days.toFixed(2)}`);
  }

  const info = db.prepare(`
    INSERT INTO events(event_date, event_type, title, start_time, end_time, duration_hours, leave_days)
    VALUES (?, 'LEAVE', 'Leave in lieu', NULL, NULL, 0, ?)
  `).run(leaveDate, leaveDays);

  return getEvent(info.lastInsertRowid);
};

const updateMeeting = (id, body) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) {
    throw new Error('Event not found.');
  }
  if (row.event_type !== 'MEETING') {
    throw new Error('Selected event is not a meeting.');
  }

  const newDate = body.event_date != null ? parseDate(body.event_date) : row.event_date;
  const newStart = body.start_time != null ? parseTime(body.start_time) : row.start_time;
  const newEnd = body.end_time != null ? parseTime(body.end_time) : row.end_time;
  const newTitle = body.title != null ? String(body.title).trim() || 'Meeting' : row.title || 'Meeting';

  if (timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
    throw new Error('End time must be later than start time.');
  }

  if (hasMeetingOverlap(newDate, newStart, newEnd, id)) {
    throw new Error(`Meeting overlap detected for ${newDate} between ${newStart} and ${newEnd}.`);
  }

  const duration = (timeToMinutes(newEnd) - timeToMinutes(newStart)) / 60;
  db.prepare(`
    UPDATE events
    SET event_date = ?, title = ?, start_time = ?, end_time = ?, duration_hours = ?
    WHERE id = ?
  `).run(newDate, newTitle, newStart, newEnd, duration, id);

  return getEvent(id);
};

const updateLeave = (id, body) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) {
    throw new Error('Event not found.');
  }
  if (row.event_type !== 'LEAVE') {
    throw new Error('Selected event is not a leave record.');
  }

  const newDate = body.event_date != null ? parseDate(body.event_date) : row.event_date;
  const newDays = body.leave_days != null ? Number(body.leave_days) : Number(row.leave_days);
  if (!Number.isFinite(newDays) || newDays <= 0) {
    throw new Error('Leave days must be greater than zero.');
  }

  const summary = getSummary();
  const allowedMax = summary.available_leave_days + Number(row.leave_days);
  if (newDays > allowedMax) {
    throw new Error(`Insufficient leave balance. Max allowed for this update: ${allowedMax.toFixed(2)}`);
  }

  db.prepare('UPDATE events SET event_date = ?, leave_days = ? WHERE id = ?').run(newDate, newDays, id);
  return getEvent(id);
};

const deleteEvent = (id) => {
  const row = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
  if (!row) {
    throw new Error('Event not found.');
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
};

initLegacyImport();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.get('/events', (_req, res) => {
  res.json(listEvents());
});

app.get('/events/:id', (req, res) => {
  try {
    res.json(getEvent(Number(req.params.id)));
  } catch (error) {
    res.status(404).json({ detail: error.message });
  }
});

app.post('/events/meeting', (req, res) => {
  try {
    res.status(201).json(createMeeting(req.body || {}));
  } catch (error) {
    res.status(400).json({ detail: error.message });
  }
});

app.post('/events/leave', (req, res) => {
  try {
    res.status(201).json(createLeave(req.body || {}));
  } catch (error) {
    res.status(400).json({ detail: error.message });
  }
});

app.put('/events/:id/meeting', (req, res) => {
  try {
    res.json(updateMeeting(Number(req.params.id), req.body || {}));
  } catch (error) {
    const status = error.message === 'Event not found.' ? 404 : 400;
    res.status(status).json({ detail: error.message });
  }
});

app.put('/events/:id/leave', (req, res) => {
  try {
    res.json(updateLeave(Number(req.params.id), req.body || {}));
  } catch (error) {
    const status = error.message === 'Event not found.' ? 404 : 400;
    res.status(status).json({ detail: error.message });
  }
});

app.delete('/events/:id', (req, res) => {
  try {
    deleteEvent(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(404).json({ detail: error.message });
  }
});

app.get('/summary', (_req, res) => {
  res.json(getSummary());
});

const startServer = (port = PORT, host = '127.0.0.1') => {
  const server = app.listen(port, host, () => {
    console.log(`Overtime app running on http://${host}:${port}`);
  });
  return server;
};

if (require.main === module) {
  startServer(PORT, '127.0.0.1');
}

module.exports = { app, db, getSummary, listEvents, getEvent, startServer, PORT };