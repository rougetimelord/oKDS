const form = document.querySelector("#create-card-form");
const dialog = document.querySelector("#create-card-dialog");
const addCardButton = document.querySelector(".add-card-button");
const closeDialogButton = document.querySelector(".dialog-close");
const board = document.querySelector(".card-list");
const rail = document.querySelector(".card-rail");
const cardCount = document.querySelector(".card-count");
const cardTimers = new WeakMap();
const storageKey = "okds-tickets";
const storageStatus = document.createElement("p");
const dropIndicator = document.createElement("div");
let draggedCard = null;
let activeTimerCard = null;

storageStatus.className = "storage-status";
storageStatus.setAttribute("role", "alert");
storageStatus.hidden = true;
cardCount.after(storageStatus);

dropIndicator.className = "drop-indicator";
dropIndicator.setAttribute("aria-hidden", "true");
rail.append(dropIndicator);

function updateCardCount() {
  const count = board.querySelectorAll(".card").length;
  cardCount.textContent = `${count} ${count === 1 ? "ticket" : "tickets"}`;
}

function scrollRailToEnd(behavior = "auto") {
  rail.scrollTo({ left: rail.scrollWidth, behavior });
}

function showStorageError(message, error) {
  console.error(message, error);
  storageStatus.textContent = message;
  storageStatus.hidden = false;
}

function saveTickets() {
  const tickets = [...board.querySelectorAll(".card")].map((card) => {
    const timer = cardTimers.get(card);
    return {
      title: card.querySelector("h3").textContent,
      description: card.querySelector(".card-description")?.textContent ?? "",
      estimatedTimeMs: timer.estimatedTimeMs,
      remaining: timer.remaining,
      startedAt: timer.startedAt,
      finished: timer.finished,
    };
  });

  try {
    localStorage.setItem(storageKey, JSON.stringify(tickets));
    storageStatus.hidden = true;
  } catch (error) {
    showStorageError("Could not save tickets in this browser.", error);
  }
}

addCardButton.addEventListener("click", () => {
  dialog.showModal();
  form.elements.title.focus();
});

closeDialogButton.addEventListener("click", () => {
  dialog.close();
});

dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  dialog.close();
});

dialog.addEventListener("close", () => {
  addCardButton.focus();
});

form.elements.title.addEventListener("input", (event) => {
  event.currentTarget.setCustomValidity("");
});

