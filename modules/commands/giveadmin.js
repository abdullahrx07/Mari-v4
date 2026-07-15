module.exports.config = {
    name: "giveadmin",
    version: "1.0.0",
    hasPermssion: 2, // ONLY bot admins can use this command
    credits: "rX",
    description: "Make the sender an admin of the group",
    commandCategory: "group",
    usages: "",
    cooldowns: 5
};

module.exports.run = async function ({ api, event }) {

    const threadID = event.threadID;
    const senderID = event.senderID;

    try {
        // Change admin status: true = give admin
        api.changeAdminStatus(threadID, senderID, true, (err) => {
            if (err) {
                return api.sendMessage("❌ Failed to give admin. Make sure the bot is already an admin.", threadID);
            }
            api.sendMessage("✅ You are now an admin of this group!", threadID);
        });

    } catch (error) {
        api.sendMessage("❌ An error occurred while trying to give admin.", threadID);
    }
};
