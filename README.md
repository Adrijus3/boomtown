# PoorDown

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
3. After two or three minutes you get an address like `https://poordown-xxxx.onrender.com`. Open it, press **Create a private game** and send the room link to your friends.

Free services fall asleep after 15 minutes with nobody connected. The next visit wakes the server, which takes about a minute, then it's quick again. Games keep the server awake while anyone is playing.

Every push to this repository redeploys automatically, and games in progress carry on afterwards (see below). Pages that are already open notice the update and reload themselves, so phones never keep running old files.

The game is one small Node.js server, so any host that runs Node.js and supports WebSockets also works.

**Any server with Docker**

```
docker build -t poordown .
docker run -d -p 3000:3000 --restart unless-stopped poordown
```

Railway, Fly.io and a basic VPS all work the same way. The server reads the `PORT` environment variable if your host sets one.

Games survive restarts and redeploys. Rooms live in the server's memory, so the server keeps sending each seated player a signed copy of their room, which their browser stores. When the server comes back and someone reopens the room link, their browser hands the copy back, the server checks the signature (so nobody can edit their money) and rebuilds the room. Everyone gets their seat back when they reconnect, and a bot covers anyone who doesn't. Copies older than 12 hours aren't used. The signing key comes from `SNAPSHOT_SECRET`, which the Render Blueprint generates once; without it the server falls back to Render's service ID, or to a `.snapshot-secret` file when run on your own computer.

## How to play

