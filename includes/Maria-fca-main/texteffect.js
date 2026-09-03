module.exports.config = {
    name: "texteffect",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "rX",
    description: "Send text with Messenger text effects (hearts, gift, fire, confetti, sparkles)",
    commandCategory: "utility",
    usages: "[hearts|gift|fire|confetti|sparkles] [message]",
    cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    if (!args[0]) {
        return api.sendMessage(
            "⚠️ Usage: texteffect [hearts|gift|fire|confetti|sparkles] [message]\n\n" +
            "Available effects:\n" +
            "1. hearts / heart / love\n" +
            "2. gift / present / box\n" +
            "3. fire / flame / hot\n" +
            "4. confetti / party / celebrate\n" +
            "5. sparkles / sparkle / star",
            threadID,
            messageID
        );
    }

    const effectType = args[0].toLowerCase();
    const messageText = args.slice(1).join(" ") || `Testing ${effectType} text effect! ✨`;

    return api.sendMessage(
        {
            body: messageText,
            textEffect: effectType
        },
        threadID,
        (err, info) => {
            if (err) {
                return api.sendMessage(`❌ Error sending text effect: ${err.message || err}`, threadID, messageID);
            }
        },
        messageID
    );
};
