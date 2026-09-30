const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const express = require("express");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

// ONLY this WhatsApp group will receive welcome messages
const TARGET_GROUP_ID = "120363412413157771@g.us";

let sock;
let currentQR = null;
let status = "Starting";

/*
 * Home page
 */
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


/*
 * Status
 */
app.get("/status", (req, res) => {

  res.json({
    bot: "WhatsApp Group Welcome Bot",
    status: status
  });

});


/*
 * Get groups
 */
app.get("/groups", async (req, res) => {

  if (!sock) {

    return res.json({
      error: "WhatsApp is not connected yet."
    });

  }

  try {

    const groups =
      await sock.groupFetchAllParticipating();

    const result =
      Object.values(groups).map(group => ({
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


/*
 * Start web server
 */
app.listen(PORT, () => {

  console.log(
    `Web server running on port ${PORT}`
  );

});


/*
 * Start WhatsApp bot
 */
async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState("/app/auth_info_new");

  sock = makeWASocket({

    auth: state,

    printQRInTerminal: false

  });


  /*
   * Save WhatsApp login credentials
   */
  sock.ev.on("creds.update", saveCreds);


  /*
   * WhatsApp connection
   */
  sock.ev.on(
    "connection.update",
    ({
      connection,
      lastDisconnect,
      qr
    }) => {

      if (qr) {

        currentQR = qr;

        status = "Waiting for QR scan";

        console.log(
          "New QR code generated."
        );

      }


      if (connection === "open") {

        currentQR = null;

        status = "Online";

        console.log(
          "WhatsApp Group Welcome Bot is online!"
        );

        console.log(
          `Watching only group: ${TARGET_GROUP_ID}`
        );

      }


      if (connection === "close") {

        status = "Disconnected";

        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;


        if (shouldReconnect) {

          console.log(
            "WhatsApp disconnected. Reconnecting..."
          );

          setTimeout(
            startBot,
            3000
          );

        }

      }

    }
  );


  /*
   * Detect new members joining a group
   */
  sock.ev.on(
    "group-participants.update",
    async (update) => {

      console.log(
        "Group update:",
        update
      );


      /*
       * Ignore every group except
       * the selected group.
       */
      if (
        update.id !== TARGET_GROUP_ID
      ) {

        console.log(
          `Ignoring group: ${update.id}`
        );

        return;

      }


      /*
       * Only react when someone is added.
       */
      if (
        update.action !== "add"
      ) {

        return;

      }


      /*
       * Welcome each new member.
       */
      for (
        const participant of update.participants
      ) {

        let displayName =
          participant.split("@")[0];


        /*
         * Try to get the person's
         * WhatsApp profile/contact name.
         */
        try {

          const contact =
            await sock.onWhatsApp(
              participant
            );


          if (
            contact &&
            contact[0]
          ) {

            displayName =
              contact[0].name ||
              contact[0].notify ||
              contact[0].verifiedName ||
              displayName;

          }

        } catch (error) {

          console.log(
            "Could not get WhatsApp name:",
            error.message
          );

        }


        /*
         * Make the person's WhatsApp name
         * appear in the welcome message
         * and tag the actual account.
         */
        const welcomeMessage =
          `👋 Welcome to the group, ${displayName}! 🎉\n\n` +
          `We're happy to have you here.\n\n` +
          `Feel free to introduce yourself ` +
          `and enjoy the community!`;


        try {

          await sock.sendMessage(
            update.id,
            {
              text: welcomeMessage,
              mentions: [participant]
            }
          );


          console.log(
            `Welcome message sent to ${displayName}`
          );


        } catch (error) {

          console.log(
            "Welcome message error:",
            error.message
          );

        }

      }

    }
  );

}


/*
 * Start bot
 */
startBot();
