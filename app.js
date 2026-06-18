const express   = require('express');
const http      = require('http');
const path      = require('path');
const { Server }= require('socket.io');
const { Chess } = require('chess.js');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

let chess   = new Chess();
const players = {}; 

app.get('/', (req, res) => res.render('index'));

io.on('connection', (socket) => {
    console.log(`[+] ${socket.id}`);

    if (!players.white) {
        players.white = socket.id;
        socket.emit('playerRole', 'w');
    } else if (!players.black) {
        players.black = socket.id;
        socket.emit('playerRole', 'b');
    } else {
        socket.emit('spectatorRole');
    }

    socket.emit('boardState', chess.fen());

    socket.on('move', (move) => {
        if (chess.turn() === 'w' && socket.id !== players.white) return;
        if (chess.turn() === 'b' && socket.id !== players.black) return;

        if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') {
            socket.emit('invalidMove', move);
            return;
        }

        let result;
        try {
            result = chess.move(move);
        } catch (e) {
            result = null; 
        }

        if (result) {
            console.log(`  ${result.san}  (${result.from}→${result.to})`);
            io.emit('move', { from: result.from, to: result.to });
            io.emit('boardState', chess.fen());

            if (chess.isCheckmate()) console.log('  CHECKMATE');
            else if (chess.isDraw()) console.log('  DRAW'); 
        } else {
            console.log(`  INVALID: ${JSON.stringify(move)}`);
            socket.emit('invalidMove', move);
        }
    });

    socket.on('disconnect', () => {
        if (socket.id === players.white)      delete players.white;
        else if (socket.id === players.black) delete players.black;
        console.log(`[-] ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));