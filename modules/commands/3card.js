module.exports.config = {
    name: "3card",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "",
    description: "3 Card Game for groups with betting (with card images)",
    commandCategory: "Game",
    usages: "[start/join/info/leave]",
    cooldowns: 1
};

const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const suits = ["spades", "hearts", "diamonds", "clubs"];
const deck = [];

// Create deck
for (let i = 0; i < values.length; i++) {
  for (let x = 0; x < suits.length; x++) {
    let weight = parseInt(values[i]);
    if (["J", "Q", "K"].includes(values[i])) weight = 10;
    else if (values[i] == "A") weight = 11;

    const card = {
      Value: values[i],
      Suit: suits[x],
      Weight: weight,
      Icon: suits[x] == "spades" ? "♠️" : suits[x] == "hearts" ? "♥️" : suits[x] == "diamonds" ? "♦️" : "♣️"
    };
    deck.push(card);
  }
}

// Shuffle deck
function createDeck() {
  const deckShuffled = [...deck];
  for (let i = 0; i < 1000; i++) {
    const loc1 = Math.floor(Math.random() * deckShuffled.length);
    const loc2 = Math.floor(Math.random() * deckShuffled.length);
    const tmp = deckShuffled[loc1];
    deckShuffled[loc1] = deckShuffled[loc2];
    deckShuffled[loc2] = tmp;
  }
  return deckShuffled;
}

// Get card image link
function getCardLink(Value, Suit) {
  return `https://raw.githubusercontent.com/ntkhang03/poker-cards/main/cards/${Value == "J" ? "jack" : Value == "Q" ? "queen" : Value == "K" ? "king" : Value == "A" ? "ace" : Value}_of_${Suit}.png`;
}

// Draw card images as single image
async function drawCard(cards) {
  const Canvas = require("canvas");
  const canvas = Canvas.createCanvas(500 * cards.length, 726);
  const ctx = canvas.getContext("2d");
  let x = 0;
  for (const card of cards) {
    const img = await Canvas.loadImage(card);
    ctx.drawImage(img, x, 0);
    x += 500;
  }
  return canvas.toBuffer();
}

