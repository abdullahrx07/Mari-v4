module.exports.config = {
 name: "imgur",
 version: "2.7.0", 
 hasPermssion: 0,
 credits: "rX",
 description: "create your imgur link",
 commandCategory: "other", 
 usages: "[tag]", 
 cooldowns: 0,
};

module.exports.run = async ({ api, event }) => {
const axios = global.nodemodule['axios'];

const apis = await axios.get('https://raw.githubusercontent.com/shaonproject/Shaon/main/api.json')
 const Shaon = apis.data.imgur
 
var linkanh = event.messageReply.attachments[0].url || args.join(" ");
 if(!linkanh) return api.sendMessage('「imgur」 What are you trying', event.threadID, event.messageID)
const res = await axios.get(`${Shaon}/imgur?link=${encodeURIComponent(linkanh)}`); 
var img = res.data.uploaded.image;
 return api.sendMessage(`"${img}",`, event.threadID, event.messageID);
}
