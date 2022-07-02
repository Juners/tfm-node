import cookieParser from "cookie-parser";
import express, { json } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import {
  updateBoard,
  initializeDb,
  readDb,
  writeDb,
  createBoard,
} from "./db.js";
import EventBus from "./EventBus.js";
import { getLocalIp } from "./ip.js";

const app = express();
app.use(json());
app.use(cookieParser());
app.use(cors());

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500);
  res.json({});
});

const httpServer = createServer(app);
const localIp = getLocalIp();
const io = new Server(httpServer, {
  cors: {
    origin: `http://${localIp}:3000`,
  },
});

var port = 3001;

// app.use(static('.'));

app.get("/currentGeneration", async function (_req, res) {
  const gen = await readDb("generation");
  res.status(200).json(gen);
});

app.get("/boards", async function (_req, res) {
  const data = await readDb("boards");
  if (data) {
    const nonEmptyBoards = Object.entries(data || {}).filter(
      ([_k, v]) => Object.keys(v).length
    );
    res.status(200).json(Object.fromEntries(nonEmptyBoards));
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.get("/users/:user/board", async function (req, res) {
  const data = await readDb("boards", req.params.user);
  if (data) {
    res.status(200).json(data);
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.post("/users/:user/board", async function (req, res) {
  const board = req.body;
  const updated = await updateBoard(req.params.user, board);

  if (!updated) {
    res.status(404).json({ error: "User not found" });
  } else {
    EventBus.publish("boardUpdated", { user: req.params.user });
    const updatedBoard = await readDb("boards", req.params.user);
    res.status(200).json(updatedBoard);
  }
});

app.put("/users/:user/board", async function (req, res) {
  const board = req.body;
  const updated = await createBoard(req.params.user, board);

  if (!updated) {
    res.status(409).json({ error: "Board already exists" });
  } else {
    const newBoard = await readDb("boards", req.params.user);
    res.status(201).json(newBoard);
  }
});

app.put("/users/:user/board/simple", async function (req, res) {
  const board = req.body;
  const updated = await createBoard(req.params.user, board);

  if (!updated) {
    res.status(409).json({ error: "Board already exists" });
  } else {
    const newBoard = await readDb("boards", req.params.user);
    res.status(201).json(newBoard);
  }
});

app.patch("/users/:user/board", async function (req, res) {
  const updatedFields = req.body;

  const board = await readDb("boards", req.params.user);
  const updated = await updateBoard(req.params.user, {
    ...board,
    ...updatedFields,
  });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
  } else {
    const gen = await readDb("generation");
    EventBus.publish("boardUpdated", { user: req.params.user });
    const updatedBoard = await readDb("boards", req.params.user);
    res.status(200).json(updatedBoard);
  }
});

app.post("/users/:user/board/finishGen", async function (req, res) {
  const board = await readDb("boards", req.params.user);
  const updated = await updateBoard(req.params.user, {
    ...board,
    doneGen: true,
  });

  EventBus.publish("playerFinishedGen");

  if (!updated) {
    res.status(404).json({ error: "User not found" });
  } else {
    EventBus.publish("boardUpdated", { user: req.params.user });
    const updatedBoard = await readDb("boards", req.params.user);
    res.status(200).json(updatedBoard);
  }
});

app.post("/users/:user/board/endTurn", async function (req, res) {
  const user = req.params.user;
  const boards = Object.entries(await readDb("boards"));

  // The user who finished the turn
  const currentIndx = boards.findIndex(([k]) => k === user);

  // The user which owns the turn now
  let newIndx;
  // We start checking the immedate next player on order
  let i = currentIndx + 1 < boards.length ? currentIndx + 1 : 0;
  let loops = 0;
  do {
    const player = boards[i][0];
    if (!player.doneGen) newIndx = i;
    i = i + 1 < boards.length ? i + 1 : 0;
  } while (i !== currentIndx && !newIndx && ++loops < 20);

  // Now we update everything together
  const newTurnUser = boards[newIndx][0];
  const didUpdatedNewTurn = await updateBoard(newTurnUser, {
    ...boards[newIndx !== undefined ? newIndx : currentIndx][1],
    ownTurn: true,
  });
  const didUpdatedUserBoard = await updateBoard(user, {
    ...boards[currentIndx][1],
    ownTurn: false,
  });

  EventBus.publish("playerFinishedTurn");
  EventBus.publish("playerStartTurn", newTurnUser);

  if (!didUpdatedUserBoard || !didUpdatedNewTurn) {
    res.status(404).json({ error: "User not found" });
  } else {
    EventBus.publish("boardUpdated", { user: user });
    EventBus.publish("boardUpdated", { user: newTurnUser });
    const updatedBoard = await readDb("boards", user);
    res.status(200).json(updatedBoard);
  }
});

EventBus.subscribe("playerFinishedGen", () => {
  async function checkAllFinished() {
    const data = await readDb("boards");

    const nonEmptyBoards = Object.entries(data || {}).filter(
      ([_k, v]) => Object.keys(v).length
    );

    const allFinished = !nonEmptyBoards.find(([_k, board]) => !board.doneGen);
    if (allFinished) {
      const newBoards = nonEmptyBoards.map(([k, board]) => {
        if (!board.simpleBoard) {
          const { TERRAFORMATION, MONEY, TITANIUM, PLANTS, ENERGY, HEAT } =
            board;

          MONEY.ammount += TERRAFORMATION.ammount + MONEY.generation;
          TITANIUM.ammount += TITANIUM.generation;
          PLANTS.ammount += PLANTS.generation;

          const energyHeatGain = ENERGY.ammount;
          ENERGY.ammount = ENERGY.generation;
          HEAT.ammount += energyHeatGain + HEAT.generation;
        }

        board.doneGen = false;

        return [k, board];
      });

      await writeDb(Object.fromEntries(newBoards), "boards");
      const gen = await readDb("generation");
      const newGen = await writeDb(gen + 1, "generation");

      EventBus.publish("generationEnded", { generation: newGen });
    }
  }
  checkAllFinished();
});

io.on("connection", function (client) {
  console.log("Client connected");

  EventBus.subscribe("boardUpdated", (data) => {
    client.emit("boardUpdated", { data });
  });

  EventBus.subscribe("generationEnded", (data) => {
    client.emit("newGeneration", { data });
  });
});

httpServer.listen(port);
console.log("\n\x1b[36m%s\x1b[0m", "App listening on port " + port);
console.log("\x1b[35m%s\x1b[0m\n", "App deployed on local IP: " + localIp);

initializeDb();
