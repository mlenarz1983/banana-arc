import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import type { ControllerCommand, ControllerStateSnapshot } from './types';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PEER_PREFIX = 'banana-arc-tv-';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function buildJoinUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code.toUpperCase());
  return url.toString();
}

export async function generateJoinQrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(buildJoinUrl(code), {
    margin: 1,
    width: 156,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

export interface HostCallbacks {
  onReady: (code: string, qrDataUrl: string) => void;
  onClientCountChange: (count: number) => void;
  onCommand: (cmd: ControllerCommand) => void;
  onError: (msg: string) => void;
}

/**
 * TV Display Host peer: creates a 4-letter room over WebRTC (PeerJS),
 * accepts 1+ phone/tablet remote controllers, broadcasts game state, and receives commands.
 */
export class TvDisplayHost {
  private peer: Peer | null = null;
  private connections = new Set<DataConnection>();
  private roomCode = '';
  private latestSnapshot: ControllerStateSnapshot | null = null;
  private callbacks: HostCallbacks;

  constructor(callbacks: HostCallbacks) {
    this.callbacks = callbacks;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  getClientCount(): number {
    return this.connections.size;
  }

  start(retriesLeft = 3): void {
    this.destroy();
    const code = generateRoomCode();
    this.roomCode = code;
    const peerId = `${PEER_PREFIX}${code}`;

    const peer = new Peer(peerId, { debug: 0 });
    this.peer = peer;

    peer.on('open', async () => {
      try {
        const qr = await generateJoinQrDataUrl(code);
        this.callbacks.onReady(code, qr);
      } catch {
        this.callbacks.onReady(code, '');
      }
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.connections.add(conn);
        this.callbacks.onClientCountChange(this.connections.size);
        if (this.latestSnapshot) {
          conn.send(this.latestSnapshot);
        }
      });

      conn.on('data', (raw) => {
        if (raw && typeof raw === 'object' && 'type' in raw) {
          this.callbacks.onCommand(raw as ControllerCommand);
        }
      });

      const cleanup = () => {
        this.connections.delete(conn);
        this.callbacks.onClientCountChange(this.connections.size);
      };
      conn.on('close', cleanup);
      conn.on('error', cleanup);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && retriesLeft > 0) {
        this.start(retriesLeft - 1);
        return;
      }
      this.callbacks.onError(
        err.type === 'network' || err.type === 'server-error'
          ? 'Could not reach room server — check Wi-Fi or play directly on this screen.'
          : `Room error (${err.type}). Try starting TV display mode again.`,
      );
    });
  }

  broadcast(snapshot: ControllerStateSnapshot): void {
    this.latestSnapshot = snapshot;
    for (const conn of this.connections) {
      if (conn.open) {
        try {
          conn.send(snapshot);
        } catch {
          // Ignore transient send error
        }
      }
    }
  }

  destroy(): void {
    for (const conn of this.connections) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    this.callbacks.onClientCountChange(0);
  }
}

export interface ControllerCallbacks {
  onStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string) => void;
  onState: (snapshot: ControllerStateSnapshot) => void;
}

/**
 * Phone / Tablet Remote Controller peer: connects to a TV Display room code
 * and sends touch-friendly aiming, movement, mirror, and throw commands.
 */
export class RemoteController {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private callbacks: ControllerCallbacks;

  constructor(callbacks: ControllerCallbacks) {
    this.callbacks = callbacks;
  }

  connect(rawCode: string): void {
    this.destroy();
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) {
      this.callbacks.onStatus('error', 'Enter a 4-letter room code from the TV.');
      return;
    }

    this.callbacks.onStatus('connecting', `Connecting to room ${code}...`);
    const peer = new Peer({ debug: 0 });
    this.peer = peer;

    peer.on('open', () => {
      const conn = peer.connect(`${PEER_PREFIX}${code}`, { reliable: true });
      this.conn = conn;

      conn.on('open', () => {
        this.callbacks.onStatus('connected', `Connected · Room ${code}`);
        conn.send({ type: 'hello' } satisfies ControllerCommand);
      });

      conn.on('data', (raw) => {
        if (raw && typeof raw === 'object' && (raw as { type?: string }).type === 'state') {
          this.callbacks.onState(raw as ControllerStateSnapshot);
        }
      });

      conn.on('close', () => {
        this.callbacks.onStatus('disconnected', 'Disconnected from TV.');
      });

      conn.on('error', () => {
        this.callbacks.onStatus('error', `Could not connect to room ${code}. Check the code on the TV.`);
      });
    });

    peer.on('error', (err) => {
      this.callbacks.onStatus(
        'error',
        err.type === 'peer-unavailable'
          ? `Room ${code} was not found. Make sure TV Display Mode is open.`
          : `Connection error (${err.type}). Check Wi-Fi and try again.`,
      );
    });
  }

  send(cmd: ControllerCommand): void {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(cmd);
      } catch {
        // ignore
      }
    }
  }

  destroy(): void {
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // ignore
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
  }
}
