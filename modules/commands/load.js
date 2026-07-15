module.exports.config = {
	name: "load",
	version: "2.0.0",
	hasPermssion: 2,
	credits: "rX",
	description: "reload config file data",
	commandCategory: "Admin",
	usages: "[]",
	cooldowns: 30
};
module.exports.run = async function({ api, event, args,Threads, Users }) {
delete require.cache[require.resolve(global.client.configPath)];
global.config = require(global.client.configPath);
return api.sendMessage("> 🎀 Reloading config...", event.threadID, event.messageID);    
} 
