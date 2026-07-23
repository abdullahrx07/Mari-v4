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

module.exports.run = async ({ api, event, args }) => {
const axios = global.nodemodule['axios'];

// event.messageReply may be undefined (no reply), and even when present its
// `attachments` can be an empty array (e2ee reply to a text-only message, or
// an attachment type we couldn't recover) — never assume [0] exists.
const replyAttachments = (event.messageReply && event.messageReply.attachments) || [];
var linkanh = (replyAttachments[0] && replyAttachments[0].url) || (args && args.join(" "));
 if(!linkanh) return api.sendMessage('「imgur」 Reply to a photo/video or give a link', event.threadID, event.messageID)

const apis = await axios.get('https://raw.githubusercontent.com/shaonproject/Shaon/main/api.json')
 const Shaon = apis.data.imgur

const res = await axios.get(`${Shaon}/imgur?link=${encodeURIComponent(linkanh)}`); 
var img = res.data.uploaded.image;
 return api.sendMessage(`"${img}",`, event.threadID, event.messageID);
}
