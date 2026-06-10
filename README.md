# Overtime Tracker (Node.js)

This project is now a Node.js app using Express + SQLite storage (`src/overtime.db`).

The previous Python/FastAPI entrypoint has been removed. Use Node commands only.
 
## Rules Implemented

- Event types are `MEETING` and `LEAVE`.
- A meeting requires `event_date`, `start_time`, and `end_time`.
- Meeting duration is automatically computed from start/end time.
- Leave is earned at **1 day for every 7 meeting hours**.
- Earned leave days use floor logic:
	- `earned_leave_days = floor(total_meeting_hours / 7)`
- Leave cannot be taken beyond available balance.
  
## Run

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Build a macOS installer package:

```bash
npm run build:installer
```

This creates a package file in the dist folder, for example:

- raymond-overtime-1.0.0.pkg

Note: the installer runs npm install on the target machine during postinstall,
so internet access and Node.js/npm must be available there.

Build a Windows package (.zip):

```bash
npm run build:windows-package
```

This creates:

- raymond-overtime-1.0.0-windows.zip

The Windows zip includes:

- start.bat
- install_dependencies.bat
- backend, frontend, and SQLite data files

Build a Windows EXE installer (Electron/NSIS):

```bash
npm run build:windows-exe
```

Notes:

- Best run on Windows for native module compatibility.
- A ready-to-run CI workflow is included at .github/workflows/build-windows-exe.yml.
- Trigger it from GitHub Actions via Build Windows EXE (workflow_dispatch).

Auto-release Windows EXE on version tags:

- Workflow: .github/workflows/release-windows-exe.yml
- Trigger: push tags matching v*
- Result: creates or updates a GitHub Release and uploads dist/*.exe and dist/*.yml

Example tag flow:

1. git tag v1.0.1
2. git push origin v1.0.1

After installing, run the app from Terminal with:

```bash
raymond-overtime
```

Open the frontend in your browser at:

- `http://127.0.0.1:3000/`

Open docs:

- API health: `http://127.0.0.1:3000/health`

## License

MIT - see the LICENSE file.

## Endpoints

- `GET /health`
- `GET /events`
- `GET /events/{event_id}`
- `POST /events/meeting`
- `POST /events/leave`
- `PUT /events/{event_id}/meeting`
- `PUT /events/{event_id}/leave`
- `DELETE /events/{event_id}`
- `GET /summary`

## Request Examples

Create meeting:

```json
{
	"event_date": "07-06-2026",
	"start_time": "18.00",
	"end_time": "21.00",
	"title": "Project Sync"
}
```

Create leave:

```json
{
	"event_date": "08-06-2026",
	"leave_days": 1
}
```