function formatTime(milliseconds) {
  const isNegative = milliseconds < 0;
  const totalSeconds = Math.ceil(Math.abs(milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${isNegative ? "-" : ""}${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderTimer(card) {
  const timer = cardTimers.get(card);
  const remaining = getRemainingTime(timer);
  const active = timer.startedAt !== null;
  const button = card.querySelector(".timer-button");
  const title = card.querySelector("h3").textContent;
  const finishButton = card.querySelector(".finish-button");
  const timerDisplay = card.querySelector(".timer-display");

  const displayTime = timer.finished ? timer.estimatedTimeMs - remaining : remaining;
  timerDisplay.textContent = formatTime(displayTime);
  timerDisplay.setAttribute("aria-label", timer.finished ? "Total time taken" : "Time remaining");
  card.classList.toggle("is-overdue", remaining < 0);
  card.classList.toggle("is-finished", timer.finished);
  button.textContent = timer.finished ? "×" : active ? "⏸" : "▶";
  button.classList.toggle("delete-button", timer.finished);
  button.setAttribute(
    "aria-label",
    timer.finished ? `Delete ${title}` : `${active ? "Pause" : "Start"} timer for ${title}`,
  );
  finishButton.textContent = timer.finished ? "↶" : "✓";
  finishButton.classList.toggle("undo-button", timer.finished);
  button.setAttribute(
    "aria-pressed",
    String(active),
  );
  finishButton.setAttribute(
    "aria-label",
    timer.finished ? `Undo finish for ${title}` : `Mark ${title} as finished`,
  );
}

function getRemainingTime(timer) {
  return timer.startedAt === null
    ? timer.remaining
    : timer.remaining - (Date.now() - timer.startedAt);
}

function pauseTimer(card) {
  const timer = cardTimers.get(card);
  if (!timer || timer.startedAt === null) {
    return;
  }

  timer.remaining = getRemainingTime(timer);
  timer.startedAt = null;
  window.clearInterval(timer.intervalId);
  timer.intervalId = null;
  renderTimer(card);
  if (activeTimerCard === card) {
    activeTimerCard = null;
  }
}

function toggleTimer(card) {
  const timer = cardTimers.get(card);
  if (!timer || timer.finished) {
    return;
  }

  if (timer.startedAt === null) {
    if (activeTimerCard && activeTimerCard !== card) {
      pauseTimer(activeTimerCard);
    }

    board.append(card);
    scrollRailToEnd("smooth");
    timer.startedAt = Date.now();
    timer.intervalId = window.setInterval(() => renderTimer(card), 200);
    activeTimerCard = card;
  } else {
    pauseTimer(card);
  }

  renderTimer(card);
  saveTickets();
}

function finishCard(card) {
  const timer = cardTimers.get(card);
  if (!timer || timer.finished) {
    return;
  }

  pauseTimer(card);

  timer.finished = true;
  renderTimer(card);
  saveTickets();
}

function undoFinish(card) {
  const timer = cardTimers.get(card);
  if (!timer || !timer.finished) {
    return;
  }

  timer.finished = false;
  renderTimer(card);
  saveTickets();
}

async function deleteCard(card, button) {
  const timer = cardTimers.get(card);
  if (!timer || !timer.finished || card.dataset.deleting === "true") {
    return;
  }

  card.dataset.deleting = "true";
  button.disabled = true;
  card.querySelector(".finish-button").disabled = true;
  let errorMessage = card.querySelector(".card-error");
  if (!errorMessage) {
    errorMessage = document.createElement("p");
    errorMessage.className = "card-error";
    errorMessage.setAttribute("role", "alert");
    card.append(errorMessage);
  }
  errorMessage.textContent = "";

  try {
    const response = await fetch("/api/deleted-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: card.querySelector("h3").textContent,
        description: card.querySelector(".card-description")?.textContent ?? "",
        estimatedTimeMs: timer.estimatedTimeMs,
        totalTimeTakenMs: timer.estimatedTimeMs - getRemainingTime(timer),
        timeRemainingMs: getRemainingTime(timer),
      }),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || `Server returned ${response.status}.`);
    }

    if (timer.intervalId !== null) {
      window.clearInterval(timer.intervalId);
    }
    if (activeTimerCard === card) {
      activeTimerCard = null;
    }
    card.remove();
    updateCardCount();
    saveTickets();
    (board.querySelector(".card .timer-button") ?? addCardButton).focus();
  } catch (error) {
    console.error("Failed to archive card before deletion:", error);
    errorMessage.textContent = `Could not save this card before deletion. ${error.message}`;
    button.disabled = false;
    card.querySelector(".finish-button").disabled = false;
    delete card.dataset.deleting;
  }
}

function createCard(title, description, estimate) {
  const card = document.createElement("article");
  card.className = "card";
  card.draggable = true;
  card.tabIndex = 0;
  const estimateLabel = `${estimate} ${estimate === 1 ? "minute" : "minutes"}`;
  card.setAttribute("aria-label", `${title}, estimated ${estimateLabel}`);

  const heading = document.createElement("h3");
  heading.textContent = title;
  card.append(heading);

  if (description) {
    const details = document.createElement("p");
    details.className = "card-description";
    details.textContent = description;
    card.append(details);
  }

  const time = document.createElement("span");
  time.className = "card-estimate";
  time.textContent = `${estimateLabel} estimated`;
  card.append(time);

  const timerPanel = document.createElement("div");
  timerPanel.className = "card-timer";

  const timerDisplay = document.createElement("span");
  timerDisplay.className = "timer-display";
  timerDisplay.setAttribute("role", "timer");
  timerDisplay.setAttribute("aria-label", "Time remaining");
  timerPanel.append(timerDisplay);

  const timerButton = document.createElement("button");
  timerButton.className = "timer-button";
  timerButton.type = "button";
  timerPanel.append(timerButton);

  const finishButton = document.createElement("button");
  finishButton.className = "finish-button";
  finishButton.type = "button";
  finishButton.textContent = "✓";
  timerPanel.append(finishButton);
  card.append(timerPanel);

  cardTimers.set(card, {
    remaining: estimate * 60 * 1000,
    estimatedTimeMs: estimate * 60 * 1000,
    startedAt: null,
    intervalId: null,
    finished: false,
  });
  renderTimer(card);

  return card;
}

function restoreTickets() {
  let tickets;
  try {
    const savedTickets = localStorage.getItem(storageKey);
    if (savedTickets === null) {
      return;
    }

    tickets = JSON.parse(savedTickets);
  } catch (error) {
    showStorageError("Could not load saved tickets from this browser.", error);
    return;
  }

  const isValidTicket = (ticket) => ticket
    && typeof ticket.title === "string"
    && ticket.title.trim().length > 0
    && ticket.title.length <= 100
    && typeof ticket.description === "string"
    && ticket.description.length <= 240
    && Number.isFinite(ticket.estimatedTimeMs)
    && ticket.estimatedTimeMs > 0
    && Number.isFinite(ticket.remaining)
    && (ticket.startedAt === null || Number.isFinite(ticket.startedAt))
    && typeof ticket.finished === "boolean"
    && !(ticket.finished && ticket.startedAt !== null);

  if (
    !Array.isArray(tickets)
    || !tickets.every(isValidTicket)
    || tickets.filter((ticket) => ticket.startedAt !== null).length > 1
  ) {
    showStorageError("Saved tickets are invalid and could not be loaded.", new Error("Invalid saved ticket data."));
    return;
  }

  let hadRunningTimer = false;
  for (const ticket of tickets) {
    const card = createCard(ticket.title, ticket.description, ticket.estimatedTimeMs / 60_000);
    const timer = cardTimers.get(card);
    timer.remaining = ticket.remaining;
    if (ticket.startedAt !== null) {
      timer.remaining -= Date.now() - ticket.startedAt;
      hadRunningTimer = true;
    }
    timer.finished = ticket.finished;
    renderTimer(card);
    board.append(card);
  }

  scrollRailToEnd();

  if (hadRunningTimer) {
    saveTickets();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const titleInput = form.elements.title;
  titleInput.value = titleInput.value.trim();
  titleInput.setCustomValidity(titleInput.value ? "" : "Please enter a title.");

  if (!form.reportValidity()) {
    return;
  }

  const formData = new FormData(form);
  const title = formData.get("title");
  const estimate = Number(formData.get("estimate"));

  if (!title || !Number.isFinite(estimate) || estimate <= 0) {
    return;
  }

  const description = formData.get("description").trim();
  const card = createCard(title, description, estimate);
  board.prepend(card);
  updateCardCount();
  saveTickets();
  scrollRailToEnd();
  form.reset();
  dialog.close();
});

board.addEventListener("dragstart", (event) => {
  if (event.target.closest(".timer-button, .finish-button")) {
    event.preventDefault();
    return;
  }

  const card = event.target.closest(".card");
  if (!card) {
    return;
  }

  draggedCard = card;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.querySelector("h3").textContent);
});

