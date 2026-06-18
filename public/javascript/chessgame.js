const socket = io();
const chess  = new Chess();

const boardEl   = document.getElementById("chessboard");
const roleBadge = document.getElementById("roleBadge");
const turnText  = document.getElementById("currentTurnText");
const halfMoves = document.getElementById("halfMoveCount");
const fullMoves = document.getElementById("fullMoveCount");
const checkAlert= document.getElementById("checkAlert");
const moveLogEl = document.getElementById("moveLog");
const whiteStatus = document.getElementById("whiteStatus");
const blackStatus = document.getElementById("blackStatus");
const whiteDot  = document.getElementById("whiteDot");
const blackDot  = document.getElementById("blackDot");
const whiteCard = document.getElementById("whitePlayerCard");
const blackCard = document.getElementById("blackPlayerCard");
const toastEl   = document.getElementById("toast");

let playerRole   = null;
let selectedSq   = null;   
let legalTargets = [];     
let lastMove     = null; 
let moveHistory  = [];     
let dragSrc      = null;   

const COLS = ["a","b","c","d","e","f","g","h"];

const PIECES = {
    w: { k:"♔", q:"♕", r:"♖", b:"♗", n:"♘", p:"♙" },
    b: { k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟" }
};

const toAlg  = (row, col) => `${COLS[col]}${8 - row}`;
const fromAlg = (sq) => ({ row: 8 - parseInt(sq[1]), col: COLS.indexOf(sq[0]) });

let toastTimer = null;
function showToast(msg, type = "") {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (type ? " toast-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = "toast"; }, 3000);
}

function updateLabels() {
    const ranksLeft = document.querySelector(".left-labels");
    const ranksRight = document.querySelector(".right-labels");
    const files = document.querySelector(".file-labels");

    if (playerRole === "b") {
        ranksLeft.innerHTML = `<span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>`;
        ranksRight.innerHTML = ranksLeft.innerHTML;
        files.innerHTML = `<span>h</span><span>g</span><span>f</span><span>e</span><span>d</span><span>c</span><span>b</span><span>a</span>`;
    } else {
        ranksLeft.innerHTML = `<span>8</span><span>7</span><span>6</span><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>`;
        ranksRight.innerHTML = ranksLeft.innerHTML;
        files.innerHTML = `<span>a</span><span>b</span><span>c</span><span>d</span><span>e</span><span>f</span><span>g</span><span>h</span>`;
    }
}

function updateStatus() {
    const t = chess.turn();
    whiteCard.classList.toggle("active-turn", t === "w");
    blackCard.classList.toggle("active-turn", t === "b");
    whiteDot.classList.toggle("active", t === "w");
    blackDot.classList.toggle("active", t === "b");
    turnText.textContent = t === "w" ? "White" : "Black";

    const parts = chess.fen().split(" ");
    halfMoves.textContent = parts[4] || "0";
    fullMoves.textContent = parts[5] || "1";

    checkAlert.style.display = chess.in_check() ? "block" : "none";

    if      (chess.in_checkmate()) showToast((t === "w" ? "Black" : "White") + " wins by checkmate!", "success");
    else if (chess.in_stalemate()) showToast("Draw — stalemate!", "");
    else if (chess.in_draw())      showToast("Draw!", "");
}

function rebuildLog() {
    moveHistory = [];
    const hist = chess.history({ verbose: true });
    hist.forEach(m => {
        if (m.color === "w") {
            moveHistory.push({ white: m.san, black: null });
        } else if (moveHistory.length > 0) {
            moveHistory[moveHistory.length - 1].black = m.san;
        }
    });
    renderLog();
}

function renderLog() {
    if (moveHistory.length === 0) {
        moveLogEl.innerHTML = '<span class="no-moves">No moves yet</span>';
        return;
    }
    moveLogEl.innerHTML = moveHistory.map((e, i) =>
        `<div class="move-entry">
            <span class="move-num">${i+1}.</span>
            <span class="move-w">${e.white}</span>
            ${e.black ? `<span class="move-b">${e.black}</span>` : ""}
        </div>`
    ).join("");
    moveLogEl.scrollTop = moveLogEl.scrollHeight;
}

function clearHighlights() {
    boardEl.querySelectorAll(".square").forEach(sq => {
        sq.classList.remove("sel", "legal-dot", "legal-cap", "last-move");
    });
}

function applyLastMove() {
    if (!lastMove) return;
    boardEl.querySelectorAll(".square").forEach(sq => {
        const alg = toAlg(+sq.dataset.row, +sq.dataset.col);
        if (alg === lastMove.from || alg === lastMove.to) sq.classList.add("last-move");
    });
}

function selectSquare(row, col) {
    clearHighlights();
    selectedSq = { row, col };
    const alg = toAlg(row, col);
    
    const verboseMoves = chess.moves({ square: alg, verbose: true });
    legalTargets = verboseMoves.map(m => m.to);

    const srcEl = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (srcEl) srcEl.classList.add("sel");

    verboseMoves.forEach(m => {
        const { row: dr, col: dc } = fromAlg(m.to);
        const el = boardEl.querySelector(`[data-row="${dr}"][data-col="${dc}"]`);
        if (el) {
            if (m.flags.includes('c') || m.flags.includes('e')) {
                el.classList.add("legal-cap");
            } else {
                el.classList.add("legal-dot");
            }
        }
    });

    applyLastMove();
}

function deselect() {
    clearHighlights();
    applyLastMove();
    selectedSq = null;
    legalTargets = [];
}

function sendMove(srcRow, srcCol, tgtRow, tgtCol) {
    const from = toAlg(srcRow, srcCol);
    const to   = toAlg(tgtRow, tgtCol);
    if (from === to) return;

    const move = { from, to };

    // Promotion logic
    const piece = chess.get(from);
    if (piece && piece.type === "p" && (tgtRow === 0 || tgtRow === 7)) {
        move.promotion = "q";
    }

    socket.emit("move", move);
}

function renderBoard() {
    const board = chess.board();
    boardEl.innerHTML = "";
    boardEl.classList.toggle("flipped", playerRole === "b");

    board.forEach((row, ri) => {
        row.forEach((sq, ci) => {
            const cell = document.createElement("div");
            cell.className = "square " + ((ri + ci) % 2 === 0 ? "light" : "dark");
            cell.dataset.row = ri;
            cell.dataset.col = ci;

            if (sq) {
                const piece = document.createElement("span");
                piece.className = "piece " + (sq.color === "w" ? "wpiece" : "bpiece");
                piece.textContent = PIECES[sq.color][sq.type];

                const canDrag = playerRole === sq.color && chess.turn() === sq.color;
                piece.draggable = canDrag;

                piece.addEventListener("dragstart", (e) => {
                    if (!canDrag) { e.preventDefault(); return; }
                    dragSrc = { row: ri, col: ci };
                    selectSquare(ri, ci);
                    e.dataTransfer.setData("text/plain", "");
                    e.dataTransfer.effectAllowed = "move";
                });

                piece.addEventListener("dragend", () => { dragSrc = null; });

                piece.addEventListener("click", (e) => {
                    e.stopPropagation();

                    if (selectedSq && legalTargets.includes(toAlg(ri, ci))) {
                        sendMove(selectedSq.row, selectedSq.col, ri, ci);
                        deselect();
                        return;
                    }

                    if (playerRole !== sq.color || chess.turn() !== sq.color) {
                        deselect();
                        return;
                    }

                    if (selectedSq && selectedSq.row === ri && selectedSq.col === ci) {
                        deselect();
                    } else {
                        selectSquare(ri, ci);
                    }
                });

                cell.appendChild(piece);
            }

            cell.addEventListener("click", () => {
                if (!selectedSq) return;
                const alg = toAlg(ri, ci);
                if (legalTargets.includes(alg)) {
                    sendMove(selectedSq.row, selectedSq.col, ri, ci);
                }
                deselect();
            });

            cell.addEventListener("dragover", (e) => e.preventDefault());

            cell.addEventListener("drop", (e) => {
                e.preventDefault();
                if (!dragSrc) return;
                sendMove(dragSrc.row, dragSrc.col, ri, ci);
                dragSrc = null;
                deselect();
            });

            boardEl.appendChild(cell);
        });
    });

    applyLastMove();
    updateStatus();
}

socket.on("connect", () => {
    roleBadge.textContent = "Connected";
});

socket.on("disconnect", () => {
    roleBadge.textContent = "Disconnected";
    roleBadge.className = "role-badge";
    showToast("Disconnected from server", "error");
});

socket.on("playerRole", (role) => {
    playerRole = role;
    roleBadge.textContent = role === "w" ? "▶ Playing White" : "▶ Playing Black";
    roleBadge.className = "role-badge " + (role === "w" ? "white" : "black");
    whiteStatus.textContent = role === "w" ? "You" : "Opponent";
    blackStatus.textContent = role === "b" ? "You" : "Opponent";
    showToast("You are " + (role === "w" ? "White ♔" : "Black ♚"), "success");
    
    updateLabels();
    renderBoard();
});

socket.on("spectatorRole", () => {
    playerRole = null;
    roleBadge.textContent = "Spectating";
    roleBadge.className = "role-badge spectator";
    whiteStatus.textContent = "Player";
    blackStatus.textContent = "Player";
    showToast("You are spectating");
    
    updateLabels();
    renderBoard();
});

socket.on("boardState", (fen) => {
    chess.load(fen);
    rebuildLog();
    deselect();
    renderBoard();
});

socket.on("move", (move) => {
    lastMove = { from: move.from, to: move.to };
});

socket.on("invalidMove", () => {
    showToast("Invalid move!", "error");
    deselect();
});

renderBoard();