// Handle events
module.exports.handleEvent = async ({ Currencies, event, api, Users }) => {
  const Canvas = require("canvas");
  const fs = require("fs-extra");
  const { senderID, threadID, body, messageID } = event;

  if (!body) return;
  if (!global.moduleData.threecards) global.moduleData.threecards = new Map();
  if (!global.moduleData.threecards.has(threadID)) return;

  const values = global.moduleData.threecards.get(threadID);
  if (values.start != 1) return;

  const deckShuffled = values.deckShuffled;

  // Deal Cards
  if (body.toLowerCase().startsWith("deal cards")) {
    if (values.dealt == 1) return;
    for (const key in values.player) {
      const card1 = deckShuffled.shift();
      const card2 = deckShuffled.shift();
      const card3 = deckShuffled.shift();

      let total = card1.Weight + card2.Weight + card3.Weight;
      if (total >= 20) total -= 20;
      if (total >= 10) total -= 10;

      values.player[key].card1 = card1;
      values.player[key].card2 = card2;
      values.player[key].card3 = card3;
      values.player[key].total = total;

      const cardLinks = [];
      for (let i = 1; i <= 3; i++) {
        const c = values.player[key]["card" + i];
        cardLinks.push(getCardLink(c.Value, c.Suit));
      }

      const pathSave = __dirname + `/cache/card${values.player[key].id}.png`;
      fs.writeFileSync(pathSave, await drawCard(cardLinks));

      api.sendMessage({
        body: `Your Cards: ${card1.Value}${card1.Icon} | ${card2.Value}${card2.Icon} | ${card3.Value}${card3.Icon}\n\nTotal: ${total}`,
        attachment: fs.createReadStream(pathSave)
      }, values.player[key].id, (err) => {
        if (err) return api.sendMessage(`Cannot deal cards to: ${values.player[key].id}`, threadID);
        fs.unlinkSync(pathSave);
      });
    }

    values.dealt = 1;
    global.moduleData.threecards.set(threadID, values);
    return api.sendMessage("Cards have been dealt! Each player has 2 chances to swap cards.", threadID);
  }

  // Swap Card
  if (body.toLowerCase().startsWith("swap card")) {
    if (values.dealt != 1) return;
    const player = values.player.find(p => p.id == senderID);
    if (player.swaps == 0) return api.sendMessage("You have used all your swap chances.", threadID, messageID);
    if (player.ready) return api.sendMessage("You are already ready. Cannot swap again.", threadID, messageID);

    const cards = ["card1", "card2", "card3"];
    player[cards[Math.floor(Math.random() * cards.length)]] = deckShuffled.shift();
    player.total = player.card1.Weight + player.card2.Weight + player.card3.Weight;
    if (player.total >= 20) player.total -= 20;
    if (player.total >= 10) player.total -= 10;
    player.swaps -= 1;
    global.moduleData.threecards.set(threadID, values);

    const cardLinks = [];
    for (let i = 1; i <= 3; i++) {
      const c = player["card" + i];
      cardLinks.push(getCardLink(c.Value, c.Suit));
    }

    const pathSave = __dirname + `/cache/card${player.id}.png`;
    fs.writeFileSync(pathSave, await drawCard(cardLinks));

    return api.sendMessage({
      body: `Your cards after swap: ${player.card1.Value}${player.card1.Icon} | ${player.card2.Value}${player.card2.Icon} | ${player.card3.Value}${player.card3.Icon}\nTotal: ${player.total}`,
      attachment: fs.createReadStream(pathSave)
    }, player.id, (err) => {
      if (err) return api.sendMessage(`Cannot swap cards for: ${player.id}`, threadID);
      fs.unlinkSync(pathSave);
    });
  }

  // Ready
  if (body.toLowerCase().startsWith("ready")) {
    if (values.dealt != 1) return;
    const player = values.player.find(p => p.id == senderID);
    if (player.ready) return;

    values.ready += 1;
    player.ready = true;

    if (values.player.length == values.ready) {
      const players = values.player;
      players.sort((a, b) => b.total - a.total);

      let ranking = [], rank = 1;
      for (const p of players) {
        const name = await Users.getNameUser(p.id);
        ranking.push(`${rank++} • ${name} : ${p.card1.Value}${p.card1.Icon} | ${p.card2.Value}${p.card2.Icon} | ${p.card3.Value}${p.card3.Icon} => ${p.total} points`);
      }

      try {
        await Currencies.increaseMoney(players[0].id, values.betAmount * players.length);
      } catch (e) {}
      global.moduleData.threecards.delete(threadID);

      return api.sendMessage(`Results:\n\n${ranking.join("\n")}\n\nFirst place wins: ${values.betAmount * players.length}$`, threadID);
    } else {
      const name = await Users.getNameUser(player.id);
      return api.sendMessage(`${name} is ready. Remaining players not ready: ${values.player.length - values.ready}`, threadID);
    }
  }

  // Show non-ready players
  if (body.toLowerCase().startsWith("nonready")) {
    const notReady = values.player.filter(p => !p.ready);
    if (notReady.length == 0) return;
    const msg = [];
    for (const p of notReady) {
      const name = global.data.userName.get(p.id) || await Users.getNameUser(p.id);
      msg.push(name);
    }
    return api.sendMessage("Players not ready: " + msg.join(", "), threadID);
  }
}

