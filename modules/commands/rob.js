module.exports.config = {
    name: "rob",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Mirai Team (Translated by rX Abdullah)",
    description: "Try to rob another user randomly",
    commandCategory: "game",
    usages: "",
    cooldowns: 5
};

module.exports.run = async function({ api, event, Users, Currencies }) {
    var allUsers = global.data.allUserID;
    let victim = allUsers[Math.floor(Math.random() * allUsers.length)];
    let victimName = (await Users.getData(victim)).name;

    // Prevent robbing yourself or the bot
    if (victim == api.getCurrentUserID() && event.senderID == victim)
        return api.sendMessage('Sorry, you cannot rob this person. Please try again.', event.threadID, event.messageID);

    var route = Math.floor(Math.random() * 2);

    // Successful robbery
    if (route > 1 || route == 0) {
        const victimMoney = (await Currencies.getData(victim)).money;
        var stolenAmount = Math.floor(Math.random() * 1000) + 1;

        if (victimMoney <= 0 || victimMoney == undefined) 
            return api.sendMessage(`${victimName} is broke, you got nothing.`, event.threadID, event.messageID);

        else if (victimMoney >= stolenAmount) 
            return api.sendMessage(`You successfully robbed $${stolenAmount} from ${victimName}!`, event.threadID, async () => {
                await Currencies.increaseMoney(victim, -stolenAmount);
                await Currencies.increaseMoney(event.senderID, stolenAmount);
            }, event.messageID);

        else if (victimMoney < stolenAmount) 
            return api.sendMessage(`You stole all of ${victimName}'s money ($${victimMoney})!`, event.threadID, async () => {
                await Currencies.increaseMoney(victim, -victimMoney);
                await Currencies.increaseMoney(event.senderID, victimMoney);
            }, event.messageID);
    }

    // Failed robbery (caught)
    else if (route == 1) {
        var robberName = (await Users.getData(event.senderID)).name;
        var robberMoney = (await Currencies.getData(event.senderID)).money;

        if (robberMoney <= 0) 
            return api.sendMessage("You have no money. Go work to earn some first.", event.threadID, event.messageID);

        else if (robberMoney > 0) 
            return api.sendMessage(`You got caught and lost $${robberMoney}!`, event.threadID, () => 
                api.sendMessage({ 
                    body: `🎉 Congratulations ${victimName}! You caught ${robberName} trying to rob you and received $${Math.floor(robberMoney / 2)} as a reward!`, 
                    mentions: [
                        { tag: victimName, id: victim }, 
                        { tag: robberName, id: event.senderID }
                    ] 
                }, event.threadID, async () => {
                    await Currencies.increaseMoney(event.senderID, -robberMoney);
                    await Currencies.increaseMoney(victim, Math.floor(robberMoney / 2));
                }), 
            event.messageID);
    }
};
