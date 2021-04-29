import dotenv from "dotenv";
dotenv.config();

import WebSocket from "ws";
import axios from "axios";

const members = {};

const WAIT_BEFORE_UPDATING = 1 * 1000; // ms

if (!process.env.SLACK_CHANNEL_ID) {
  console.log("Must specify SLACK_CHANNEL_ID in .env");
  process.exit();
}

if (!process.env.SLACK_ACCESS_TOKEN) {
  console.log("Must specify SLACK_ACCESS_TOKEN in .env");
  process.exit();
}

if (!process.env.SLACK_ACCESS_TOKEN) {
  console.log("Must specify work adventure WEBSOCKET_URL in .env");
  process.exit();
}

const countOnlineUsers = () =>
  Object.entries(members).filter(([name, status]) => status).length;

function debounce(callback, wait, immediate = false) {
  let timeout = null;

  return function () {
    const callNow = immediate && !timeout;
    const next = () => callback.apply(this, arguments);

    clearTimeout(timeout);
    timeout = setTimeout(next, wait);

    if (callNow) {
      next();
    }
  };
}

async function joinSlackChannel() {
  const { data } = await axios.post(
    `https://slack.com/api/conversations.join`,
    { channel: process.env.SLACK_CHANNEL_ID },
    {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}`,
      },
    }
  );

  if (data.ok) {
    console.log("Joined slack channel");
  } else {
    console.error("Could not join slack channel", data);
  }
}

async function getSlackChannelInfo() {
  const { data } = await axios.get(`https://slack.com/api/conversations.info`, {
    params: {
      channel: process.env.SLACK_CHANNEL_ID,
    },
    headers: {
      Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}`,
    },
  });

  if (!data.ok) {
    return console.error("Could not load channel info", data);
  }

  console.log("Loaded channel info");
  return data.channel;
}

async function updateSlackTopic(newTopic) {
  const { data } = await axios.post(
    `https://slack.com/api/conversations.setTopic`,
    {
      channel: process.env.SLACK_CHANNEL_ID,
      topic: newTopic,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}`,
      },
    }
  );

  if (data.ok) {
    console.log(`Channel topic updated to ${newTopic}`);
  } else {
    console.error("Channel topic NOT updated", data);
  }
}

async function updateSlack() {
  const userCount = countOnlineUsers();
  const newTopic = `Harvest’s Virtual Office - ${countOnlineUsers()} online!`;
  const existingTopic = (await getSlackChannelInfo())?.topic.value;

  if (existingTopic == newTopic) {
    console.log(`No update needed, topic is already: ${existingTopic}`);
    process.exit(0);
  }

  await updateSlackTopic(newTopic);

  process.exit();
}

const updateSlackSoon = debounce(updateSlack, WAIT_BEFORE_UPDATING, false);

function connectToWS() {
  const ws = new WebSocket(process.env.WEBSOCKET_URL);

  ws.on("open", function open(data) {
    console.log("Connected to WS");

    // This happens if there are no users on the server == no messages
    updateSlackSoon();
  });

  ws.on("message", function incoming(data) {
    if (!data) {
      return;
    }
    data = JSON.parse(data);

    if (!data.data.uuid) {
      return console.log("UUID missing", data.uuid);
    }

    if (data.type === "MemberJoin") {
      members[data.data.uuid] = true;
      console.log(`${data.data.uuid} ${data.data.name} joined`);
    } else if (data.type === "MemberLeave") {
      members[data.data.uuid] = false;
      console.log(`${data.data.uuid} left`);
    }

    // After the first post, wait longer between messages
    updateSlackSoon();
  });

  ws.on("close", function () {
    console.error("Disconnected from WS");
    process.exit();
  });
}

joinSlackChannel();
connectToWS();
setTimeout(() => process.exit(), 60 * 1000);
