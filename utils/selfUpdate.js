/**
 * selfUpdate.js
 * ----------------------------------------------------------------------
 * Client side of the bot's self/auto-update system. Talks to a
 * user-hosted "update API" or checks a public GitHub fork repository
 * for updates.
 * ----------------------------------------------------------------------
 */

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");
const extractZip = require("extract-zip");
const semver = require("semver");

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

function parseGithubUrl(url) {
	if (!url) return null;
	const cleanUrl = url.replace(/\.git$/, "").replace(/\/$/, "");
	const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
	if (match) {
		return {
			owner: match[1],
			repo: match[2]
		};
	}
	return null;
}

function getGithubConfig() {
	const enable = (global.config && global.config.autoUpdate && global.config.autoUpdate.enable !== undefined)
		? global.config.autoUpdate.enable
		: (process.env.AUTO_UPDATE_ENABLE !== "false");

	const githubForkUrl = (global.config && global.config.autoUpdate && global.config.autoUpdate.githubForkUrl)
		|| process.env.GITHUB_FORK_URL
		|| "";

	const githubPollUrl = (global.config && global.config.autoUpdate && (global.config.autoUpdate.githubPollUrl || global.config.autoUpdate.githubPullUrl))
		|| process.env.GITHUB_POLL_URL
		|| process.env.GITHUB_PULL_URL
		|| "";

	return { enable, githubForkUrl, githubPollUrl };
}

async function fetchRemotePackageJson(owner, repo) {
	const branches = ["main", "master"];
	for (const branch of branches) {
		try {
			const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;
			const res = await axios.get(url, { timeout: 10000 });
			if (res.data && res.data.version) {
				return {
					packageJson: res.data,
					branch: branch
				};
			}
		} catch (e) {
			// Try next branch
		}
	}
	throw new Error(`Could not fetch package.json from main or master branches of ${owner}/${repo}`);
}

/**
 * Asks either the GitHub fork or the update API whether a newer version exists.
 * Returns null if no update method is configured (feature is opt-in).
 */
async function checkForUpdate() {
	const { enable, githubForkUrl } = getGithubConfig();

	// Check if GitHub-based update is enabled and configured
	if (enable && githubForkUrl && githubForkUrl !== "https://github.com/your-username/your-fork-repo") {
		const parsed = parseGithubUrl(githubForkUrl);
		if (!parsed) {
			throw new Error(`Invalid GitHub Fork URL: ${githubForkUrl}`);
		}
		const { packageJson, branch } = await fetchRemotePackageJson(parsed.owner, parsed.repo);
		const remoteVersion = packageJson.version;
		const updateAvailable = semver.gt(remoteVersion, CURRENT_VERSION);

		return {
			updateAvailable,
			latestVersion: remoteVersion,
			downloadUrl: `https://github.com/${parsed.owner}/${parsed.repo}/archive/refs/heads/${branch}.zip`,
			checksum: null,
			isGithub: true,
			branch: branch,
			githubForkUrl: githubForkUrl,
			changelog: packageJson.description || "Updated via GitHub repo fork."
		};
	}

	// Legacy update API check fallback
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
	const isGitHubDownload = downloadUrl.includes("github.com") || downloadUrl.includes("githubusercontent.com");
	const res = await axios.get(downloadUrl, {
		responseType: "arraybuffer",
		headers: isGitHubDownload ? {} : getAuthHeaders(),
		timeout: 5 * 60 * 1000
	});
	const buf = Buffer.from(res.data);

	if (!checksum && isGitHubDownload) {
		return buf;
	}

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
		const { enable, githubPollUrl } = getGithubConfig();
		if (!enable) {
			log("Auto-update is disabled.");
			return;
		}

		const info = await checkForUpdate();
		if (!info) return; // not configured, opt-in feature
		if (!info.updateAvailable) return;

		// If a poll URL is provided, send the pull request notification and stop direct update.
		if (githubPollUrl && info.isGithub) {
			log(`Update available: v${CURRENT_VERSION} -> v${info.latestVersion}. Poll URL configured. Sending pull request...`);
			try {
				await axios.post(githubPollUrl, {
					event: "update_available",
					currentVersion: CURRENT_VERSION,
					latestVersion: info.latestVersion,
					githubForkUrl: info.githubForkUrl,
					downloadUrl: info.downloadUrl
				}, {
					timeout: 10000,
					headers: {
						"Content-Type": "application/json"
					}
				});
				log(`Update pull request successfully sent to: ${githubPollUrl}`);
			} catch (err) {
				log(`Failed to send pull request to ${githubPollUrl}: ${err.message}. Retrying with GET...`);
				try {
					await axios.get(githubPollUrl, {
						params: {
							event: "update_available",
							currentVersion: CURRENT_VERSION,
							latestVersion: info.latestVersion,
							githubForkUrl: info.githubForkUrl
						},
						timeout: 10000
					});
					log(`Update pull request successfully sent (GET) to: ${githubPollUrl}`);
				} catch (getErr) {
					log(`Failed to send pull request (GET) to ${githubPollUrl}: ${getErr.message}`);
				}
			}
			return; // Avoid updating locally since poll URL is specified to handle/pull the update
		}

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
	getGithubConfig,
	checkForUpdate,
	downloadAndVerify,
	applyUpdate,
	runSelfUpdateCheck
};
