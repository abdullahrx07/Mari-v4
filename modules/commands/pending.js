module.exports.config = {
	name: "pending",
	version: "1.0.6",
	credits: "rX",
	hasPermssion: 2,
	description: "Manage bot's waiting messages",
	commandCategory: "system",
	cooldowns: 5
};

module.exports.languages = {
    "en": {
        "invaildNumber": "%1 is not an invalid number",
        "cancelSuccess": "Refused %1 thread!",
        "notiBox": "｡ﾟ･｡･ﾟﾟ｡\nﾟ。𝙂𝙧𝙤𝙪𝙥 𝙖𝙥𝙥𝙧𝙤𝙫𝙚𝙙✨\n　ﾟ･｡･тнαηкѕ ƒσя υѕιηg мαяια ν3❤ •˚⠀", 
        "approveSuccess": "Approved successfully %1 threads!",

        "cantGetPendingList": "Can't get the pending list!",
        "returnListPending": "»「PENDING」«❮ The whole number of threads to approve is: %1 thread ❯\n\n%2",
        "returnListClean": "「PENDING」There is no thread in the pending list"
    }
}

// ===== Approve helpers (shared logic with the approve command) =====
const formatDate = (d) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

// Adds a thread into the approved_threads store (7 day default duration),
// skipping it if it's already approved. Returns true if newly approved.
async function addToApprovedList(targetThreadID) {
    let data = await global.systemData.get("approved_threads", []);

    if (data.find((e) => String(e.t_id) === String(targetThreadID))) {
        return false; // already approved, don't duplicate
    }

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7); // default duration: 7 days

    data.push({
        t_id: targetThreadID,
        user: "Everyone",
        time_start: formatDate(start),
        time_end: formatDate(end),
    });

    await global.systemData.set("approved_threads", data);
    return true;
}

module.exports.handleReply = async function({ api, event, handleReply, getText }) {
    if (String(event.senderID) !== String(handleReply.author)) return;
    const { body, threadID, messageID } = event;
    var count = 0;

    if (isNaN(body) && body.indexOf("c") == 0 || body.indexOf("cancel") == 0) {
        const index = (body.slice(1, body.length)).split(/\s+/);
        for (const singleIndex of index) {
            console.log(singleIndex);
            if (isNaN(singleIndex) || singleIndex <= 0 || singleIndex > handleReply.pending.length) return api.sendMessage(getText("invaildNumber", singleIndex), threadID, messageID);
            api.removeUserFromGroup(api.getCurrentUserID(), handleReply.pending[singleIndex - 1].threadID);
            count+=1;
        }
        return api.sendMessage(getText("cancelSuccess", count), threadID, messageID);
    }
    else {
        const index = body.split(/\s+/);
        for (const singleIndex of index) {
            if (isNaN(singleIndex) || singleIndex <= 0 || singleIndex > handleReply.pending.length) return api.sendMessage(getText("invaildNumber", singleIndex), threadID, messageID);
            const targetThreadID = handleReply.pending[singleIndex - 1].threadID;
            await addToApprovedList(targetThreadID);
            api.sendMessage(getText("notiBox"), targetThreadID);
            count+=1;
        }
        return api.sendMessage(getText("approveSuccess", count), threadID, messageID);
    }
}

module.exports.run = async function({ api, event, getText }) {
	const { threadID, messageID } = event;
    const commandName = this.config.name;
    var msg = "", index = 1;

    try {
		var spam = await api.getThreadList(100, null, ["OTHER"]) || [];
		var pending = await api.getThreadList(100, null, ["PENDING"]) || [];
	} catch (e) { return api.sendMessage(getText("cantGetPendingList"), threadID, messageID) }

	const list = [...spam, ...pending].filter(group => group.isSubscribed && group.isGroup);

    for (const single of list) msg += `${index++}/ ${single.name}(${single.threadID})\n`;

    if (list.length != 0) return api.sendMessage(getText("returnListPending", list.length, msg), threadID, (error, info) => {
		global.client.handleReply.push({
            name: commandName,
            messageID: info.messageID,
            author: event.senderID,
            pending: list
        })
	}, messageID);
    else return api.sendMessage(getText("returnListClean"), threadID, messageID);
}
