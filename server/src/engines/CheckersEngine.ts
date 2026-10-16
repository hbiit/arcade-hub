import { BaseGameEngine } from './BaseGameEngine';
import { CHECKERS_CONFIG, PlayerInputPayload, PlayerSession } from '../../../shared/src';

export type PieceColor = 'cyan' | 'magenta';

export interface CheckerPiece {
  id: number;
  row: number;
  col: number;
  color: PieceColor;
  isKing: boolean;
}

export interface CheckersMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  jumpedPieceId?: number;
}

export interface CheckersEvent {
  id: string;
  type: 'move' | 'capture' | 'king' | 'win';
  text: string;
  fromRow?: number;
  fromCol?: number;
  toRow?: number;
  toCol?: number;
  color?: string;
  timestamp: number;
}

export interface CheckersState {
  boardSize: number;
  pieces: CheckerPiece[];
  currentTurn: PieceColor;
  selectedPieceId?: number;
  validMoves: CheckersMove[];
  capturedCyan: number;
  capturedMagenta: number;
  winner?: PieceColor;
  turnTimer: number;
  players: Record<string, { id: string; name: string; color: PieceColor; isBot: boolean }>;
  events: CheckersEvent[];
}

export class CheckersEngine extends BaseGameEngine<CheckersState> {
  private pieceIdCounter = 1;
  private botDelay = 0.8;

