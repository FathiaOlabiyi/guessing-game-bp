const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.score = 0;
    this.guesses = 3;
  }
}

class GameSession {
  constructor(players = [], isStarted = false, question = null, answer = null, timer = null, countdown = null) {
    this.players = players;
    this.gameMasterIndex = 0;
    this.isStarted = isStarted;
    this.question = question;
    this.answer = answer;
    this.timer = timer;
    this.countdown = countdown;
    this.timeLimit = 60;
    this.timeRemaining = 0;
  }

  addPlayer(player) {
    this.players.push(player);
  }
  removePlayer(id) {
    this.players = this.players.filter((player) =>
      player.id !== id);
  }
  getPlayer(id) {
    return this.players.find((player) => player.id === id);
  }
  getGameMaster() {
    return this.players[this.gameMasterIndex];
  }

  nextMaster() {
    if (this.players.length === 0) {
      return
    }
    this.gameMasterIndex++;

    if(this.gameMasterIndex >= this.players.length) {
      this.gameMasterIndex = 0;
      }
  }

  resetGuesses() {
    this.players.forEach((player) => {
        player.guesses = 3
      })
  }

  finishedGuesses() {
    return this.players.every((player) => {
      player.guesses <= 0 || !player})
  }

  clearTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.countdown) {
      clearInterval(this.countdown);
      this.countdown = null;
    }
    this.timeRemaining = 0;
  }

  gameRoundOver() {
    this.isStarted = false;
    this.question = null;
    this.answer = null;
    this.clearTimers();
  }
}

const session = new GameSession();


function emitPlayerList() {
  const playerInfo = session.players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    guesses: player.guesses,
  }));

  io.emit("updatePlayers", {
    players: playerInfo,
    gameMasterId: session.getGameMaster() ? session.getGameMaster().id : null,
  });
}

io.on("connection", (socket) => {
  console.log(`user ${socket.id} has connected`);

  socket.on("joinGame", (name) => {
    if (!name) {
      return
    }
    const player = new Player(socket.id, name.trim());

    session.addPlayer(player);
    emitPlayerList();

    io.emit("message", `${player.name} joined the game`);
 
    if (session.players.length === 1) {
      io.to(player.id).emit("youAreMaster");
    }
  });

  socket.on("createQuestion", ({ question, answer }) => {
    const gameMaster = session.getGameMaster();
    if (!gameMaster || socket.id !== gameMaster.id) {
      socket.emit("message", "Only the Game Master can set a question");
      return;
    }
    if (session.isStarted) {
      socket.emit("message", "Cannot set question while game is running");
      return;
    }
    if (!question || !answer) {
      socket.emit("message", "Question and answer are required");
      return;
    }
    session.question = question;
    session.answer = answer.toLowerCase();
    io.emit("message", "Game master created a question");
    emitPlayerList();
  });

  socket.on("startGame", ({ timeLimit }) => {
    const gameMaster = session.getGameMaster();
    if (!gameMaster || socket.id !== gameMaster.id) {
      socket.emit("message", "Only the game master can start the game");
      return;
    }
    if (session.isStarted) return;
    if (session.players.length < 3) {
      socket.emit("message", "To start game, at least 3 players are needed");
      return;
    }
    if (!session.question || !session.answer) {
      socket.emit("message", "Set a question before starting");
      return;
    }
    const time = Number(timeLimit) > 0 ? Number(timeLimit) : session.timeLimit;
    session.timeLimit = time;
    session.timeRemaining = time;

    // Start game
    session.isStarted = true;
    session.resetGuesses();
    emitPlayerList();

    io.emit("gameStarted", {
      question: session.question,
      timeLimit: session.timeLimit,
      gameMasterId: gameMaster.id,
      gameMasterName: gameMaster.name,
    });

    // countdown
    session.countdown = setInterval(() => {
      session.timeRemaining = Math.max(0, session.timeRemaining - 1);
      io.emit("tick", session.timeRemaining);
    }, 1000);

    session.timer = setTimeout(() => {
      session.clearTimers();
      io.emit("message", "Time is up! No winner.");
      io.emit("revealAnswer", session.answer);
      session.gameRoundOver();
   
      //next player
      if (session.players.length > 0) {
        session.nextMaster();
      }
      emitPlayerList();
      io.emit("newMaster", {
        gameMasterId: session.getGameMaster() ? session.getGameMaster().id : null,
        gameMasterName: session.getGameMaster() ? session.getGameMaster().name : null,
      });
    }, session.timeLimit * 1000);
  });

  socket.on("submitAnswer", (guess) => {
    if (!session.isStarted)
      return socket.emit("message", "Game has not started");
    const player = session.getPlayer(socket.id);
    const master = session.getGameMaster();
    if (!player) return socket.emit("message", "You are not in the game.");
  

    if (master && master.id === socket.id) {
      return socket.emit("message", "Game master cannot guess the answer.");
    }
    if (player.guesses <= 0) {
      return socket.emit("message", "You have no attempts left.");
    }
    player.guesses = Math.max(0, player.guesses - 1);
    emitPlayerList();

    if (typeof guess !== "string") {
      guess = "";
    }
    if (guess.trim().toLowerCase() === session.answer) {
      // correct
      player.score += 10;
      session.clearTimers();
      io.emit("message", `${player.name} guessed correctly!`);
      io.emit("winner", {
        name: player.name,
        answer: session.answer,
        scores: session.players.map((player) => ({ name: player.name, score: player.score })),
      });
      session.gameRoundOver();

      if (session.players.length > 0) session.nextMaster();
      emitPlayerList();
      io.emit("newMaster", {
        gameMasterId: session.getGameMaster() ? session.getGameMaster().id : null,
        gameMasterName: session.getGameMaster() ? session.getGameMaster().name : null,
      });
      return;
    } else {
      socket.emit("message", `Wrong. Guesses left: ${player.guesses}`);

      const otherPlayers = session.players.filter(
        (player) => player.id !== (session.getGameMaster() ? session.getGameMaster().id : null)
      );
      const allOut = otherPlayers.every((player) => player.guesses <= 0);
      if (allOut) {
        session.clearTimers();
        io.emit("message", "All players have exhausted guesses. Game over.");
        io.emit("revealAnswer", session.answer);
        session.gameRoundOver();
        if (session.players.length > 0) {
          session.nextMaster()
        };
        emitPlayerList();
        io.emit("newMaster", {
          gameMasterId: session.getGameMaster() ? session.getGameMaster().id : null,
          gameMasterName: session.getGameMaster() ? session.getGameMaster().name : null,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    const player = session.getPlayer(socket.id);
    if (player) {
      io.emit("message", `${player.name} has left the game`);
      session.removePlayer(socket.id);

      if (session.players.length === 0) {
        session.gameRoundOver();
        console.log("Session cleared, there are no players");
      } else {
        if (session.gameMasterIndex >= session.players.length)
          session.gameMasterIndex = 0;
        emitPlayerList();
      }
    }
  });

  socket.on("requestState", () => {
    emitPlayerList();
    if (session.isStarted) {
      io.to(socket.id).emit("gameStarted", {
        question: session.question,
        timeLimit: session.timeLimit,
        gameMasterId: session.getGameMaster() ? session.getGameMaster().id : null,
        gameMasterName: session.getGameMaster() ? session.getGameMaster().name : null,
      });
      io.to(socket.id).emit("tick", session.timeRemaining);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
