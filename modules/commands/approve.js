const fs = require("fs");
const path = require("path");

module.exports.config = {
 name: "approve",
 version: "2.2",
 hasPermssion: 2,
 credits: "rX",
 description: "Approve current group with optional duration",
 commandCategory: "Admin",
 usages: "!approve [1minute/1hour/2day/1month/1year] | !approve box | !approve all <period>",
 cooldowns: 5,
};

const DATA_PATH = path.join(__dirname, "data", "thuebot.json");

const formatDate = (d) =>
 `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

const parseDate = (str) => {
 const [dd, mm, yy] = str.split("/").map(Number);
 return new Date(yy, mm-1, dd);
};

// ===== MAIN =====
module.exports.run = async ({ api, event, args }) => {
 const threadID = event.threadID;

 // ===== BOX MODE =====
 if (args[0] === "box") {
 if (!fs.existsSync(DATA_PATH)) return api.sendMessage("❌ No approved group found!", threadID);
 const data = JSON.parse(fs.readFileSync(DATA_PATH,"utf8"));
 if (!data.length) return api.sendMessage("❌ No approved group found!", threadID);

 let msg = "╭─‣ 𝐀𝐏𝐏𝐑𝐎𝐕𝐄𝐃 𝐆𝐑𝐎𝐔𝐏𝐒\n";
 msg += `├‣ 𝐓𝐎𝐓𝐀𝐋 : ${data.length}\n`;
 msg += "╰────────────◊\n";

 data.forEach((g,i)=>{
 const start = parseDate(g.time_start);
 const end = parseDate(g.time_end);
 const remain = Math.max(0, Math.ceil((end - new Date()) / (1000*60*60*24)));

 msg += `╭─‣ ${i+1}. 𝐓𝐈𝐃 : ${g.t_id}\n`;
 msg += `├‣ type : ${g.user || "Everyone"}\n`;
 msg += `├‣ start date : ${g.time_start}\n`;
 msg += `├‣ end date : ${g.time_end}\n`;
 msg += `├‣ remaining day : ${remain}\n╰────────────◊\n`;
 });

 return api.sendMessage(msg, threadID);
 }

 // ===== SINGLE APPROVE MODE =====
 let durationArg = args[0] || "7day"; // default 7 days
 let match = durationArg.match(/^(\d+)(minute|hour|day|month|year)$/i);

 let num, unit;
 if(match){
 num = parseInt(match[1]);
 unit = match[2].toLowerCase();
 } else {
 // fallback default
 num = 7;
 unit = "day";
 }

 const start = new Date();
 const end = new Date();

 switch(unit){
 case "minute": end.setMinutes(end.getMinutes() + num); break;
 case "hour": end.setHours(end.getHours() + num); break;
 case "day": end.setDate(end.getDate() + num); break;
 case "month": end.setMonth(end.getMonth() + num); break;
 case "year": end.setFullYear(end.getFullYear() + num); break;
 default: end.setDate(end.getDate() + 7); // fallback
 }

 let data = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH,"utf8")) : [];

 if(data.find(e=>e.t_id === threadID)) return api.sendMessage("❌ This group is already approved!", threadID);

 data.push({
 t_id: threadID,
 user: "Everyone",
 time_start: formatDate(start),
 time_end: formatDate(end),
 });

 fs.writeFileSync(DATA_PATH, JSON.stringify(data,null,2));

 return api.sendMessage(`✅ Group Approved!\n\nTID: ${threadID}\nFrom: ${formatDate(start)}\nTo: ${formatDate(end)}`, threadID);
};
