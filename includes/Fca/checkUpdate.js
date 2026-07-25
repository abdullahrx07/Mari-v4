const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const rx = require('./utils').lang;

var PACKAGE_NAME = 'xdi-fca';

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
    rx.logT("Index.AutoCheckUpdate");
    try {
        const { data: npmData } = await axios.get(
            'https://registry.npmjs.org/xdi-fca/latest'
        );

        const latestVersion = npmData.version;
        const currentVersion = getCurrentVersion();

        if (latestVersion !== currentVersion) {
            const isNewer = compareVersions(latestVersion, currentVersion) > 0;
            if (!isNewer) {
                rx.successT("Index.LocalVersion", currentVersion);
                return false;
            }

            rx.successT("Index.NewVersionFound", latestVersion, currentVersion);
            rx.logT("Index.AutoUpdate");

            try {
                const { data: changesData } = await axios.get(
                    'https://raw.githubusercontent.com/Amibu-FCA/fca-unofficial/main/CHANGELOG.md'
                );
                rx.log('Recent Changes:');
                const latestChanges = changesData.split('##')[1]?.split('\n').slice(0, 5).join('\n');
                if (latestChanges) console.log(latestChanges);
            } catch (_) { }

            await updateNpmPackage(latestVersion);
            await updateUserPackageJson(latestVersion);

            rx.successT("Index.UpdateSuccess");
            rx.logT("Index.RestartAfterUpdate");

            setTimeout(() => { process.exit(2); }, 1000);
            return true;
        } else {
            rx.successT("Index.LocalVersion", currentVersion);
            return false;
        }
    } catch (error) {
        rx.errorT("Index.UpdateFailed");
        rx.error('Details:', error.message);
        return false;
    }
}

function compareVersions(a, b) {
    var pa = a.split('.').map(Number);
    var pb = b.split('.').map(Number);
    for (var i = 0; i < 3; i++) {
        var na = pa[i] || 0, nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

async function updateNpmPackage(version) {
    try {
        rx.logT("Index.Rebuilding");
        execSync(`npm install ${PACKAGE_NAME}@${version} --save`, { cwd: process.cwd(), stdio: 'inherit' });
        rx.successT("Index.SuccessRebuilding");
        return true;
    } catch (error) {
        rx.errorT("Index.ErrRebuilding");
        rx.error('Details:', error.message);
        throw error;
    }
}

async function updateUserPackageJson(version) {
    try {
        const userPackageJsonPath = path.join(process.cwd(), 'package.json');
        if (!fs.existsSync(userPackageJsonPath)) return;
        const packageJson = JSON.parse(fs.readFileSync(userPackageJsonPath, 'utf-8'));
        if (packageJson.dependencies && packageJson.dependencies[PACKAGE_NAME]) {
            packageJson.dependencies[PACKAGE_NAME] = `^${version}`;
            fs.writeFileSync(userPackageJsonPath, JSON.stringify(packageJson, null, 2));
            rx.success(`Updated package.json to ${PACKAGE_NAME}@${version}`);
        }
        return true;
    } catch (error) {
        rx.warn('Failed to update user package.json:', error.message);
        return false;
    }
}

module.exports = { checkForFCAUpdate, updateNpmPackage, updateUserPackageJson };
