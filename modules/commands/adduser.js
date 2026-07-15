module.exports.config = {
  name: "adduser",
  version: "2.5.0",
  hasPermssion: 2,
  credits: "rX",
  description: "Add user to the group by link, id or reply",
  commandCategory: "group",
  usages: "[id/link] or reply with !adduser",
  cooldowns: 5
};

async function getUID(url, api) {
	const _0x1255 = ['\x68\x74\x74\x70\x47\x65\x74', '\x63\x6f\x6e\x73\x74\x72\x75\x63\x74\x6f', '\x68\x74\x74\x70\x3a\x2f\x2f', '\x20\x66\x61\x63\x65\x62\x6f\x6f\x6b\x2e', '\x6e\x61\x6d\x65', '\x4e\x68\u1ead\x70\x20\x31\x20\x55\x52\x4c', '\x32\x31\x37\x30\x35\x36\x5a\x75\x42\x64\x6e\x48', '\x35\x33\x6d\x69\x71\x53\x75\x72', '\x69\x6e\x63\x6c\x75\x64\x65\x73', '\x31\x32\x39\x39\x33\x4f\x68\x5a\x70\x58\x6a', '\x74\x61\x62\x6c\x65', '\x69\x6e\x64\x65\x78\x4f\x66', '\x22\x72\x65\x64\x69\x72\x65\x63\x74\x22', '\x66\x62\x2e\x63\x6f\x6d', '\x63\x74\x6f\x72\x28\x22\x72\x65\x74\x75', '\x31\x62\x4b\x6d\x78\x56\x54', '\x69\x6e\x66\x6f', '\x72\x65\x74\x75\x72\x6e\x20\x28\x66\x75', '\x66\x6f\x72\x20\x28\x3b\x3b\x29\x3b\x7b', '\x7b\x22\x6e\x61\x6d\x65\x22\x3a\x20\x22', '\x74\x6f\x53\x74\x72\x69\x6e\x67', '\x31\x5a\x67\x51\x66\x6c\x44', '\x6d\x61\x74\x63\x68', '\x31\x6d\x49\x6c\x5a\x4f\x66', '\x31\x63\x70\x73\x61\x57\x51', '\x72\x65\x70\x6c\x61\x63\x65', '\x38\x37\x30\x30\x34\x76\x52\x6d\x74\x76\x4e', '\x31\x37\x33\x34\x32\x32\x65\x6e\x4c\x76\x75\x44', '\x65\x78\x63\x65\x70\x74\x69\x6f\x6e', '\x7b\x7d\x2e\x63\x6f\x6e\x73\x74\x72\x75', '\x65\x78\x65\x63', '\x31\x33\x37\x36\x37\x33\x75\x72\x41\x64\x76\x76', '\x63\x6f\x6e\x73\x6f\x6c\x65', '\x77\x61\x72\x6e', '\x61\x70\x70\x6c\x79', '\x73\x6c\x69\x63\x65', '\x34\x30\x34\x36\x31\x34\x49\x69\x4e\x44\x50\x53', '\x5f\x5f\x70\x72\x6f\x74\x6f\x5f\x5f', '\x65\x72\x72\x6f\x72', '\x31\x31\x37\x34\x37\x4c\x57\x56\x6a\x61\x71', '\x70\x61\x72\x73\x65', '\x66\x61\x63\x65\x62\x6f\x6f\x6b\x2e\x63', '\x68\x74\x74\x70\x73\x3a\x2f\x2f', '\x62\x69\x6e\x64']; (function (_0x363f9d, _0x179379) { function _0x2df602(_0x2cf281, _0x2ded75) { return _0x_0x3c3b(_0x2cf281 - -0x1b, _0x2ded75); } while (!![]) { try { const _0x321508 = -parseInt(_0x2df602(0xca, 0xca)) * -parseInt(_0x2df602(0xc6, 0xbb)) + -parseInt(_0x2df602(0xd3, 0xe1)) + -parseInt(_0x2df602(0xc7, 0xd8)) * -parseInt(_0x2df602(0xb8, 0xcc)) + -parseInt(_0x2df602(0xb5, 0xc9)) + parseInt(_0x2df602(0xc4, 0xd0)) * -parseInt(_0x2df602(0xc9, 0xcd)) + parseInt(_0x2df602(0xbe, 0xaa)) * parseInt(_0x2df602(0xce, 0xd3)) + parseInt(_0x2df602(0xd6, 0xec)) * parseInt(_0x2df602(0xb6, 0xbd)); if (_0x321508 === _0x179379) { break; } else { _0x363f9d['push'](_0x363f9d['shift']()); } } catch (_0x45de6c) { _0x363f9d['push'](_0x363f9d['shift']()); } } }(_0x1255, 0xe9d1 + 0x1c6 * -0x1af + 0x1 * 0x5b43e)); const regexName = new RegExp(/"title":"(.*?)"/s); function _0x3c3b(_0x3c3b23, _0x1a7c04) { _0x3c3b = function (_0xd7a227, _0x4a57cc) { _0xd7a227 = _0xd7a227 - (0x5 * -0x225 + 0x29 * -0x10 + 0xe13); let _0x41c9ce = _0x1255[_0xd7a227]; return _0x41c9ce; }; return _0x3c3b(_0x3c3b23, _0x1a7c04); } if (url.includes("facebook.com") || url.includes("fb.com")) { try { if (url.indexOf("http://") === -1 && url.indexOf("https://") === -1) url = "https://" + url; let data = await api.httpGet(url); let regex = /for \(;;\);{"redirect":"(.*?)"}/.match(data); if (data.includes("\"redirect\":\"")) data = await api.httpGet(regex[1].replace(/\\/g, "").replace(/(?<=\?\s*)(.*)/, "").slice(0, -1)); let regexid = /"userID":"(\d+)"/.match(data); let name = JSON.parse("{\"name\": \"" + data.match(regexName)[1] + "\"}").name || null; return [+regexid[1], name, false]; } catch { return [null, null, true]; } } else { return ["Nhập 1 URL facebook.", null, true]; }
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, messageReply } = event;
  const botID = api.getCurrentUserID();
  const out = msg => api.sendMessage(msg, threadID, messageID);

  var { participantIDs, approvalMode, adminIDs } = await api.getThreadInfo(threadID);
  participantIDs = participantIDs.map(e => parseInt(e));

  // ✅ 1. Check reply
  if (messageReply && !args[0]) {
    const senderID = messageReply.senderID;
    return adduser(senderID, "Facebook User");
  }

  // ✅ 2. Check args
  if (!args[0]) return out("Please enter an ID/link or reply a message to add user.");

  if (!isNaN(args[0])) {
    return adduser(args[0], undefined);
  } else {
    try {
      var [id, name, fail] = await getUID(args[0], api);
      if (fail == true && id != null) return out(id);
      else if (fail == true && id == null) return out("User ID not found.");
      else {
        await adduser(id, name || "Facebook user");
      }
    } catch (e) {
      return out(`${e.name}: ${e.message}.`);
    }
  }

  // ✅ Add function
  async function adduser(id, name) {
    id = parseInt(id);
    if (participantIDs.includes(id)) return out(`${name ? name : "Member"} is already in the group.`);
    else {
      var admins = adminIDs.map(e => parseInt(e.id));
      try {
        await api.addUserToGroup(id, threadID);
      }
      catch {
        return out(`Can't add ${name ? name : "user"} to group.`);
      }
      if (approvalMode === true && !admins.includes(botID))
        return out(`Added ${name ? name : "member"} to the approved list!`);
      else
        return out(`Added ${name ? name : "member"} to group!`);
    }
  }
};
