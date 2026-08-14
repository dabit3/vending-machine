"""Local WebSocket relay for Tetris VS matches.

Groups connecting clients into rooms of ROOM_SIZE and relays messages between
peers, tagging each forwarded message with the sender's player id.

Usage:
    pip install websockets
    python relay.py [port] [room_size]
"""
import asyncio
import json
import sys

import websockets

ROOM_SIZE = 3

waiting = []
rooms = {}  # ws -> (room_id, player_id)
room_members = {}  # room_id -> {player_id: ws}
next_room_id = 0


async def handler(ws):
    global next_room_id
    waiting.append(ws)
    await ws.send(json.dumps({"type": "waiting"}))
    if len(waiting) >= ROOM_SIZE:
        members = {i: waiting.pop(0) for i in range(ROOM_SIZE)}
        room_id = next_room_id
        next_room_id += 1
        room_members[room_id] = members
        for pid, sock in members.items():
            rooms[sock] = (room_id, pid)
        for pid, sock in members.items():
            peers = [i for i in members if i != pid]
            try:
                await sock.send(json.dumps({"type": "matched", "you": pid, "peers": peers}))
            except websockets.ConnectionClosed:
                pass  # handler's finally block broadcasts opponentLeft for this pid
    try:
        async for message in ws:
            if ws not in rooms:
                continue
            room_id, pid = rooms[ws]
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            payload["from"] = pid
            text = json.dumps(payload)
            for other_pid, sock in room_members.get(room_id, {}).items():
                if other_pid != pid:
                    try:
                        await sock.send(text)
                    except websockets.ConnectionClosed:
                        pass
    except websockets.ConnectionClosed:
        pass
    finally:
        if ws in waiting:
            waiting.remove(ws)
        if ws in rooms:
            room_id, pid = rooms.pop(ws)
            members = room_members.get(room_id, {})
            members.pop(pid, None)
            for sock in members.values():
                try:
                    await sock.send(json.dumps({"type": "opponentLeft", "from": pid}))
                except websockets.ConnectionClosed:
                    pass
            if not members:
                room_members.pop(room_id, None)


async def main(port):
    async with websockets.serve(handler, "127.0.0.1", port):
        print(f"Tetris relay listening on ws://127.0.0.1:{port} (rooms of {ROOM_SIZE})")
        await asyncio.Future()


if __name__ == "__main__":
    if len(sys.argv) > 2:
        ROOM_SIZE = int(sys.argv[2])
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 8765))
