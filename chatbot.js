// =====================================
// IMPORTS
// =====================================
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth, Poll } = require("whatsapp-web.js");

// =====================================
// CLIENT
// =====================================
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "client-one-en",

    // IMPORTANTE PARA RAILWAY
    dataPath: "/mnt/data/sessions",
  }),

  puppeteer: {
    headless: true,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920x1080",
    ],
  },
});



// =====================================
// READY
// =====================================
client.on("ready", () => {
  console.log("✅ Bot connected!");
});

client.on("authenticated", () => {
  console.log("🔐 Authenticated!");
});

client.on("auth_failure", (msg) => {
  console.log("❌ Auth failure:", msg);
});

client.on("disconnected", (reason) => {
  console.log("⚠️ Disconnected:", reason);
});

// =====================================
// INITIALIZE
// =====================================
(async () => {
  try {
    await client.initialize();

    const pairingCode =
      await client.requestPairingCode(
        "5521973754498"
      );

    console.log("📱 Pairing Code:");
    console.log(pairingCode);
  } catch (err) {
    console.log(
      "❌ Pairing Error:",
      err
    );
  }
})();

// =====================================
// UTILS
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const typing = async (chat) => {
  await chat.sendStateTyping();
  await delay(1200);
};

const normalizeNumber = (number) =>
  (number || "").replace(/[^0-9]/g, "");

const MAX_RETRIES = 2;

const SESSION_TIMEOUT = 15 * 60 * 1000;

const STEP_DELAY = 1800;

// =====================================
// CONTACT PARSER
// =====================================
const parseContactInfo = (text) => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 3) return null;

  const [name, email, phone] = lines;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !validEmail || !phone) return null;

  return { name, email, phone };
};

// =====================================
// SEND POLL
// =====================================
const sendPoll = async (chatId, title, options) => {
  return client.sendMessage(
    chatId,
    new Poll(title, options, {
      allowMultipleAnswers: false,
    })
  );
};

// =====================================
// RETRIES
// =====================================
const resetRetries = (number) => {
  if (flow[number]) flow[number].retries = 0;
};

const invalidReply = async (replyTarget, number) => {
  if (!flow[number]) return false;

  flow[number].retries++;

  if (flow[number].retries >= MAX_RETRIES) {
    await replyTarget(
      "⚠️ Service closed due to lack of a valid response."
    );

    delete flow[number];

    return false;
  }

  await replyTarget("Could you repeat that, please?");

  return true;
};

// =====================================
// OPTIONS
// =====================================
const profileOptions = [
  "End client",
  "Realtor",
  "Architect",
  "Interior Designer",
  "Construction Company",
  "Other",
];

const serviceOptions = [
  "Closet / Custom Millwork",
  "Custom Kitchen",
  "Residential Home Theater",
  "Commercial Home Theater",
  "High-End Custom Furniture",
  "Curtains / Roller Shades / Rugs",
  "Other",
];

const locationOptions = [
  "Sunny Isles Beach",
  "Bal Harbour",
  "Bay Harbor",
  "Surfside",
  "Golden Beach",
  "Brickell",
  "Miami",
  "Coral Gables",
  "Coconut Grove",
  "Brickell Key",
  "Key Biscayne",
  "Other",
];

// =====================================
// FLOW
// =====================================
const flow = {};

// =====================================
// SESSION
// =====================================
const initSession = (number) => {
  if (!flow[number]) {
    flow[number] = {
      step: "start",
      data: {},
      retries: 0,
      lastInteraction: Date.now(),
    };
  }

  if (
    Date.now() - flow[number].lastInteraction >
    SESSION_TIMEOUT
  ) {
    flow[number] = {
      step: "start",
      data: {},
      retries: 0,
      lastInteraction: Date.now(),
    };
  }

  flow[number].lastInteraction = Date.now();
};

// =====================================
// POLL HANDLER
// =====================================
const handlePollStep = async (
  chat,
  userId,
  number,
  text
) => {
  if (!flow[number]) return;

  const step = flow[number].step;

  const data = flow[number].data;

  const replyTarget = (message) =>
    client.sendMessage(userId, message);

  // PROFILE
  if (step === "profile") {
    if (!profileOptions.includes(text)) {
      const keepGoing = await invalidReply(
        replyTarget,
        number
      );

      if (!keepGoing) return;

      return;
    }

    resetRetries(number);

    data.profile = text;

    await typing(chat);

    await delay(STEP_DELAY);

    await sendPoll(
      userId,
      "Which service are you looking for?",
      serviceOptions
    );

    flow[number].step = "service";

    return;
  }

  // SERVICE
  if (step === "service") {
    if (!serviceOptions.includes(text)) {
      const keepGoing = await invalidReply(
        replyTarget,
        number
      );

      if (!keepGoing) return;

      return;
    }

    resetRetries(number);

    data.service = text;

    await typing(chat);

    await delay(STEP_DELAY);

    await sendPoll(
      userId,
      "📍 Where will the project take place?",
      locationOptions
    );

    flow[number].step = "location";

    return;
  }

  // LOCATION
  if (step === "location") {
    if (!locationOptions.includes(text)) {
      const keepGoing = await invalidReply(
        replyTarget,
        number
      );

      if (!keepGoing) return;

      return;
    }

    resetRetries(number);

    if (text === "Other") {
      await typing(chat);

      await delay(STEP_DELAY);

      await client.sendMessage(
        userId,
        "Please type your project location:"
      );

      flow[number].step = "location_custom";

      return;
    }

    data.location = text;

    await typing(chat);

    await delay(STEP_DELAY);

    await client.sendMessage(
      userId,
      `Please send:

Full Name
Email
Phone

Example:
John Doe
john@email.com
+1 305 999 0000`
    );

    flow[number].step = "contact";
  }
};