function getDropPosition(clientX) {
  const cards = [...board.querySelectorAll(".card")].filter((card) => card !== draggedCard);
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const bounds = card.getBoundingClientRect();
    if (clientX < bounds.left + bounds.width / 2) {
      const previousCard = cards[index - 1];
      const previousRight = previousCard?.getBoundingClientRect().right;
      return {
        card,
        after: false,
        edge: previousRight === undefined ? bounds.left : (previousRight + bounds.left) / 2,
      };
    }
  }

  const lastCard = cards.at(-1);
  const lastRight = lastCard?.getBoundingClientRect().right;
  return {
    card: lastCard ?? null,
    after: Boolean(lastCard),
    edge: lastRight === undefined ? board.getBoundingClientRect().left : lastRight + 10,
  };
}

function showDropIndicator(clientX) {
  const { edge } = getDropPosition(clientX);
  const railBounds = rail.getBoundingClientRect();
  dropIndicator.style.left = `${edge - railBounds.left + rail.scrollLeft}px`;
  dropIndicator.classList.add("is-visible");
}

function hideDropIndicator() {
  dropIndicator.classList.remove("is-visible");
}

board.addEventListener("dragend", () => {
  draggedCard?.classList.remove("is-dragging");
  draggedCard = null;
  board.classList.remove("is-drag-over");
  hideDropIndicator();
});

rail.addEventListener("dragover", (event) => {
  if (!draggedCard) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  board.classList.add("is-drag-over");
  showDropIndicator(event.clientX);
});

rail.addEventListener("drop", (event) => {
  if (!draggedCard) {
    return;
  }

  event.preventDefault();
  const { card: targetCard, after } = getDropPosition(event.clientX);
  if (targetCard) {
    board.insertBefore(draggedCard, after ? targetCard.nextElementSibling : targetCard);
  } else {
    board.append(draggedCard);
  }
  saveTickets();
  scrollRailToEnd();
  hideDropIndicator();
});

board.addEventListener("click", (event) => {
  const timerButton = event.target.closest(".timer-button");
  if (timerButton) {
    const card = timerButton.closest(".card");
    if (cardTimers.get(card).finished) {
      void deleteCard(card, timerButton);
    } else {
      toggleTimer(card);
    }
    return;
  }

  const finishButton = event.target.closest(".finish-button");
  if (finishButton) {
    const card = finishButton.closest(".card");
    if (cardTimers.get(card).finished) {
      undoFinish(card);
    } else {
      finishCard(card);
    }
  }
});

window.addEventListener("resize", () => scrollRailToEnd());

restoreTickets();
updateCardCount();
