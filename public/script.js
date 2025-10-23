const socket = io();

const messagesEl = document.getElementById("messages");
const timeLeftEl = document.getElementById("timeLeft");
const inputName = document.getElementById("inputName");
const joinBtn = document.getElementById("joinBtn");
const gameMasterEl = document.getElementById("gameMaster");
const questionsEl = document.getElementById("question");
const answersEl = document.getElementById("answer");
const timeLimitEl = document.getElementById("timeLimit");
const createBtn = document.getElementById("createQuestionBtn");
const startBtn = document.getElementById("startGameBtn");

const playersEl = document.getElementById("players");
const guessEl = document.getElementById("guess");
const submitGuessBtn = document.getElementById("submitGuess");

const playersList = document.getElementById("playersList");

let playerId;
let playerName;
let currentMasterId;


const addMessage = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

joinBtn.addEventListener("click", () => {
  const name = inputName.value
  if (!name) { 
    return alert("Enter a name")}
  playerName = name;
  socket.emit("joinGame", name);
  inputName.disabled = true;
  joinBtn.disabled = true;
});

createQuestionBtn.addEventListener("click", () => {
  const questions = questionsEl.value
  const answers = answersEl.value
  if (!questions || !answers) {
    return alert("Enter question and answer")
  }
  socket.emit("createQuestion", { question: questions, answer: answers });
  addMessage("A question has been created");
});

startBtn.addEventListener("click", () => {
  const time = Number(timeLimitEl.value) || undefined;
  socket.emit("startGame", { timeLimit: time });
});

submitGuessBtn.addEventListener("click", () => {
  const guess = (guessEl.value || "").trim();
  if (!guess) return;
  socket.emit("submitAnswer", guess);
  guessEl.value = "";
});


socket.on("connect", () => {
  playerId = socket.id;
});

socket.on("message", (msg) => addMessage(msg));

socket.on("youAreMaster", () => {
  currentMasterId = playerId;
  gameMasterEl.classList.remove("hidden");
  playersEl.classList.add("hidden");
  addMessage("You are now the game master");
});

socket.on("updatePlayers", ({ players, gameMasterId }) => {
  currentMasterId = gameMasterId;
  playersList.innerHTML =
    `<strong>Players: (${players.length})</strong><br>` +
    players
      .map((player) => {
        const meMark = player.id === playerId ? " (you)" : "";
        const masterMark = player.id === gameMasterId ? " [master]" : "";
        return `${player.name || player.id}${meMark}${masterMark} : ${
          player.score
        } points  <br><b>Guesses left</b>: ${player.guesses}`;
      })
      .join("<br>");

  if (playerId === gameMasterId) {
    gameMasterEl.classList.remove("hidden");
    playersEl.classList.add("hidden");
  } else {
    gameMasterEl.classList.add("hidden");
  }
});

socket.on("gameStarted", ({ question, timeLimit, gameMasterId, gameMasterName }) => {
  addMessage(`Game started by ${gameMasterName}. Question: ${question}`);

  if (playerId !== gameMasterId) {
   playersEl.classList.remove("hidden");
  } else {
   playersEl.classList.add("hidden"); // master cannot guess
  }

  timeLeftEl.textContent = timeLimit;
});

socket.on("tick", (timeRemaining) => {
  timeLeftEl.textContent = timeRemaining;
});

socket.on("revealAnswer", (answer) => {
  addMessage(`Answer: ${answer}`);
  playersEl.classList.add("hidden");
});

socket.on("winner", ({ name, answer, scores }) => {
  addMessage(`${name} won! Answer: ${answer}`);
  playersEl.classList.add("hidden");

  if (scores && Array.isArray(scores)) {
    playersList.innerHTML =
      `<strong>Scores:</strong><br>` +
      scores.map((s) => `${s.name}: ${s.score}`).join("<br>");
  }
});

socket.on("newMaster", ({ gameMasterId, gameMasterName }) => {
  addMessage(`New master: ${gameMasterName}`);
  currentMasterId = gameMasterId;

  if (playerId === gameMasterId) {
    gameMasterEl.classList.remove("hidden");
    playersEl.classList.add("hidden");
  } else {
    gameMasterEl.classList.add("hidden");
  }
});
