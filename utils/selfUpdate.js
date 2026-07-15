/**
 * selfUpdate.js
 * ----------------------------------------------------------------------
 * Client side of the bot's self/auto-update system. Talks to a
 * user-hosted "update API" (URL configured via the UPDATE_API_URL
 * environment variable, or global.config.UPDATE_API_URL as a fallback).
 *
 * See /update.md at the project root for the full protocol this module
 * implements (request/response shape, checksum requirement, auth header).
 *
 * Nothing here is invented ad hoc — every request/response field this
 * file reads or sends is documented in update.md so a matching backend
 * can be built against that spec.
 * ----------------------------------------------------------------------
 */

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");
const extractZip = require("extract-zip");

const ROOT_DIR = path.join(__dirname, "..");
const CURRENT_VERSION = require(path.join(ROOT_DIR, "package.json")).version;

// Files/folders that must never be touched by an update — local secrets,
// runtime state, and dependencies are never shipped inside an update
// package and must survive it untouched.
const PRESERVE = new Set([
	"node_modules",
	".git",
	"config.json",
	"acc.json",
	"appstate.json",
	".env",
	"Horizon_Database",
	"includes/datajson",
	"includes/data_sqlite",
	"data.sqlite",
	"update.md"
]);

function getApiBase() {
	return (process.env.UPDATE_API_URL || (global.config && global.config.UPDATE_API_URL) || "").replace(/\/+$/, "");
}

function getAuthHeaders() {
	const token = process.env.UPDATE_API_TOKEN;
	return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Asks the update API whether a newer version exists.
 * Returns null if no update API is configured (feature is opt-in).
 * Returns the parsed response body otherwise — see update.md for shape.
 */
async function checkForUpdate() {
	const base = getApiBase();
	if (!base) return null;

	const res = await axios.get(`${base}/api/updates/check`, {
		params: { version: CURRENT_VERSION, botName: (global.config && global.config.BOTNAME) || "" },
		headers: getAuthHeaders(),
		timeout: 10000
	});

	const data = res.data;
	if (!data || typeof data.updateAvailable !== "boolean") {
		throw new Error("Update API returned an unexpected response shape (see update.md).");
	}
	return data;
}

/**
 * Downloads the update package and verifies its sha256 checksum before
 * ever touching disk with extracted content.
 */
async function downloadAndVerify(downloadUrl, checksum) {
	const res = await axios.get(downloadUrl, {
		responseType: "arraybuffer",
		headers: getAuthHeaders(),
		timeout: 5 * 60 * 1000
	});
	const buf = Buffer.from(res.data);

	if (!checksum) throw new Error("Update API did not provide a checksum — refusing to install an unverifiable update.");
	const actual = crypto.createHash("sha256").update(buf).digest("hex");
	if (actual.toLowerCase() !== String(checksum).toLowerCase()) {
		throw new Error(`Checksum mismatch (expected ${checksum}, got ${actual}) — update package may be corrupted or tampered with.`);
	}
	return buf;
}

function shouldPreserve(relPath) {
	const normalized = relPath.split(path.sep).join("/");
	for (const p of PRESERVE) {
		if (normalized === p || normalized.startsWith(p + "/")) return true;
	}
	return false;
}

async function copyExtractedInto(extractDir, targetDir) {
	const entries = await fs.readdir(extractDir);
	// Some zips wrap everything in a single top-level folder — descend
	// into it automatically so files land at the right place.
	let sourceDir = extractDir;
	if (entries.length === 1) {
		const only = path.join(extractDir, entries[0]);
		if ((await fs.stat(only)).isDirectory()) sourceDir = only;
	}

	async function copyDir(src, relBase) {
		const items = await fs.readdir(src);
		for (const item of items) {
			const rel = relBase ? `${relBase}/${item}` : item;
			if (shouldPreserve(rel)) continue;
			const srcPath = path.join(src, item);
			const destPath = path.join(targetDir, rel);
			const stat = await fs.stat(srcPath);
			if (stat.isDirectory()) {
				await fs.ensureDir(destPath);
				await copyDir(srcPath, rel);
			} else {
				await fs.ensureDir(path.dirname(destPath));
				await fs.copy(srcPath, destPath, { overwrite: true });
			}
		}
	}

	await copyDir(sourceDir, "");
}

/**
 * Extracts the verified update buffer and copies its files over the
 * live install, skipping anything in PRESERVE. Records the applied
 * version so a future restart can report/act on it.
 */
async function applyUpdate(buf, meta = {}) {
	const stamp = Date.now();
	const tmpZip = path.join(ROOT_DIR, `.update-${stamp}.zip`);
	const tmpExtract = path.join(ROOT_DIR, `.update-extract-${stamp}`);

	try {
		await fs.writeFile(tmpZip, buf);
		await fs.ensureDir(tmpExtract);
		await extractZip(tmpZip, { dir: tmpExtract });
		await copyExtractedInto(tmpExtract, ROOT_DIR);

		const statePath = path.join(ROOT_DIR, "includes", "datajson", "updateState.json");
		await fs.ensureDir(path.dirname(statePath));
		await fs.writeJson(statePath, {
			version: meta.latestVersion || null,
			appliedAt: new Date().toISOString(),
			previousVersion: CURRENT_VERSION
		}, { spaces: 2 });
	} finally {
		await fs.remove(tmpZip).catch(() => {});
		await fs.remove(tmpExtract).catch(() => {});
	}
}

/**
 * Background check used by the periodic auto-update timer in main.js.
 * Never throws — logs and returns instead, so a flaky/misconfigured
 * update API can never crash or block bot startup.
 */
async function runSelfUpdateCheck(logger) {
	const log = logger || ((msg) => console.log("[ SELF-UPDATE ]", msg));
	try {
		const info = await checkForUpdate();
		if (!info) return; // not configured, opt-in feature
		if (!info.updateAvailable) return;

		log(`Update available: v${CURRENT_VERSION} -> v${info.latestVersion}. Downloading...`);
		const buf = await downloadAndVerify(info.downloadUrl, info.checksum);
		await applyUpdate(buf, info);
		log(`Updated to v${info.latestVersion}. Restarting to apply...`);
		process.exit(1);
	} catch (e) {
		log(`Self-update check failed: ${e.message}`);
	}
}

module.exports = {
	CURRENT_VERSION,
	checkForUpdate,
	downloadAndVerify,
	applyUpdate,
	runSelfUpdateCheck
};