// Command handler
module.exports.run = async ({ api, event, args, Currencies }) => {
  const { senderID, threadID, messageID } = event;
  const fs = require("fs-extra");
  const request = require("request");
  const path = __dirname + "/cache/3cards.png";

  if (!fs.existsSync(path)) {
    request('https://i.imgur.com/MXk2py3').pipe(fs.createWriteStream(path));
  }

  if (!global.moduleData.threecards) global.moduleData.threecards = new Map();
  const values = global.moduleData.threecards.get(threadID) || {};
  const data = await Currencies.getData(senderID);
  const money = data.money;

  // Show help if no argument
  if (!args[0]) {
    return api.sendMessage({
      body: `===== 3 Card Table =====
Welcome to the gambling paradise! Double your assets here.
Commands:
» 3cards create [Bet Amount]
» 3cards start
» 3cards info
» 3cards leave
» Deal Cards (Only author can use)
» Swap Card (Each player has 2 swap chances)
» Ready (Mark ready to reveal cards)
» Nonready (Show players not ready)`,
      attachment: fs.createReadStream(path)
    }, threadID, messageID);
  }

  // Command switch
  switch (args[0]) {
    case "create":
    case "-c": {
      if (global.moduleData.threecards.has(threadID)) return api.sendMessage("This group already has a 3 card table.", threadID, messageID);
      if (!args[1] || isNaN(args[1]) || parseInt(args[1]) <= 1) return api.sendMessage("Invalid bet amount.", threadID, messageID);
      if (money < args[1]) return api.sendMessage(`You don't have enough money to create this table: ${args[1]}$`, threadID, messageID);

      await Currencies.decreaseMoney(senderID, Number(args[1]));
      global.moduleData.threecards.set(threadID, {
        author: senderID,
        start: 0,
        dealt: 0,
        ready: 0,
        player: [{ id: senderID, card1: 0, card2: 0, card3: 0, swaps: 2, ready: false }],
        betAmount: Number(args[1])
      });
      return api.sendMessage(`3 Card Table created with bet: ${args[1]}$. Others can join.`, threadID, messageID);
    }

    case "join":
    case "-j": {
      if (!values || Object.keys(values).length === 0) return api.sendMessage("No 3 Card table has been created yet.", threadID, messageID);
      if (values.start === 1) return api.sendMessage("The game has already started.", threadID, messageID);
      if (money < values.betAmount) return api.sendMessage(`You don't have enough money to join this table: ${values.betAmount}$`, threadID, messageID);
      if (values.player.find(p => p.id === senderID)) return api.sendMessage("You have already joined this table.", threadID, messageID);

      values.player.push({ id: senderID, card1: 0, card2: 0, card3: 0, total: 0, swaps: 2, ready: false });
      await Currencies.decreaseMoney(senderID, values.betAmount);
      global.moduleData.threecards.set(threadID, values);
      return api.sendMessage("You have successfully joined the 3 Card table!", threadID, messageID);
    }

    case "leave":
    case "-l": {
      if (!values || !values.player || values.player.length === 0) return api.sendMessage("No 3 Card table exists in this group.", threadID, messageID);
      if (!values.player.some(p => p.id === senderID)) return api.sendMessage("You are not part of this 3 Card table.", threadID, messageID);
      if (values.start === 1) return api.sendMessage("The game has already started. You cannot leave now.", threadID, messageID);

      if (values.author === senderID) {
        global.moduleData.threecards.delete(threadID);
        return api.sendMessage("The author has left the table. The table has been closed.", threadID, messageID);
      } else {
        values.player = values.player.filter(p => p.id !== senderID);
        global.moduleData.threecards.set(threadID, values);
        return api.sendMessage("You have left the 3 Card table.", threadID, messageID);
      }
    }

    case "start":
    case "-s": {
      if (!values || Object.keys(values).length === 0) return api.sendMessage("No 3 Card table has been created yet.", threadID, messageID);
      if (values.author !== senderID) return api.sendMessage("Only the author can start the game.", threadID, messageID);
      if (values.player.length <= 1) return api.sendMessage("At least 2 players are required to start the game.", threadID, messageID);
      if (values.start === 1) return api.sendMessage("The game has already started.", threadID, messageID);

      values.deckShuffled = createDeck();
      values.start = 1;
      global.moduleData.threecards.set(threadID, values);
      return api.sendMessage("The 3 Card game has started!", threadID, messageID);
    }

    case "info":
    case "-i": {
      if (!values || !values.player || values.player.length === 0) return api.sendMessage("No 3 Card table exists in this group.", threadID, messageID);
      return api.sendMessage(
        `===== 3 Card Table Info =====
- Author: ${values.author}
- Total Players: ${values.player.length}`,
        threadID,
        messageID
      );
    }

    default:
      return api.sendMessage("Invalid command. Use 3cards with one of the following: create, join, leave, start, info.", threadID, messageID);
  }
};
