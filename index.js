const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const express = require("express");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

let sock;
let currentQR = null;
let status = "Starting";

app.get("/", async (req, res) => {
  if (currentQR) {
    const qrImage = await QRCode.toDataURL(currentQR);

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Group Welcome Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>

      <body style="font-family:Arial;text-align:center;padding:30px">

        <h1>WhatsApp Group Welcome Bot</h1>

        <p>Scan this QR code with WhatsApp</p>

        <img src="${qrImage}" style="max-width:300px">

        <p>
          WhatsApp → Linked Devices → Link a Device
        </p>

      </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="5">
      </head>

      <body style="font-family:Arial;text-align:center;padding:50px">

        <h1>WhatsApp Group Welcome Bot</h1>

        <h2>Status: ${status}</h2>

        <p>Waiting for WhatsApp connection...</p>

      </body>
    </html>
  `);
});

app.get("/status", (req, res) => {
  res.json({
    bot: "WhatsApp Group Welcome Bot",
    status: status
  });
});

app.get("/groups", async (req, res) => {
  if (!sock) {
    return res.json({
      error: "WhatsApp is not connected yet."
    });
  }

  try {
    const groups = await sock.groupFetchAllParticipating();

    const result = Object.values(groups).map(group => ({
      name: group.subject,
      id: group.id
    }));

    res.json(result);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info_new");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({
    connection,
    lastDisconnect,
    qr
  }) => {

    if (qr) {
      currentQR = qr;
      status = "Waiting for QR scan";

      console.log("New QR code generated.");
    }

    if (connection === "open") {
      currentQR = null;
      status = "Online";

      console.log("WhatsApp Group Welcome Bot is online!");
    }

    if (connection === "close") {

      status = "Disconnected";

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("Reconnecting...");
        setTimeout(startBot, 3000);
      }
    }
  });

  /*
   * Detect new members joining groups.
   */
  sock.ev.on("group-participants.update", async (update) => {

    console.log("Group update:", update);

    if (update.action !== "add") {
      return;
    }

    /*
     * Welcome every newly added member.
     */
    for (const participant of update.participants) {

      const name =
        participant.split("@")[0];

      const welcomeMessage =
        `👋 Welcome to the group, @${name}!\n\n` +
        `We're happy to have you here. 🎉\n\n` +
        `Feel free to introduce yourself ` +
        `and enjoy the community!`;

      try {

        await sock.sendMessage(update.id, {
          text: welcomeMessage,
          mentions: [participant]
        });

        console.log(
          `Welcome message sent to ${participant}`
        );

      } catch (error) {

        console.log(
          "Welcome message error:",
          error.message
        );

      }
    }
  });
}

startBot();
