const axios = require("axios");
const qs = require("qs");

// ⛔ Hardcoded Pastebin Developer API Key (তোমার দেয়া)
// চাইলে পরে .env এ নিলেও এই কোডে দরকার নেই।
const PASTEBIN_DEV_KEY = "03gWQYd8t0cpr3MW-1_mh8L39uLHarGJ";

// ===== Helper: only BOT ADMINS allowed =====
function isBotAdmin(api, event) {
  try {
    const admins = global.config.ADMINBOT || [];
    return admins.includes(event.senderID);
  } catch (_) {
    return false;
  }
  // 👉 যদি গ্রুপ অ্যাডমিনকেও allow করতে চাও,
  // তাহলে উপরে return false এর বদলে Threads.getData বা api.getThreadInfo ব্যবহার করে
  // event.senderID থ্রেড অ্যাডমিন কি না চেক করতে পারো।
}

// ===== Upload to Pastebin =====
async function uploadToPastebin(content, title = "Mirai Paste", expire = "N", privacy = "1") {
  const payload = {
    api_dev_key: PASTEBIN_DEV_KEY,
    api_option: "paste",
    api_paste_code: content,
    api_paste_private: privacy, // 0=public, 1=unlisted, 2=private (user_key লাগে)
    api_paste_name: title,
    api_paste_expire_date: expire // N, 10M, 1H, 1D, 1W ইত্যাদি
  };

  const res = await axios.post(
    "https://pastebin.com/api/api_post.php",
    qs.stringify(payload),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );

  const url = (res.data || "").toString().trim();
  if (!url.startsWith("http")) throw new Error(url); // Pastebin error string ফেরায়
  const id = url.split("/").pop();
  return { url, raw: `https://pastebin.com/raw/${id}` };
}

// ===== Read text from args or replied message/file =====
async function readContent({ event, args }) {
  // 1) replied text
  if (event.messageReply && event.messageReply.body) {
    return event.messageReply.body;
  }

  // 2) replied attachment (txt/log/js/json/md ছোট ফাইল)
  if (event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length) {
    const att = event.messageReply.attachments[0];
    const name = att?.filename || "";
    const looksText = /\.((txt|log|js|json|ts|md|yml|yaml|env))$/i.test(name);
    if (att?.url && (att?.type === "text" || looksText)) {
      const { data } = await axios.get(att.url, { timeout: 15000 });
      if (typeof data === "string") return data;
    }
  }

  // 3) from args
  if (args.length) return args.join(" ");

  return null;
}

module.exports.config = {
  name: "paste",
  version: "2.0.0",
  hasPermssion: 2,               // ✅ শুধুই BOT ADMIN
  credits: "rX | Maria",
  description: "টেক্সট/এরর লগ Pastebin-এ পেস্ট করে লিংক দেয় (শুধু অ্যাডমিন)",
  commandCategory: "Utility",
  usages: "paste <text> | reply paste",
  cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
  // ডাবল সেফটি—framework এ hasPermssion:2 আছে, তবুও নিজেরা চেক করছি
  if (!isBotAdmin(api, event)) {
    return api.sendMessage("⛔ এই কমান্ড শুধু BOT ADMIN ব্যবহার করতে পারবে।", event.threadID, event.messageID);
  }

  try {
    const content = await readContent({ event, args });
    if (!content) {
      return api.sendMessage(
        "⚠️ কি পেস্ট করবে? টেক্সট লিখে দাও অথবা কোনো মেসেজ/ফাইলে reply করে `paste` দাও।",
        event.threadID,
        event.messageID
      );
    }

    // optional flags (e.g., -exp 1H, -pub)
    // default: unlisted & no-expire
    let expire = "N";   // N, 10M, 1H, 1D, 1W, 2W, 1M, 6M, 1Y
    let privacy = "1";  // 1 = unlisted
    const rawArgs = args.join(" ");
    if (/-exp\s+([A-Za-z0-9]+)/i.test(rawArgs)) {
      expire = rawArgs.match(/-exp\s+([A-Za-z0-9]+)/i)[1];
    }
    if (/-pub\b/i.test(rawArgs)) privacy = "0"; // public চাইলে

    const title = `Thread:${event.threadID} | By:${event.senderID}`;
    const out = await uploadToPastebin(content, title, expire, privacy);

    const msg =
      `✅ Paste created (Pastebin)\n` +
      `🔗 URL: ${out.url}\n` +
      `📄 RAW: ${out.raw}\n` +
      `ℹ️ Flags: -exp <N/10M/1H/1D/...>, -pub (public)`;

    return api.sendMessage(msg, event.threadID, event.messageID);
  } catch (err) {
    return api.sendMessage("❌ Paste করতে সমস্যা হয়েছে: " + err.message, event.threadID, event.messageID);
  }
};