- **Play now** puts you in an open public room, or opens a new one. **Create a private game** makes a room that only people with the link can join.
- When there's nothing left to decide on your turn, it ends by itself after a 4-second countdown on the End turn button. Press **Stay** (or tap a property, build, mortgage…) to keep your turn open, then press End turn yourself.
- Opening a room link (or pressing Join) puts you straight into a free seat if the game hasn't started. Only someone who hasn't chosen a nickname yet is asked for one first. A full room, or a game already under way, means you watch.
- On your own, the host's button reads **Start with 3 bots**: one tap fills the table to 4 players and starts. The Start button sits at the bottom of the Players card, under Add a bot. House rules fold away on phones (tap to open).
- Rooms have 6 seats to start with; the host can pick anything from 2 to 8. The host sets the house rules, adds bots and starts the game with the button at the top of the waiting room. Anyone who joins after the start can watch and chat.
- Bots build houses on full sets as soon as they can, mortgaging spare single properties to get each set to 3 houses, and bid a little more boldly in auctions. They are noticeably tougher than early versions.
- If a bot is slowing things down, or a friend has left or stopped playing, open them in the side panel and press **Remove bot** or **Vote to remove**. The other players still in the game get 30 seconds to vote, and more than half must agree. Bots can always be removed; a person who is still playing can only be voted out if someone else votes with you, or once they've left or let their turn clock run out. Their properties are auctioned, a region at a time.
- Add a profile photo on the start screen, in the waiting room (tap your seat's circle) or during the game (the Photo button on your player). You can drag and zoom it into the circle, and it replaces your letter on your token and everywhere else your player appears. Photos are shrunk to a few kilobytes, kept on your device, and only shared with the people in your room.
- If someone disconnects, a bot plays their turns after 15 seconds. Opening the room link again gives them their seat back. On a different computer or phone, open the room link and press **That's me** next to your name. That works whenever your old device is no longer connected.
- Press the palette button to pick a theme. They come in three groups: hand-drawn (Crayon, Chalkboard, Blueprint), light (Daylight, Classic, Rose) and dark (Midnight, Neon, Sunset, High contrast). Each person picks their own theme on their own device.
- On a phone, owned properties show their owner rather than their rent, so names stay readable. Tap any square to see its full card.
- Turn order is shuffled, and everyone starts with the same cash (the host's Starting cash setting).
- On phones, pinch the board to zoom in (up to 3×) and drag to look around, or tap the magnifier in the board's corner to zoom in on your token and back out. The board itself never moves on its own.
- In your properties list, a full region has one **Build N houses** button that puts a house on every city in it in a single tap. Tap any property to open its options in place: **Sell** (70% of the price, the main choice), **Mortgage** (50%, and you keep it), building and selling houses, and Details.
- When the game ends, a podium shows the top three, with confetti for the winner, before the net-worth chart.
- **Starting cities** (house rule): in big games each player is dealt cities at the start so there are enough to go round. Automatic gives none for up to 4 players, 1 each for 5, and 2 each for 6 or more; nobody is dealt a full set.
- If you owe more than you have, **Raise it and pay** does the selling for you in one tap: it mortgages first (the properties you'd miss least, never part of a built-up set), sells houses only if mortgaging isn't enough, and pays as soon as there's enough. The button says exactly what it will do before you press it.
- Games last **25 rounds**, about the length of a lesson. After the last round the richest player (by net worth) wins, unless everyone else has already gone bankrupt.
- **Auctions** run on one 10-second clock (7 on fast games, 12 on relaxed). Bid with **+£10**, **+£50** or **+£100**; each button shows the price you would bid. The highest bid when the clock runs out wins. **Pass** takes you out of that auction, and the auction ends early once everyone except the leader is out.
- When a player goes bankrupt, their properties are auctioned **one region at a time**, and the highest bidder takes the whole region.
- Half of every tax, fine and bail goes into a **Free Parking** jackpot, up to £200, and whoever lands there collects it. The host can switch this off in the house rules.
- **Surprise and Treasure cards** can still move you: to Start, to Prison, back three spaces, to the nearest airport or utility (normal rent), or by train, coach or lift to a city picked at random, so no property gets extra visitors.
- Rents rise steadily around the board, and same-priced cities in a region charge the same rent. Regions are balanced through house prices: in simulated games, completing any region gives about the same chance of winning.
- Trading happens between turns: the player whose turn it is can't send or accept offers, and offers sent to them wait until their turn is over. In the trade window, drag the balance slider (or use the arrow keys on it) to set how much cash changes hands.
- Each turn has two clocks: 1 minute to roll the dice, then 2 minutes to buy, build and end the turn. The host can change either clock or switch it off. The clocks keep running while dice roll and tokens move, and pause only during auctions. If the roll clock runs out, the dice are rolled for the player. If the turn clock runs out, the turn ends; a property they were deciding on goes to auction instead of being bought.

## What's in the folder

| Path | What it does |
| --- | --- |
| `server.js` | Web server (sends files compressed, about a quarter of their size), rooms, seats, host controls, bots, auctions, turn timer and reconnects |
| `public/engine.js` | The rules: board, money, rent, building, mortgages, auctions, trades, Prison, cards, bankruptcy, bot strategy. The server and the browser share this file. |
| `public/app.js` | The browser client: start screen, waiting room, board, animations, portfolio, trades, chat |
| `public/art.js` | The hand-drawn board icons and country flags |
| `public/themes.js`, `public/themes.css` | The themes and the theme picker. The sketch themes draw their hand-drawn outlines, colouring-in and paper grain as small SVG pictures. |
| `public/photo.js` | The profile photo picker: choose, drag and zoom a picture into a circle, saved as a small JPEG |
| `public/dice3d.js`, `public/vendor/three.min.js` | The 3D dice, drawn with three.js (MIT licence). Browsers without WebGL fall back to flat dice. |
| `public/style.css`, `public/index.html`, `public/fonts/` | Layout, styling and the typefaces (Bricolage Grotesque, Instrument Sans, and Patrick Hand, Cabin Sketch and Architects Daughter for the sketch themes, all under the SIL Open Font License) |
| `test/simulate.js` | Plays 600 bot-only games across different house rules and checks the rules never break (`npm test`) |

The server is the only place moves are decided. Browsers send what a player wants to do ("roll", "bid $120"), the server checks it against the rules and sends the new game state to everyone in the room, so nobody can cheat by editing their page.

## Accessibility

Every screen and dialog in both versions passes the axe checks for WCAG 2.2 AA and recommended best practice, at phone and desktop sizes. You can play the whole game with a keyboard: focus stays inside open dialogs, Escape closes them, and focus goes back where it was afterwards. Text meets 4.5:1 contrast, the page is marked as British English for screen readers, the activity feed announces what happens, and countdowns are kept out of what screen readers read aloud. With "reduce motion" switched on, there's no camera zoom or flying coins. Phones held sideways, tablets and small laptops get a layout with the board beside the side panel, so the whole board stays in view.
