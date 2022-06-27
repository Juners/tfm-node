let lastId = 0;
const getNextUniqueId = () => {
  return ++lastId;
};

const subscriptions = {};
function subscribe(eventType, callback) {
  const id = getNextUniqueId(); // create new entry for eventType
  if (!subscriptions[eventType]) subscriptions[eventType] = {}; // the callback is registered
  subscriptions[eventType][id] = callback;
  return {
    unsubscribe: () => {
      delete subscriptions[eventType][id];
      if (Object.keys(subscriptions[eventType]).length === 0)
        delete subscriptions[eventType];
    },
  };
}

function publish(eventType, arg) {
  if (!subscriptions[eventType]) return;

  Object.keys(subscriptions[eventType]).forEach((id) =>
    subscriptions[eventType][id](arg)
  );
}

export default {
  subscribe,
  publish,
};
