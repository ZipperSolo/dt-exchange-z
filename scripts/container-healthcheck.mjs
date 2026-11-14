#!/usr/bin/env node
// Container healthcheck for the dt-exchange notifier.
//
// The server has no listening port, so there is nothing to connect to. A
// successful poll is silent: saveSeen() rewrites the state file after the
// summary and every storefront fetch succeed. A state file whose mtime keeps
// advancing is therefore the liveness signal (same evidence the runbook uses).
import fs from "node:fs"
import path from "node:path"

const configPath = process.env["CONFIG_FILE"] ?? "server.config.json"

let config = {}
try {
	config = JSON.parse(fs.readFileSync(configPath, "utf8"))
} catch {
	// Unreadable config: the server would have exited, so report unhealthy and
	// let the container restart policy handle it.
	console.error(`unhealthy: cannot read ${configPath}`)
	process.exit(1)
}

const stateFile = config.stateFile ?? "seen.json"
const statePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
const pollMs = config.pollIntervalMs ?? 60_000
// Three missed polls (plus slack for slow storefront responses) is stale.
const maxAgeMs = Math.max(pollMs * 3, 180_000)
const graceMs = Number(process.env["HEALTHCHECK_GRACE_SEC"] ?? 180) * 1000

function fileAgeMs(file) {
	try {
		return Date.now() - fs.statSync(file).mtimeMs
	} catch {
		return null
	}
}

// Age of the process the container runs, from /proc: uptime minus starttime.
// Keeps a freshly started container healthy before its first successful poll.
function processAgeMs() {
	try {
		const uptime = Number.parseFloat(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0])
		const stat = fs.readFileSync("/proc/1/stat", "utf8")
		const startTicks = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19])
		return Math.max(0, (uptime - startTicks / 100) * 1000)
	} catch {
		return Number.POSITIVE_INFINITY
	}
}

const stateAge = fileAgeMs(statePath)
if (stateAge !== null && stateAge <= maxAgeMs) {
	console.log(`ok: state updated ${Math.round(stateAge / 1000)}s ago`)
	process.exit(0)
}

const running = processAgeMs()
if (running < graceMs) {
	console.log(`ok: starting (${Math.round(running / 1000)}s, grace ${graceMs / 1000}s)`)
	process.exit(0)
}

console.log(
	`unhealthy: ${statePath} ${stateAge === null ? "missing" : `stale for ${Math.round(stateAge / 1000)}s`} (max ${Math.round(maxAgeMs / 1000)}s)`,
)
process.exit(1)
