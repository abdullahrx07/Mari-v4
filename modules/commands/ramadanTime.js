module.exports.config = {
 name: 'ramadantime',
 aliases: ["rm", "roja", "iftar"],
 premium: false,
 version: '26.5',
 hasPermission: 0,
 credits: 'rX',
 description: 'Smart Ramadan & Azan system with Auto-reply & Global API',
 commandCategory: 'group messenger',
 usages: '!ramadantime <district/city> | set | iftari | sehri',
 cooldowns: 3
};

const axios = require("axios");
if (!global.threadCities) global.threadCities = {};

function makeBold(text) {
 const fonts = {
 a: "𝐚", b: "𝐛", c: "𝐜", d: "𝐝", e: "𝐞", f: "𝐟", g: "𝐠", h: "𝐡", i: "𝐢", j: "𝐣", k: "𝐤", l: "𝐥", m: "𝐦",
 n: "𝐧", o: "𝐨", p: "𝐩", q: "𝐪", r: "𝐫", s: "𝐬", t: "𝐭", u: "𝐮", v: "𝐯", w: "𝐰", x: "𝐱", y: "𝐲", z: "𝐳",
 A: "𝐀", B: "𝐁", C: "Ｃ", D: "𝐃", E: "𝐄", F: "Ｆ", G: "𝐆", H: "𝐇", I: "𝐈", J: "𝐉", K: "Ｋ", L: "𝐋", M: "𝐌",
 N: "𝐍", O: "𝐎", P: "Ｐ", Q: "𝐐", R: "𝐑", S: "𝐒", T: "𝐓", U: "𝐔", V: "𝐕", W: "𝐖", X: "𝐗", Y: "Ｙ", Z: "𝐐"
 };
 return text.split('').map(char => fonts[char] || char).join('');
}

const sehriWishes = ["🌙 Have a blessed Sehri", "🤍 May Allah accept our fasting", "🙏 Don't forget to pray"].map(makeBold);
const iftarWishes = ["🌟 Enjoy your Iftar", "🍽️ May Allah bless your meal", "✨ May your prayers be answered"].map(makeBold);
const azanWishes = ["🕌 Success comes with Prayer", "🕋 Focus on your Salah", "✨ May Allah bless your day"].map(makeBold);

async function getRamadanTime(city) {
 try {
 const res = await axios.get(`https://ramadan-info.vercel.app/api/ramadan?city=${encodeURIComponent(city)}`);
 return res.data;
 } catch { return null; }
}

