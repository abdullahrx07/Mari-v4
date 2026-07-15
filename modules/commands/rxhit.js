const fetch = require("node-fetch");

module.exports.config = {
    name: "rxhit",
    version: "1.0.2",
    hasPermssion: 2,
    credits: "rX Abdullah",
    description: "Ultra Fast Auto API Hitting Tool",
    commandCategory: "utility",
    usages: "!rxhit <api> | !rxhit stop",
};

let running = {}; // per-thread control

// Auto sequence
const AUTO_SEQ = [100, 500, 1000, 300, 100, 500, 1000, 300];

async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Run all hits in a batch concurrently
async function runBatch(URL, total) {
    const hits = Array.from({ length: total }, () => fetch(URL).catch(() => {}));
    await Promise.all(hits); // fire all requests almost simultaneously
}

// Auto mode
async function autoMode(api, event, URL) {
    const threadID = event.threadID;
    let index = 0;

    while (running[threadID]) {
        const total = AUTO_SEQ[index];

        api.sendMessage(`⚡ Auto Hit Started: ${total}`, threadID);

        await runBatch(URL, total);

        if (!running[threadID]) return;

        api.sendMessage("✔ Done! Next auto hit in 5 seconds…", threadID);

        await delay(5000);

        index = (index + 1) % AUTO_SEQ.length;
    }
}

module.exports.run = async function ({ api, event, args }) {
    const threadID = event.threadID;

    // STOP
    if (args[0] === "stop") {
        running[threadID] = false;
        return api.sendMessage("⛔ rX Auto Hit Stopped!", threadID);
    }

    // START
    const URL = args[0];
    if (!URL)
        return api.sendMessage("❗ Usage: !rxhit <api> | !rxhit stop", threadID);

    running[threadID] = true;

    api.sendMessage("✅ rX API Hitting Tool Activated!\nStarting auto hits…", threadID);

    await autoMode(api, event, URL);
};
