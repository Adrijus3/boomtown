# Boomtown

An online property-trading board game. Create a room, send the link to friends, fill the empty seats with bots and play in the browser. No accounts needed.

## Run it on your computer

1. Install **Node.js 18 or newer** from nodejs.org (the LTS download is fine).
2. Unzip this folder, open a terminal in it and run:

   ```
   npm install
   npm start
   ```

3. Open **http://localhost:3000** in your browser.

To play with people on the same Wi-Fi, give them your computer's local address instead, for example `http://192.168.1.20:3000`. On Windows, run `ipconfig` and use the "IPv4 Address"; on a Mac, it's in System Settings → Wi-Fi → Details. Your firewall may ask you to allow Node.js the first time.

## Put it on the internet for free

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Adrijus3/boomtown)

1. Press the **Deploy to Render** button above and sign in to Render with your GitHub account. No credit card is needed for the free plan.
2. Render reads `render.yaml` from this repository and sets everything up: a free Node.js web service with `npm install` and `npm start`. Press **Deploy Blueprint**.
3. After two or three minutes you get an address like `https://boomtown-xxxx.onrender.com`. Open it, press **Create a private game** and send the room link to your friends.

Free services fall asleep after 15 minutes with nobody connected. The next visit wakes the server, which takes about a minute, then it's quick again. Games keep the server awake while anyone is playing.

Every push to this repository redeploys automatically.

The game is one small Node.js server, so any host that runs Node.js and supports WebSockets also works.

**Any server with Docker**

```
docker build -t boomtown .
docker run -d -p 3000:3000 --restart unless-stopped boomtown
```

Railway, Fly.io and a basic VPS all work the same way. The server reads the `PORT` environment variable if your host sets one.

Rooms and games are kept in memory, so restarting or redeploying the server ends any games in progress.

## How to play

- **Play now** puts you in an open public room, or opens a new one. **Create a private game** makes a room that only people with the link can join.
- The host sets the house rules, adds bots and starts the game. Anyone who joins after the start can watch and chat.
- If someone disconnects, a bot plays their turns after 15 seconds. Opening the room link again gives them their seat back.
- Each turn has two clocks: 1 minute to roll the dice, then 2 minutes to buy, build, trade and end the turn. The host can change either clock or switch it off. The clocks keep running while dice roll and tokens move, and pause only during auctions. If the roll clock runs out, the dice are rolled for the player. If the turn clock runs out, nothing is bought and the turn ends.

## What's in the folder

| Path | What it does |
| --- | --- |
| `server.js` | Web server, rooms, seats, host controls, bots, auctions, turn timer and reconnects |
| `public/engine.js` | The rules: board, money, rent, building, mortgages, auctions, trades, Prison, cards, bankruptcy, bot strategy. The server and the browser share this file. |
| `public/app.js` | The browser client: start screen, waiting room, board, animations, portfolio, trades, chat |
| `public/art.js` | The hand-drawn board icons and country flags |
| `public/dice3d.js`, `public/vendor/three.min.js` | The 3D dice, drawn with three.js (MIT licence). Browsers without WebGL fall back to flat dice. |
| `public/style.css`, `public/index.html`, `public/fonts/` | Layout, styling and the two typefaces (Bricolage Grotesque and Instrument Sans, both under the SIL Open Font License) |
| `test/simulate.js` | Plays 600 bot-only games across different house rules and checks the rules never break (`npm test`) |

The server is the only place moves are decided. Browsers send what a player wants to do ("roll", "bid $120"), the server checks it against the rules and sends the new game state to everyone in the room, so nobody can cheat by editing their page.