function random(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getBDTime() {
 return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
}

function parseTimeTo24(timeStr) {
 if (!timeStr) return { h: -1, m: -1 };
 const [time, modifier] = timeStr.split(' ');
 let [hours, minutes] = time.split(':');
 if (hours === '12') hours = '00';
 if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
 return { h: parseInt(hours, 10), m: parseInt(minutes, 10) };
}

function frame(title, district, text, time, wish) {
 const today = new Date().toLocaleDateString('en-GB');
 return `╭───────────────╮\n🌙 ${title}\n📍 ${makeBold(district.toUpperCase())}\n╰───────────────╯\n\n${text}\n⏰ Time: ${time}\n\n${wish}\n📅 Date: ${today}`.trim();
}

async function sendAutoUnsend(api, threadID, msg) {
 api.sendMessage(msg, threadID, (err, info) => {
 if (err) return;
 setTimeout(() => { api.unsendMessage(info.messageID); }, 120000); // 2 Minute auto unsend
 });
}

/* ================= AUTO ALERT ================= */
module.exports.onLoad = o => {
 if (!global.threadCities) global.threadCities = {};
 setInterval(async () => {
 const now = getBDTime();
 const h = now.getHours(), m = now.getMinutes(), isFri = now.getDay() === 5;
 
 // Get unique cities from all active threads
 const cities = [...new Set(Object.values(global.threadCities))];
 if (cities.length === 0) return;

 for (const city of cities) {
 const d = await getRamadanTime(city);
 if (!d || !d.status) continue;

 let alertMsg = "";
 const district = d.location_info.city;

 // 1. Azan & Jumma Logic
 if (isFri && h === 12 && m === 30) {
 alertMsg = frame("JUMMA ALERT", district, "🕌 It's time for Jumma Azan.", "12:30 PM", makeBold("Jumma Mubarak!"));
 } else {
 const prayers = d.namaj_timing;
 for (const [name, time] of Object.entries(prayers)) {
 if (name === "sunrise" || name === "sunset") continue;
 const t = parseTimeTo24(time);
 if (h === t.h && m === t.m) {
 alertMsg = frame("AZAN ALERT", district, `🕋 It's time for ${name.toUpperCase()} Azan.`, time, random(azanWishes));
 break;
 }
 }
 }

 // 2. Ramadan Logic
 const sEnd = parseTimeTo24(d.ramadan_timing.sehri_end);
 if (h === sEnd.h && m === sEnd.m) {
 alertMsg = frame("SEHRI ALERT", district, "🚫 Sehri somoy shesh hoyeche.", d.ramadan_timing.sehri_end, random(sehriWishes));
 }
 
 const iStart = parseTimeTo24(d.ramadan_timing.iftar_start);
 if (h === iStart.h && m === iStart.m) {
 alertMsg = frame("IFTAR ALERT", district, "🌙 Iftar-er somoy hoyeche.", d.ramadan_timing.iftar_start, random(iftarWishes));
 }

 if (alertMsg) {
 for (const tid in global.threadCities) {
 if (global.threadCities[tid] === city) {
 sendAutoUnsend(o.api, tid, alertMsg);
 }
 }
 }
 }
 }, 45000); // Check every 45 seconds
};

/* ================= COMMAND ================= */
module.exports.run = async function(o) {
 const { threadID } = o.event;
 const args = o.args;
 if (!global.threadCities[threadID]) global.threadCities[threadID] = "Dhaka";
 const city = global.threadCities[threadID];

 if (!args[0]) {
 return o.api.sendMessage(`🌙 Ramadan & Azan System\n\nDistrict: ${makeBold(city.toUpperCase())}\n\nCommands:\n!rm set <city>\n!rm <city name>\n!rm iftari / sehri`, threadID, (e, info) => {
 global.client.handleReply.push({ name: this.config.name, messageID: info.messageID });
 });
 }

 if (args[0] === "set" && args[1]) {
 const check = await getRamadanTime(args[1]);
 if (!check || !check.status) return o.api.sendMessage("❌ Invalid District/City!", threadID);
 global.threadCities[threadID] = args[1].toLowerCase();
 return o.api.sendMessage(`✅ District set to ${makeBold(args[1].toUpperCase())}`, threadID);
 }

 const query = args[0] === "iftari" || args[0] === "sehri" ? city : args[0];
 const d = await getRamadanTime(query);
 if (!d || !d.status) return o.api.sendMessage("❌ Error fetching data!", threadID);

 const curH = getBDTime().getHours();
 const isIftar = args[0] === "iftari" || (args[0] !== "sehri" && curH < 18);
 const title = isIftar ? "IFTAR TIME" : "SEHRI TIME";
 const time = isIftar ? d.ramadan_timing.iftar_start : d.ramadan_timing.sehri_end;

 return o.api.sendMessage(frame(title, d.location_info.city, isIftar ? "🌙 Today's Iftar" : "🌙 Next Sehri Ends", time, isIftar ? random(iftarWishes) : random(sehriWishes)), threadID);
};

/* ================= REPLY TO SET ================= */
module.exports.handleReply = async function(o) {
 const { threadID, body } = o.event;
 if (!body) return;
 const check = await getRamadanTime(body);
 if (!check || !check.status) return;
 global.threadCities[threadID] = body.toLowerCase();
 return o.api.sendMessage(`✅ District updated to ${makeBold(body.toUpperCase())}`, threadID);
};
