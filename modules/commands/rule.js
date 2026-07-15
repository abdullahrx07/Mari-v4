const axios = require("axios");

module.exports.config = {
  name: "rules",
  version: "2.3.2",
  hasPermssion: 0,
  credits: "rX Abdullah",
  description: "Show/add/remove rules per group (dynamic API from GitHub JSON)",
  commandCategory: "noprefix",
  usages: "rules / !rules add/remove/all",
  cooldowns: 5,
};

// GitHub JSON URL
const githubJSON = "https://raw.githubusercontent.com/rxabdullah0007/rX-apis/main/xApis/rXallApi.json";

// Fetch rules API URL from GitHub JSON
async function getRulesAPI() {
  try {
    const res = await axios.get(githubJSON);
    if (res.data && res.data.rules) return res.data.rules;
    throw new Error("rules key not found in JSON");
  } catch (e) {
    console.error("Failed to fetch rules API:", e.message);
    return null;
  }
}

// Fetch rules from API
async function getRules(threadID) {
  const API_URL = await getRulesAPI();
  if (!API_URL) return { threadID, listRule: [] };

  try {
    const res = await axios.get(`${API_URL}?threadID=${threadID}`);
    console.log("ThreadID:", threadID, "Rules fetched:", res.data);
    return res.data || { threadID, listRule: [] };
  } catch (e) {
    console.error("Error fetching rules:", e.message);
    return { threadID, listRule: [] };
  }
}

// Save rules to API
async function saveRules(threadID, rulesList) {
  const API_URL = await getRulesAPI();
  if (!API_URL) return;

  try {
    const res = await axios.post(API_URL, { threadID, listRule: rulesList });
    console.log("Rules saved:", res.data);
  } catch (e) {
    console.error("Failed to save rules:", e.message);
  }
}

module.exports.handleEvent = async ({ event, api }) => {
  const { threadID, body } = event;
  if (!body || body.toLowerCase() !== "rules") return;

  const thisThread = await getRules(threadID);
  if (!thisThread.listRule.length)
    return api.sendMessage("⚠️ This group has no rules saved yet.", threadID);

  const lastRule = thisThread.listRule[thisThread.listRule.length - 1];
  return api.sendMessage(`📌 Group Rule:\n${lastRule}`, threadID);
};

module.exports.run = async ({ event, api, args, permssion }) => {
  const { threadID, messageID, body } = event;
  let thisThread = await getRules(threadID);

  const action = args[0]?.toLowerCase();
  const input = body.substring(body.indexOf(action) + action.length + 1).trim();

  switch (action) {
    case "add": {
      if (permssion == 0) return api.sendMessage("❌ You don't have permission.", threadID, messageID);
      if (!input || input.length < 3) return api.sendMessage("⚠️ Provide the rule content.", threadID, messageID);

      thisThread.listRule.push(input);
      await saveRules(threadID, thisThread.listRule);
      return api.sendMessage("✅ Rule added successfully!", threadID, messageID);
    }

    case "remove":
    case "rm":
    case "delete": {
      if (permssion == 0) return api.sendMessage("❌ You don't have permission.", threadID, messageID);
      if (!input) return api.sendMessage("⚠️ Specify rule number or 'all'.", threadID, messageID);

      if (input === "all") {
        thisThread.listRule = [];
        await saveRules(threadID, thisThread.listRule);
        return api.sendMessage("🗑️ All rules deleted.", threadID, messageID);
      }

      const index = parseInt(input) - 1;
      if (isNaN(index) || index < 0 || index >= thisThread.listRule.length)
        return api.sendMessage("⚠️ Invalid rule number.", threadID, messageID);

      thisThread.listRule.splice(index, 1);
      await saveRules(threadID, thisThread.listRule);
      return api.sendMessage(`🗑️ Rule number ${input} deleted.`, threadID, messageID);
    }

    case "all":
    case "list": {
      if (!thisThread.listRule.length) return api.sendMessage("⚠️ No rules to show.", threadID, messageID);

      let msg = "";
      thisThread.listRule.forEach((item, i) => msg += `${i + 1}/ ${item}\n`);
      return api.sendMessage(`📜 All Group Rules:\n\n${msg}`, threadID, messageID);
    }

    default: {
      return api.sendMessage(
        "📘 Command Usage:\n" +
        "• !rules add [text] — Add a rule\n" +
        "• !rules remove [number/all] — Remove a rule\n" +
        "• rules — Show the latest rule",
        threadID, messageID
      );
    }
  }
};
