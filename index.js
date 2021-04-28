import WebSocket from "ws";
import axios from "axios";

const ws = new WebSocket(
  "wss://pusher.workadventu.re/admin/rooms?token=zpxngfjebcoehe4f5eke&roomId=@/harvest/harvest/virtualoffice"
);

const members = {};

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
}

function connectToWS() {
  ws.on("open", function open(data) {
    if (!data) {
      return;
    }
    data = JSON.parse(data);

    console.log("Open", data);
  });

  ws.on("message", function incoming(data) {
    if (!data) {
      return;
    }
    data = JSON.parse(data);

    if (!data.data.name) {
      return console.log("Name missing", data.data);
    }

    if (data.type === "MemberJoin") {
      members[data.data.name] = true;
      console.log(`${data.data.name} joined`);
    } else if (data.type === "MemberLeave") {
      members[data.data.name] = false;
      console.log(`${data.data.name} left`);
    }

    updateSlackSoon();
  });
}

async function updateSlack() {
  const { data } = await axios.post(
    `https://slack.com/api/conversations.setTopic`,
    {
      channel: process.env.SLACK_CHANNEL_ID,
      topic: `Harvest’s Virtual Office - ${countOnlineUsers()} online!`,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_ACCESS_TOKEN}`,
      },
    }
  );

  if (data.ok) {
    console.log("Channel topic updated");
  } else {
    console.error("Channel topic NOT updated", data);
  }
}

const updateSlackSoon = debounce(updateSlack, 15000, false);

joinSlackChannel();
connectToWS();
