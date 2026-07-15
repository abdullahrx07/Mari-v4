module.exports.config = {
	name: "adminUpdate",
	eventType: ["log:thread-admins","log:thread-name", "log:user-nickname","log:thread-icon","log:thread-call","log:thread-color"],
	version: "1.0.1",
	credits: "rX",
	description: "Update team information quickly",
    envConfig: {
        sendNoti: true,
    }
};

module.exports.run = async function ({ event, api, Threads, Users }) {
	const fs = require("fs");
	const moment = require("moment-timezone");
	var iconPath = __dirname + "/emoji.json";
	if (!fs.existsSync(iconPath)) fs.writeFileSync(iconPath, JSON.stringify({}));
    
    const { threadID, logMessageType, logMessageData } = event;
    const { setData, getData } = Threads;

    const thread = global.data.threadData.get(threadID) || {};
    if (typeof thread["adminUpdate"] != "undefined" && thread["adminUpdate"] == false) return;

    try {
        let dataThread = (await getData(threadID)).threadInfo;

        // Bold font converter
        const toBold = (text) => {
        const boldMap = {
    "A":"𝐀","B":"𝐁","C":"𝐂","D":"𝐃","E":"𝐄","F":"𝐅","G":"𝐆","H":"𝐇","I":"𝐈","J":"𝐉","K":"𝐊","L":"𝐋","M":"𝐌",
    "N":"𝐍","O":"𝐎","P":"𝐏","Q":"𝐐","R":"𝐑","S":"𝐒","T":"𝐓","U":"𝐔","V":"𝐕","W":"𝐖","X":"𝐗","Y":"𝐘","Z":"𝐙",
    "a":"𝐚","b":"𝐛","c":"𝐜","d":"𝐝","e":"𝐞","f":"𝐟","g":"𝐠","h":"𝐡","i":"𝐢","j":"𝐣","k":"𝐤","l":"𝐥","m":"𝐦",
    "n":"𝐧","o":"𝐨","p":"𝐩","q":"𝐪","r":"𝐫","s":"𝐬","t":"𝐭","u":"𝐮","v":"𝐯","w":"𝐰","x":"𝐱","y":"𝐲","z":"𝐳",
    "0":"𝟎","1":"𝟏","2":"𝟐","3":"𝟑","4":"𝟒","5":"𝟓","6":"𝟔","7":"𝟕","8":"𝟖","9":"𝟗",
    ":":":","-":"-"," ":" "
     };
            return text.split("").map(c => boldMap[c] || c).join("");
        }

        switch (logMessageType) {
            case "log:thread-admins": {
                const timeNow = moment.tz("Asia/Dhaka").format("dddd, h:mm A");

                if (logMessageData.ADMIN_EVENT == "add_admin") {
                    dataThread.adminIDs.push({ id: logMessageData.TARGET_ID });
                    if (global.configModule[this.config.name].sendNoti) {
                        let addedBy = await Users.getNameUser(event.author);
                        let newAdmin = await Users.getNameUser(logMessageData.TARGET_ID);

                        const msg = `[ 𝐀𝐃𝐌𝐈𝐍 𝐀𝐃𝐃𝐄𝐃 ]
・${toBold("By")} : ${toBold(addedBy)}
・${toBold("Made Admin")} : ${toBold(newAdmin)}
・${toBold("Time")} : ${toBold(timeNow)}`;

                        api.sendMessage(msg, threadID);
                    }
                } else if (logMessageData.ADMIN_EVENT == "remove_admin") {
                    dataThread.adminIDs = dataThread.adminIDs.filter(item => item.id != logMessageData.TARGET_ID);
                    if (global.configModule[this.config.name].sendNoti) {
                        let removedBy = await Users.getNameUser(event.author);
                        let removedAdmin = await Users.getNameUser(logMessageData.TARGET_ID);

                        const msg = `[ 𝐀𝐃𝐌𝐈𝐍 𝐑𝐄𝐌𝐎𝐕𝐄𝐃 ]
・${toBold("By")} : ${toBold(removedBy)}
・${toBold("Removed")} : ${toBold(removedAdmin)}
・${toBold("Time")} : ${toBold(timeNow)}`;

                        api.sendMessage(msg, threadID);
                    }
                }
                break;
            }

            case "log:user-nickname":
            case "log:thread-call":
            case "log:thread-color":
            case "log:thread-icon":
            case "log:thread-name": {
                break;
            }
        }

        await setData(threadID, { threadInfo: dataThread });
    } catch (e) {
        console.log(e);
    }
}