// =====================================
// POLL VOTES
// =====================================
client.on("vote_update", async (vote) => {
  try {
    const userId = vote.voter;

    const number = normalizeNumber(userId);

    if (!number || !flow[number]) return;

    const pollMessage =
      vote.parentMessage || vote.msg;

    if (!pollMessage) return;

    const chat = await pollMessage.getChat();

    const selectedOptions =
      vote.selectedOptions || [];

    if (!selectedOptions.length) return;

    let text =
      selectedOptions[0]?.name?.trim();

    if (
      !text &&
      selectedOptions[0]?.localId !== undefined
    ) {
      const optionIndex =
        selectedOptions[0].localId;

      if (flow[number].step === "profile")
        text = profileOptions[optionIndex];

      if (flow[number].step === "service")
        text = serviceOptions[optionIndex];

      if (flow[number].step === "location")
        text = locationOptions[optionIndex];
    }

    if (!text) return;

    flow[number].lastInteraction =
      Date.now();

    console.log("🗳 Vote received:", text);

    await handlePollStep(
      chat,
      userId,
      number,
      text
    );
  } catch (err) {
    console.log(
      "❌ vote_update error:",
      err
    );
  }
});

// =====================================
// MESSAGES
// =====================================
client.on("message", async (msg) => {
  try {
    if (!msg.from) return;

    if (msg.from === "status@broadcast")
      return;

    if (msg.fromMe) return;

    if (msg.from.endsWith("@g.us")) return;

    const now = Math.floor(Date.now() / 1000);

    if (now - msg.timestamp > 15) return;

    const chat = await msg.getChat();

    const number = normalizeNumber(msg.from);

    const text = msg.body?.trim() || "";

    if (!text) return;

    initSession(number);

    const step = flow[number].step;

    const data = flow[number].data;

    // START
    if (step === "start") {
      await typing(chat);

      await msg.reply(`👋 Welcome to *Provence Closets*

We specialize in high-end custom millwork.`);

      await delay(STEP_DELAY);

      await sendPoll(
        msg.from,
        "Your profile?",
        profileOptions
      );

      flow[number].step = "profile";

      return;
    }

    // CUSTOM LOCATION
    if (step === "location_custom") {
      if (text.length < 2) {
        const keepGoing =
          await invalidReply(
            (m) => msg.reply(m),
            number
          );

        if (!keepGoing) return;

        return;
      }

      resetRetries(number);

      data.location = text;

      await typing(chat);

      await delay(STEP_DELAY);

      await msg.reply(`Please send:

Full Name
Email
Phone

Example:
John Doe
john@email.com
+1 305 999 0000`);

      flow[number].step = "contact";

      return;
    }

    // CONTACT
    if (step === "contact") {
      const parsed =
        parseContactInfo(text);

      if (!parsed) {
        const keepGoing =
          await invalidReply(
            (m) => msg.reply(m),
            number
          );

        if (!keepGoing) return;

        return;
      }

      resetRetries(number);

      data.name = parsed.name;
      data.email = parsed.email;
      data.phone = parsed.phone;

      data.status = "completed";

      const customerSummary = `📄 *PROJECT SUMMARY*

👤 Name: ${data.name}
📧 Email: ${data.email}
📱 Phone: ${data.phone}

🧑‍💼 Profile: ${data.profile}
🛠 Service: ${data.service}
📍 Location: ${data.location}

----------------------------

✅ Your request has been received!
Our team will contact you soon.`;

      const internalSummary = `📄 *NEW LEAD*

👤 Name: ${data.name}
📧 Email: ${data.email}
📱 Phone: ${data.phone}

🧑‍💼 Profile: ${data.profile}
🛠 Service: ${data.service}
📍 Location: ${data.location}

📲 WhatsApp: ${msg.from}`;

      await typing(chat);

      await msg.reply(customerSummary);

      await delay(STEP_DELAY);

      await msg.reply(`🌐 https://provenceclosets.com

📸 https://www.instagram.com/provenceclosets`);

      // ID DO GRUPO
      const GROUP_ID =
        "120363406671460331@g.us";

      try {
        await client.sendMessage(
          GROUP_ID,
          internalSummary
        );
      } catch (err) {
        console.log(
          "⚠️ Could not send lead to group:",
          err.message
        );
      }

      console.log(
        "📊 NEW LEAD:",
        number,
        data
      );

      delete flow[number];

      return;
    }
  } catch (err) {
    console.log("❌ Error:", err);
  }
});
