const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Dynamically load package name and version from its own package.json
let PACKAGE_NAME = '@rxabdullah/xdi-fca';
try {
    const ownPkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(ownPkgPath)) {
        const ownPkg = JSON.parse(fs.readFileSync(ownPkgPath, 'utf-8'));
        if (ownPkg.name) {
            PACKAGE_NAME = ownPkg.name;
        }
    }
} catch (_) {}

function getCurrentVersion() {
    // 1. If this file is inside the package itself (development mode), use its own package.json
    try {
        const ownPkg = path.join(__dirname, 'package.json');
        if (fs.existsSync(ownPkg)) {
            const pkg = JSON.parse(fs.readFileSync(ownPkg, 'utf-8'));
            if (pkg.version) return pkg.version;
        }
    } catch (_) { }

    // 2. Installed as dependency in a user's project
    try {
        const nodeModulesPkg = path.join(process.cwd(), 'node_modules', PACKAGE_NAME, 'package.json');
        if (fs.existsSync(nodeModulesPkg)) {
            const pkg = JSON.parse(fs.readFileSync(nodeModulesPkg, 'utf-8'));
            if (pkg.version) return pkg.version;
        }
    } catch (_) { }

    return '1.0.0';
}

async function checkForFCAUpdate() {
    try {
        const { data: npmData } = await axios.get(
            `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
        );

        const latestVersion = npmData.version;
        const currentVersion = getCurrentVersion();

        if (latestVersion !== currentVersion) {
            const isNewer = compareVersions(latestVersion, currentVersion) > 0;
            if (!isNewer) {
                console.log('\x1b[32m%s\x1b[0m', `✅ FCA is up to date (v${currentVersion})`);
                return false;
            }

            console.log('\x1b[32m%s\x1b[0m', `✨ New FCA version available: ${latestVersion} (current: ${currentVersion})`);
            console.log('\x1b[33m%s\x1b[0m', '📦 Updating FCA package...');

            try {
                // Fetch recent changelog from the primary Maria-fca repository
                const { data: changesData } = await axios.get(
                    'https://raw.githubusercontent.com/abdullahrx07/Maria-fca/main/CHANGELOG.md'
                );
                console.log('\x1b[36m%s\x1b[0m', '📋 Recent Changes:');
                const latestChanges = changesData.split('##')[1]?.split('\n').slice(0, 10).join('\n');
                if (latestChanges) console.log(latestChanges);
            } catch (_) { }

            await updateNpmPackage(latestVersion);
            await updateUserPackageJson(latestVersion);

            console.log('\x1b[32m%s\x1b[0m', '✅ FCA updated successfully!');
            console.log('\x1b[33m%s\x1b[0m', '🔄 Restarting to apply changes...');

            setTimeout(() => { process.exit(2); }, 1000);
            return true;
        } else {
            console.log('\x1b[32m%s\x1b[0m', `✅ FCA is up to date (v${currentVersion})`);
            return false;
        }
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('\x1b[33m%s\x1b[0m', `⚠️  FCA update check: Package "${PACKAGE_NAME}" is not published on NPM yet (skipping update).`);
        } else {
            console.log('\x1b[31m%s\x1b[0m', '❌ Failed to check for FCA updates:', error.message);
        }
        return false;
    }
}

function compareVersions(a, b) {
    const parse = (v) => v.split('.').map(x => parseInt(x.replace(/[^0-9]/g, ''), 10) || 0);
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

async function updateNpmPackage(version) {
    try {
        console.log('\x1b[36m%s\x1b[0m', `📦 Running npm install ${PACKAGE_NAME}@${version}...`);
        execSync(`npm install ${PACKAGE_NAME}@${version} --save`, { cwd: process.cwd(), stdio: 'inherit' });
        console.log('\x1b[32m%s\x1b[0m', '✅ Package installed successfully!');
        return true;
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '❌ Failed to install package:', error.message);
        throw error;
    }
}

async function updateUserPackageJson(version) {
    try {
        const userPackageJsonPath = path.join(process.cwd(), 'package.json');
        if (!fs.existsSync(userPackageJsonPath)) return;
        const packageJson = JSON.parse(fs.readFileSync(userPackageJsonPath, 'utf-8'));
        let updated = false;

        const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
        for (const section of sections) {
            if (packageJson[section] && packageJson[section][PACKAGE_NAME]) {
                packageJson[section][PACKAGE_NAME] = `^${version}`;
                updated = true;
            }
        }

        if (updated) {
            fs.writeFileSync(userPackageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log('\x1b[32m%s\x1b[0m', `✅ Updated package.json to ${PACKAGE_NAME}@${version}`);
        }
        return true;
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '⚠️  Failed to update user package.json:', error.message);
        return false;
    }
}

module.exports = { checkForFCAUpdate, updateNpmPackage, updateUserPackageJson, compareVersions };