  initializeState(): CheckersState {
    const pieces: CheckerPiece[] = [];
    let id = 1;

    // Standard Checkers 8x8 Setup:
    // Magenta pieces on top 3 rows (0, 1, 2) on dark squares ((r + c) % 2 === 1)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          pieces.push({ id: id++, row: r, col: c, color: 'magenta', isKing: false });
        }
      }
    }

    // Cyan pieces on bottom 3 rows (5, 6, 7) on dark squares
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          pieces.push({ id: id++, row: r, col: c, color: 'cyan', isKing: false });
        }
      }
    }

    return {
      boardSize: CHECKERS_CONFIG.BOARD_SIZE,
      pieces,
      currentTurn: 'cyan',
      validMoves: [],
      capturedCyan: 0,
      capturedMagenta: 0,
      turnTimer: CHECKERS_CONFIG.TURN_TIME_SEC,
      players: {
        bot_grandmaster: {
          id: 'bot_grandmaster',
          name: '🤖 Deep-Neon AI',
          color: 'magenta',
          isBot: true
        }
      },
      events: []
    };
  }

  onPlayerJoined(player: PlayerSession): void {
    const socketId = player.socketId || 'local_player';
    this.state.players[socketId] = {
      id: socketId,
      name: player.profile.displayName,
      color: 'cyan',
      isBot: false
    };
  }

  onPlayerLeft(socketId: string): void {
    // cleanup
  }

  handleInput(socketId: string, input: PlayerInputPayload): void {
    if (this.state.winner) return;

    // Check player color
    const player = this.state.players[socketId] || Object.values(this.state.players).find(p => !p.isBot);
    if (!player || player.color !== this.state.currentTurn) return;

    if (input.action === 'select_piece') {
      const pieceId = Number((input as any).pieceId);
      const piece = this.state.pieces.find(p => p.id === pieceId && p.color === this.state.currentTurn);
      if (piece) {
        this.state.selectedPieceId = piece.id;
        this.state.validMoves = this.getValidMovesForPiece(piece);
      }
    } else if (input.action === 'make_move') {
      const { fromRow, fromCol, toRow, toCol } = input as any;
      const valid = this.state.validMoves.find(
        m => m.fromRow === fromRow && m.fromCol === fromCol && m.toRow === toRow && m.toCol === toCol
      );

      if (valid) {
        this.executeMove(valid);
      }
    }
  }

  private pushEvent(evt: CheckersEvent) {
    this.state.events.push(evt);
    if (this.state.events.length > 15) this.state.events.shift();
  }

  private getPieceAt(r: number, c: number): CheckerPiece | undefined {
    return this.state.pieces.find(p => p.row === r && p.col === c);
  }

  public getValidMovesForPiece(p: CheckerPiece): CheckersMove[] {
    const moves: CheckersMove[] = [];
    const forwardDir = p.color === 'cyan' ? -1 : 1; // Cyan moves UP (row - 1), Magenta moves DOWN (row + 1)
    const dirs: Array<[number, number]> = p.isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : [[forwardDir, -1], [forwardDir, 1]];

    // 1. Regular 1-step moves
    for (const [dr, dc] of dirs) {
      const nr = p.row + dr;
      const nc = p.col + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !this.getPieceAt(nr, nc)) {
        moves.push({ fromRow: p.row, fromCol: p.col, toRow: nr, toCol: nc });
      }
    }

    // 2. Jumps / Captures
    for (const [dr, dc] of dirs) {
      const midR = p.row + dr;
      const midC = p.col + dc;
      const destR = p.row + dr * 2;
      const destC = p.col + dc * 2;

      if (destR >= 0 && destR < 8 && destC >= 0 && destC < 8) {
        const midPiece = this.getPieceAt(midR, midC);
        const destPiece = this.getPieceAt(destR, destC);

        if (midPiece && midPiece.color !== p.color && !destPiece) {
          moves.push({
            fromRow: p.row,
            fromCol: p.col,
            toRow: destR,
            toCol: destC,
            jumpedPieceId: midPiece.id
          });
        }
      }
    }

    return moves;
  }

  private executeMove(move: CheckersMove) {
    const piece = this.getPieceAt(move.fromRow, move.fromCol);
    if (!piece) return;

    piece.row = move.toRow;
    piece.col = move.toCol;

    const now = Date.now();
    let captured = false;

    // Capture piece if jumped
    if (move.jumpedPieceId) {
      const jumpedIdx = this.state.pieces.findIndex(p => p.id === move.jumpedPieceId);
      if (jumpedIdx !== -1) {
        const jumped = this.state.pieces[jumpedIdx];
        if (jumped.color === 'cyan') this.state.capturedCyan += 1;
        else this.state.capturedMagenta += 1;
        this.state.pieces.splice(jumpedIdx, 1);
        captured = true;

        this.pushEvent({
          id: Math.random().toString(36),
          type: 'capture',
          text: `💥 CAPTURE!`,
          fromRow: move.fromRow,
          fromCol: move.fromCol,
          toRow: move.toRow,
          toCol: move.toCol,
          color: piece.color === 'cyan' ? '#00e5ff' : '#f43f5e',
          timestamp: now
        });
      }
    }

    // King Promotion Check
    if (!piece.isKing) {
      if ((piece.color === 'cyan' && piece.row === 0) || (piece.color === 'magenta' && piece.row === 7)) {
        piece.isKing = true;
        this.pushEvent({
          id: Math.random().toString(36),
          type: 'king',
          text: `👑 CROWNED KING!`,
          toRow: piece.row,
          toCol: piece.col,
          color: '#ffe600',
          timestamp: now
        });
      }
    }

    // Check multi-jump opportunity
    if (captured) {
      const jumps = this.getValidMovesForPiece(piece).filter(m => m.jumpedPieceId);
      if (jumps.length > 0) {
        this.state.selectedPieceId = piece.id;
        this.state.validMoves = jumps;
        return; // continue turn for chaining jump!
      }
    }

    // Reset selection and switch turn
    this.state.selectedPieceId = undefined;
    this.state.validMoves = [];
    this.state.currentTurn = this.state.currentTurn === 'cyan' ? 'magenta' : 'cyan';
    this.state.turnTimer = CHECKERS_CONFIG.TURN_TIME_SEC;
    this.botDelay = 0.7;

    // Check Win Condition
    const cyanLeft = this.state.pieces.filter(p => p.color === 'cyan').length;
    const magentaLeft = this.state.pieces.filter(p => p.color === 'magenta').length;

    if (cyanLeft === 0) {
      this.state.winner = 'magenta';
      this.pushEvent({
        id: Math.random().toString(36),
        type: 'win',
        text: '🏆 DEEP-NEON AI WINS!',
        color: '#f43f5e',
        timestamp: now
      });
    } else if (magentaLeft === 0) {
      this.state.winner = 'cyan';
      this.pushEvent({
        id: Math.random().toString(36),
        type: 'win',
        text: '🏆 VICTORY! YOU CLEARED THE BOARD!',
        color: '#00e5ff',
        timestamp: now
      });
    }
  }

  tick(deltaSeconds: number): void {
    if (this.state.winner) return;

    this.state.turnTimer -= deltaSeconds;
    if (this.state.turnTimer <= 0) {
      // Timeout switches turn
      this.state.currentTurn = this.state.currentTurn === 'cyan' ? 'magenta' : 'cyan';
      this.state.turnTimer = CHECKERS_CONFIG.TURN_TIME_SEC;
      this.state.selectedPieceId = undefined;
      this.state.validMoves = [];
      this.botDelay = 0.7;
    }

    // Bot AI Turn Execution (Magenta)
    if (this.state.currentTurn === 'magenta') {
      this.botDelay -= deltaSeconds;
      if (this.botDelay <= 0) {
        this.botDelay = 1.0;
        this.executeBotTurn();
      }
    }

    if (typeof this.onStateUpdate === 'function') {
      this.onStateUpdate(this.state);
    }
  }

  private executeBotTurn() {
    const magentaPieces = this.state.pieces.filter(p => p.color === 'magenta');
    let allMoves: Array<{ piece: CheckerPiece; move: CheckersMove }> = [];

    for (const piece of magentaPieces) {
      const moves = this.getValidMovesForPiece(piece);
      for (const move of moves) {
        allMoves.push({ piece, move });
      }
    }

    if (allMoves.length === 0) {
      this.state.winner = 'cyan';
      return;
    }

    // Prioritize captures > king promotions > center advances
    const captures = allMoves.filter(m => m.move.jumpedPieceId);
    if (captures.length > 0) {
      const chosen = captures[Math.floor(Math.random() * captures.length)];
      this.executeMove(chosen.move);
    } else {
      // Advance forward
      allMoves.sort((a, b) => b.move.toRow - a.move.toRow);
      const chosen = allMoves[0];
      this.executeMove(chosen.move);
    }
  }
}
